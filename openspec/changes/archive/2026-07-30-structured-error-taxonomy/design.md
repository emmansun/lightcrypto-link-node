## Context

当前解密路径（`lclCryptoPlugin.decryptSubDoc` → `KeyVaultService.getDekByVersion` → `FieldCryptoService.decryptField`）中所有错误均为裸 `Error` 或统一的 `DecryptionError`。调用方无法通过 `instanceof` 或 `error.code` 做分类处理。错误消息中缺少结构化上下文，批量查询中一条失败导致全部结果丢失且难以定位。

此外，`KeyVaultService._ensureCached()` 内部调用 `ensureVaultInitialized()`（含 `VaultStore.save()` 写操作），使得解密路径具有创建 vault 的副作用。当密文损坏导致 namespace 乱码时，会在存储中留下垃圾 vault 文档。

项目无后向兼容约束，可以采用全新错误层次（方案 B）。

## Goals / Non-Goals

**Goals:**
- 引入 `LclCryptoError` 基类 + 5 个子类，覆盖解密路径所有故障模式
- 每个错误携带结构化上下文（namespace, dekVersion, kid, fieldName, cause）
- 解密路径纯只读化：vault 不存在 → throw，不创建
- 解密失败时通过 EventBus 发出结构化事件（按安全等级分 tier）
- 保持加密路径行为不变（仍可自动创建 vault）

**Non-Goals:**
- 批量容错策略（`onError: skip/collect`）——留后续变更
- 降级字段值策略（null / 哨兵值 / 保留原始 subDoc）
- 加密路径的错误分类（本次聚焦解密）
- 错误国际化（i18n）

## Decisions

### D1: 错误类层次结构

```
LclCryptoError (extends Error)
│  .code: string          — 机器可读标识 (e.g. 'ERR_LCL_PAYLOAD_CORRUPTION')
│  .namespace?: string
│  .dekVersion?: number
│  .kid?: string
│  .fieldName?: string
│  .cause?: Error         — 原始底层错误
│
├── PayloadCorruptionError      code: 'ERR_LCL_PAYLOAD_CORRUPTION'
│   "密文结构无法解析"
│   额外: .blobLength?, .expectedMinLength?
│
├── KeyResolutionError          code: 'ERR_LCL_KEY_RESOLUTION'
│   "找不到解密密钥"
│   额外: .vaultExists (boolean)
│
├── CryptoAuthenticationError   code: 'ERR_LCL_CRYPTO_AUTH'
│   "密钥校验失败（auth tag / padding）"
│
├── SchemaDriftError            code: 'ERR_LCL_SCHEMA_DRIFT'
│   "解密成功但类型反序列化失败"
│   额外: .typeMarker, .rawBytes (Buffer)
│
└── UnsupportedAlgorithmError   code: 'ERR_LCL_UNSUPPORTED_ALGORITHM'
    "算法未注册"
    额外: .algorithm
```

**Rationale**: 继承层次允许 `catch (LclCryptoError)` 统一兜底，也允许 `catch (CryptoAuthenticationError)` 精确处理。`.code` 字段支持日志聚合和跨语言对齐（Java 侧可用相同 code）。

**Alternative considered**: 单一 Error + `.code` 字段（无继承）。放弃原因：无法利用 `instanceof` 做分支处理，TypeScript 用户无法 narrowing。

### D2: 错误模块位置

新建 `src/error/` 目录：

```
src/error/
├── LclCryptoError.js           — 基类
├── PayloadCorruptionError.js
├── KeyResolutionError.js
├── CryptoAuthenticationError.js
├── SchemaDriftError.js
├── UnsupportedAlgorithmError.js
└── index.js                    — 统一导出
```

**Rationale**: 独立模块避免循环依赖（format → error ← service ← plugin）。每个类一个文件便于 tree-shaking 和 JSDoc。

### D3: _ensureCached 拆分策略

```javascript
// 加密路径（getActiveKeyPair, getActiveDekVersion, getActiveHmacKey）
async _ensureCachedForEncrypt(namespace) {
  const cached = this._getFromCache(namespace);
  if (cached) return cached;
  await this.ensureVaultInitialized(namespace); // 可能创建 vault
  return this._cache.get(namespace);
}

// 解密路径（getDekByVersion, getKeyPair）
async _ensureCachedForDecrypt(namespace) {
  const cached = this._getFromCache(namespace);
  if (cached) return cached;
  const vaultDoc = await this._vaultStore.load(namespace); // 纯 READ
  if (!vaultDoc) {
    throw new KeyResolutionError(`Vault not found for namespace: ${namespace}`, {
      namespace, vaultExists: false
    });
  }
  return this._populateCache(namespace, vaultDoc);
}
```

需要从 `ensureVaultInitialized` 中提取 `_populateCache(namespace, vaultDoc)` 私有方法（unwrap keys + 填缓存），供两条路径复用。

**Rationale**: 最小化改动面——只改内部路由，公开 API 签名不变。

### D4: EventBus 集成

解密失败事件：

| 错误类型 | 事件名 | Tier | 理由 |
|---------|--------|------|------|
| CryptoAuthenticationError | `lcl.decrypt.field.failed` | L3 (Audit) | 潜在篡改，安全审计 |
| KeyResolutionError | `lcl.decrypt.field.failed` | L2 (Operational) | 运维关注 |
| PayloadCorruptionError | `lcl.decrypt.field.failed` | L2 (Operational) | 数据损坏 |
| SchemaDriftError | `lcl.decrypt.field.failed` | L1 (Diagnostic) | 开发排查 |
| UnsupportedAlgorithmError | `lcl.decrypt.field.failed` | L2 (Operational) | 配置错误 |

事件 attributes: `{ namespace, dekVersion, kid, fieldName, errorType, errorCode }`

Emit 位置：`lclCryptoPlugin.decryptSubDoc` 的 catch 块（在 re-throw 之前）。

**Rationale**: 统一事件名 + errorType 属性区分，而非每种错误一个事件名。简化订阅方。

### D5: WireFormatDecoder 错误替换

当前 4 个 throw 点全部改为 `PayloadCorruptionError`：

| 原始消息 | 新错误 |
|---------|--------|
| "Input must be a Buffer" | PayloadCorruptionError (blobLength: 0) |
| "Truncated Wire Format V1 blob" | PayloadCorruptionError (blobLength, expectedMinLength: 12) |
| "Unsupported wire format version" | PayloadCorruptionError (cause: versionError) |
| "Empty ciphertext" | PayloadCorruptionError |

### D6: CryptoCodec 认证错误识别

AES-GCM 的 `decipher.final()` 在 auth tag 验证失败时 throw `Error: Unsupported state or unable to authenticate data`。AES-CBC 在 padding 错误时 throw `Error: bad decrypt`。

策略：在 `CryptoCodec.decrypt` 的 catch 中，将底层 crypto 错误包装为 `CryptoAuthenticationError`，保留 `.cause`。

```javascript
try {
  return encryptor.decrypt(key, iv, ciphertext, aad);
} catch (e) {
  throw new CryptoAuthenticationError(`Crypto authentication failed: ${e.message}`, {
    cause: e, namespace: decoded.namespace, dekVersion: decoded.dekVersion
  });
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| 移除 `DecryptionError`/`FatalCryptoError` 是 breaking change | 项目无后向兼容约束；CHANGELOG 明确标注 |
| `_populateCache` 提取可能引入微妙行为差异 | 提取后原有 `ensureVaultInitialized` 内部改为调用 `_populateCache`，逻辑不变 |
| 解密路径去掉 vault 创建后，极端场景（vault 被误删）报错而非自愈 | 正确行为：误删 vault 应该告警，不应静默重建（重建的 vault 有新 DEK，旧密文仍无法解密） |
| EventBus emit 在 catch 块中，如果 EventBus 自身 throw 会掩盖原始错误 | CompositeEventBus 已有 per-subscriber failure isolation；NoOpEventBus 不会 throw |
| `SchemaDriftError.rawBytes` 持有明文 Buffer 引用 | 文档注明调用方应尽快释放；不存入事件 attributes |
