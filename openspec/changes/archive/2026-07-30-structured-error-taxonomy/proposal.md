## Why

解密路径的错误全部是裸 `Error` 或统一的 `DecryptionError`，调用方无法程序化区分"密文损坏"、"密钥缺失"、"认证失败（篡改）"等不同故障类型。错误不携带上下文（namespace、dekVersion、fieldName），批量场景下排障困难。此外，解密路径内部调用 `ensureVaultInitialized`（写操作），在 namespace 异常时会静默创建垃圾 vault，掩盖真正问题。

## What Changes

- **BREAKING**: 新增 `src/error/` 模块，引入 `LclCryptoError` 基类及 5 个子类（`PayloadCorruptionError`、`KeyResolutionError`、`CryptoAuthenticationError`、`SchemaDriftError`、`UnsupportedAlgorithmError`），替代现有裸 `Error` 和 `DecryptionError`
- **BREAKING**: 移除 `DecryptionError` 和 `FatalCryptoError` 导出，由新错误层次取代
- 所有错误携带结构化上下文：`namespace`、`dekVersion`、`kid`、`fieldName`（按适用性填充）
- `KeyVaultService._ensureCached` 拆分为加密路径（`_ensureCachedForEncrypt`，可创建 vault）和解密路径（`_ensureCachedForDecrypt`，只读，vault 不存在时 throw `KeyResolutionError`）
- `lclCryptoPlugin` 解密路径（`decryptSubDoc`）不再调用 `ensureVaultInitialized`
- `WireFormatDecoder` 解析失败 throw `PayloadCorruptionError`（替代裸 Error）
- `CryptoCodec.decrypt` 认证失败 throw `CryptoAuthenticationError`
- `FieldCryptoService.decryptField` 类型反序列化失败 throw `SchemaDriftError`
- 解密失败时通过 EventBus 发出结构化事件：`lcl.decrypt.field.failed`（L2/L3，按错误类型分 tier）

## Capabilities

### New Capabilities
- `error-taxonomy`: 结构化加密错误分类体系——LclCryptoError 基类及子类定义、错误上下文字段、EventBus 集成规则

### Modified Capabilities
- `key-vault`: KeyVaultService 缓存加载拆分为加密/解密两条路径；解密路径为纯只读，vault 缺失时 throw KeyResolutionError 而非创建
- `wire-format-v1`: WireFormatDecoder 解析失败时 throw PayloadCorruptionError（携带 blob 长度、期望最小长度等上下文）
- `field-encryption`: FieldCryptoService 解密错误细化为 CryptoAuthenticationError / SchemaDriftError / UnsupportedAlgorithmError

## Impact

- **Public API**: `index.js` 导出变更——移除 `FatalCryptoError`/`DecryptionError`，新增 6 个错误类
- **src/error/**: 新模块（~120 行）
- **src/service/KeyVaultService.js**: `_ensureCached` 拆分，`getDekByVersion`/`getKeyPair` 改用只读路径
- **src/service/FieldCryptoService.js**: 错误类型替换
- **src/crypto/CryptoCodec.js**: 认证错误分类
- **src/format/WireFormatDecoder.js**: 解析错误分类
- **src/plugin/lclCryptoPlugin.js**: 解密路径去除 `ensureVaultInitialized`，添加 EventBus emit
- **Tests**: 所有引用 `DecryptionError`/`FatalCryptoError` 的测试需更新断言
