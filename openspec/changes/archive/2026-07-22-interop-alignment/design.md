## Context

Node.js SDK (v1.1.0-beta.1) 的加密核心与 Java SDK (Phase 1-3) 存在根本性不兼容：

- **密文格式**: Java 输出 Wire Format V1 结构化 blob（Base64URL string），Node.js 输出 `[IV‖CT‖tag]` Buffer
- **AAD 认证**: Java GCM 加密绑定 AAD（version‖algId‖namespace‖dekVersion），Node.js 无 AAD
- **盲索引**: Java 用 HKDF 从 masterHmacKey 派生 namespace-scoped key，Node.js 直接用原始 key
- **Encryptor 接口**: Java 接受 `(key, iv, plaintext, aad)` 返回纯 ciphertext，Node.js 接受 `(key, plaintext)` 返回 `[IV‖CT‖tag]`

Java 实现是事实标准（Golden Vectors 由 Java 生成）。Node.js 必须对齐 Java 的字节级行为。

**约束**:
- 使用 Node.js 原生 `crypto` 模块（HKDF 通过 `crypto.hkdfSync`）
- 暂不实现 SM4-GCM（`0x03`）
- 尚未发布正式版本，无需后向兼容（干净断裂）

## Goals / Non-Goals

**Goals:**
- Wire Format V1 编解码与 Java 字节级一致（通过 Golden Vector 验证）
- GCM 模式 AAD 构造与 Java 一致
- HKDF 盲索引与 Java 一致（通过 blind-index vectors 验证）
- 解密层透明支持旧格式（双读单写渐进迁移）
- KCV 计算与 Java 一致（通过 kcv vectors 验证）
- 所有 4 种算法的 roundtrip 与 Java 一致

**Non-Goals:**
- SM4-GCM 实现（Phase 2）
- VaultStore SPI 抽象（Phase 2）
- EventBus / Metrics / Bootstrap KAT（Phase 2）
- 分层配置模型（Phase 2）
- 旧格式 → 新格式批量迁移工具（后续独立 change）

## Decisions

### D1: Encryptor 接口直接重构

**选择**: 直接修改现有 Encryptor 接口为新签名，不保留旧接口

```
新接口: encrypt(key, iv, plaintext, aad) → ciphertext‖tag
        decrypt(key, iv, ciphertext, aad) → plaintext
```

**理由**: 尚未发布正式版本，无存量数据，无需后向兼容。直接重构最简洁，避免维护两套接口的复杂度。

### D2: Wire Format 存储编码

**选择**: `c` 字段存储 Base64URL（no padding）字符串，与 Java 完全一致

**理由**: Java 的 `WireFormatEncoder.encodeToBase64Url()` 输出 Base64URL string 存入 MongoDB。Node.js 必须匹配。

**影响**: `c` 字段类型从 BSON Binary 变为 String。无需格式检测——所有密文统一为 Wire Format V1。

### D3: AAD 构造

**选择**: 与 Java `WireFormatEncoder.buildAad()` 完全一致

```
AAD = [0x01] ‖ [algId byte] ‖ [namespace UTF-8 bytes] ‖ [dekVersion 4B big-endian]
```

**理由**: 这是 Java 代码的实际行为（非 LCL-CORE-006 §5.1 描述的字符串格式）。Golden Vectors 基于此生成。

### D4: HKDF 盲索引

**选择**: 使用 Node.js `crypto.hkdfSync('sha256', ikm, salt, info, keylen)`

```
derivedKey = HKDF-SHA256(
  IKM  = masterHmacKey,
  Salt = SHA-256(namespace.canonicalBytes()),
  Info = "lcl-blind-index-v1",   ← 跟 Java 代码，非 spec 的 "lcl:bidx:v1"
  L    = 32
)
blindIndex = Base64URL(HMAC-SHA256(derivedKey, fieldName + ":" + normalizedValue))
```

**理由**: Java `BlindIndexEngine` 第 39 行 `HKDF_INFO = "lcl-blind-index-v1"`。Golden vectors 基于此。Node.js 22 的 `crypto.hkdfSync` 原生支持 HKDF-SHA256，无需外部依赖。

### D5: Namespace 构造（Plugin 层）

**选择**: Plugin 层从 `entityName` + `fieldName` 构造 shorthand namespace `entityName#fieldName`，由 Namespace 模型自动展开为 `default.default.entityName#fieldName`

**理由**: 与 Java Spring Data MongoDB 集成行为一致（默认 tenant=default, realm=default）。未来多租户时可通过配置覆盖。

### D6: dekVersion 来源

**选择**: 从 KeyVaultService 的 vault document `v` 字段获取，作为 dekVersion 传入加密层

**理由**: Java 的 dekVersion 对应 vault 版本号。Node.js 的 `vaultDoc.v` 语义等价。

### D7: 文件组织

```
src/
├── format/
│   ├── AlgorithmId.js        ← 算法注册表 (0x01-0x04)
│   ├── WireFormatEncoder.js  ← 编码 + buildAad
│   └── WireFormatDecoder.js  ← 解码 + reconstructAad
├── namespace/
│   └── Namespace.js          ← 四段式模型
├── blindindex/
│   └── BlindIndexEngine.js   ← HKDF 派生 + HMAC 计算
├── crypto/
│   ├── SymmetricEncryptor.js ← 新接口 (key,iv,plaintext,aad)
│   ├── AesGcmEncryptor.js    ← 重构为新接口
│   ├── AesCbcEncryptor.js    ← 重构为新接口
│   ├── Sm4CbcEncryptor.js    ← 重构为新接口
│   └── CryptoCodec.js        ← 重构：集成 WireFormat + 新 Encryptor
```

## Risks / Trade-offs

- **[HKDF Info 不一致]** Spec (LCL-CORE-006) 说 `"lcl:bidx:v1"`，Java 代码用 `"lcl-blind-index-v1"` → 缓解：跟 Java 代码（vectors 是事实标准），后续推动 spec 修正
- **[性能]** Base64URL 编码增加 ~33% 存储开销 vs 旧 BSON Binary → 可接受，与 Java 一致是首要目标
- **[测试重写]** 所有现有加密测试需重写 → 必要代价，用 golden vectors 替代自洽测试更可靠

## Migration Plan

尚未发布正式版本，无需迁移计划。直接替换为新格式，旧测试全部重写适配。
