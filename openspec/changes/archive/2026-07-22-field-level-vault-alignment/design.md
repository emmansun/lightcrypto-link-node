## Context

Node.js `KeyVaultService` 以 entity name（如 `"User"`）为 vault 路由粒度，所有字段（phone, email, ssn）共享同一 DEK。Java `KeyVaultService` 以完整 canonical namespace（如 `"default.default.User#phone"`）为粒度，每个字段有独立 vault document 和 DEK。

通过逐行对比 Java 源码确认：

**Java KeyVaultService** (`lcl-spring-boot-starter`):
- `ensureVaultInitialized(String namespace)` — canonical namespace
- `getActiveKid(String namespace)` / `getActiveDekVersion(String namespace)`
- `getDek(String kid)` — 只传 kid，遍历所有 namespace 查找
- `getDekByVersion(String namespace, int dekVersion)` — 按 namespace + version 查找
- Cache: `ConcurrentHashMap<String, NamespaceKeyContext>` keyed by canonical namespace
- Cache entry: `activeKid`, `activeDekVersion`, `resolvedKeys` (kid→pair), `resolvedKeysByVersion` (version→pair)

**Java MongoVaultStore**: `_id = "lcl-dek-" + namespace`（前缀在 store 层）

**Java VaultDocument**: `namespace` 字段存完整 canonical（如 `"default.default.User#phone"`）

**Java ProgrammaticCryptoService.decryptValue(subDoc)**: 无 entityName 参数，从 Wire Format blob 解码 namespace + dekVersion

**约束**:
- 无后向兼容需求（尚未发布正式版本，干净断裂）
- Vault ID 前缀 `lcl-dek-` 必须保留（Java 存储层依赖）
- Wire Format V1 blob 已编码 namespace + dekVersion（AAD 层已有）

## Goals / Non-Goals

**Goals:**
- Vault 粒度对齐 Java: per-namespace（per-field）独立 vault/DEK
- KeyVaultService API 签名逐方法对齐 Java
- Cache 策略对齐: namespace-level + resolvedKeysByVersion
- MongoVaultStore 前缀位置对齐 Java（`VAULT_ID_PREFIX` 在 store 层）
- ProgrammaticCryptoService.decryptValue 签名对齐（从 Wire Format 解码 namespace）
- 删除 sub-document 中的 `_entity` 字段
- 确保 Node.js 加密数据可被 Java 解密，反之亦然

**Non-Goals:**
- Multi-tenant vault 隔离（当前 tenant/realm 固定为 default）
- Startup preloading（`loadAll` + 批量 `ensureVaultInitialized`）
- EventBus / Metrics（Java 有，Node.js 暂不实现）
- Bootstrap KAT（Key Attestation Test）

## Decisions

### D1: Vault 粒度 = Per-Namespace (Per-Field)

**选择**: 每个加密字段（namespace）拥有独立的 vault document 和 DEK/HMAC key pair。

**理由**: Java 按 `meta.namespace().canonical()` 路由 vault，`User#phone` 和 `User#email` 使用不同的 DEK。Node.js 必须匹配，否则互操作失败。

**影响**: 一个有 N 个加密字段的 entity 将创建 N 个 vault documents（而非当前的 1 个）。

### D2: `lcl-dek-` 前缀移至 MongoVaultStore

**选择**: KeyVaultService 使用纯 canonical namespace 作为 vaultStore 参数。MongoVaultStore 内部添加 `VAULT_ID_PREFIX = "lcl-dek-"` 前缀构造 `_id`。

```
KeyVaultService: vaultStore.load("default.default.User#phone")
MongoVaultStore: _id = "lcl-dek-default.default.User#phone"
```

**理由**: 对齐 Java `MongoVaultStore`（第 34 行 `VAULT_ID_PREFIX = "lcl-dek-"`，第 56 行 `vaultId = VAULT_ID_PREFIX + namespace`）。InMemoryVaultStore 不需要前缀。

### D3: KeyVaultService API 签名逐方法对齐

```
// 对齐 Java 签名
ensureVaultInitialized(namespace)     // canonical namespace string
getActiveKid(namespace)               // canonical namespace
getActiveDekVersion(namespace)        // canonical namespace（新增）
getDek(kid)                           // kid only, 遍历所有 namespace（签名变更）
getHmacKey(kid)                       // kid only（签名变更）
getActiveHmacKey(namespace)           // canonical namespace（新增）
getDekByVersion(namespace, version)   // canonical namespace + version（新增）
rotateDek(namespace)                  // canonical namespace
flushCache()                          // 无变更
```

**理由**: 每个签名都从 Java 源码逐方法验证。

### D4: Cache 结构对齐 Java NamespaceKeyContext

```js
// 新 cache entry 结构
{
  activeKid: 'v1-a3b2c1d4',
  activeDekVersion: 1,
  resolvedKeys: new Map(),         // kid → { dek, hmacKey }
  resolvedKeysByVersion: new Map(), // version → { dek, hmacKey }
  expiresAt: Date.now() + cacheTtl
}
```

**理由**: 对齐 Java `NamespaceKeyContext`（activeKid, activeDekVersion, resolvedKeys, resolvedKeysByVersion）。`resolvedKeysByVersion` 支持 `getDekByVersion` 方法。

### D5: ProgrammaticCryptoService.decryptValue 签名变更

**选择**: `decryptValue(encryptedSubDocument)` 删除 `entityName` 参数。从 Wire Format blob（`c` 字段）解码出 namespace + dekVersion：

```js
const { namespace, dekVersion } = WireFormatDecoder.decodeFromBase64Url(subDoc.c);
keyVaultService.ensureVaultInitialized(namespace);
dek = keyVaultService.getDekByVersion(namespace, dekVersion);
```

**理由**: 对齐 Java `ProgrammaticCryptoService.decryptValue(Object encryptedSubDocument)`（第 112 行，无 entityName 参数）。

### D6: encryptValue 接受 canonical namespace

**选择**: `encryptValue(value, namespace)` 接受 namespace 字符串（如 `"User#phone"`），内部 `Namespace.parse()` → `canonical()`。sub-document 不再存储 `_entity`。

**理由**: 对齐 Java `encryptValue(Object value, String namespace)`（第 51 行）。Java 的 sub-document 不含 `_entity` 字段。

### D7: Namespace 类保持不变

**选择**: 不添加 `vaultId()` 或 `vaultIdOf()` 方法。`canonical()` 返回值就是 vault key。

**理由**: Java `Namespace` record 没有这些方法。canonical namespace 直接作为 vaultStore 参数即可。

## Risks / Trade-offs

- **[性能]** Per-field vault = 更多 vault documents + 更多 CMK unwrap 调用 → 缓解: cache TTL 避免重复 unwrap; 后续可加 startup preloading
- **[BREAKING]** Vault ID 格式变更，现有 `__lcl_keyvault` 数据不兼容 → 可接受（无正式版本，干净断裂）
- **[BREAKING]** `decryptValue` 签名变更 → 同上
- **[测试量]** 几乎所有测试需重写 → 逐文件推进，每步验证
