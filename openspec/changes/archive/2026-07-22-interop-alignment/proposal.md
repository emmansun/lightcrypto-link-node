## Why

Node.js SDK 与 Java SDK **目前无法互相解密对方的数据**。Java 使用 Wire Format V1（结构化 base64url blob + AAD 认证），Node.js 使用简单 `[IV‖CT‖tag]` Buffer 拼接；Java 盲索引用 HKDF 派生 namespace-scoped key，Node.js 直接用原始 HMAC key。这是 LightCrypto-Link 生态系统最严重的缺陷——两个 SDK 名存实亡地"互操作"。本次变更将 Node.js 加密核心对齐 Java 实现，确保字节级一致。

## What Changes

- **BREAKING**: 加密输出从 BSON Binary (`[IV‖CT‖tag]`) 改为 Base64URL 编码的 Wire Format V1 字符串
- **BREAKING**: GCM 模式加密引入 AAD（`0x01‖algId‖namespace‖dekVersion`），旧密文无法被新版本直接解密（需双格式兼容层）
- 新增 Wire Format V1 encoder/decoder（匹配 Java 字节布局）
- 新增 Namespace 模型（`tenant.realm.entity#field` 四段式）
- 新增 AlgorithmId 注册表（`0x01`=AES_256_GCM, `0x02`=AES_256_CBC, `0x04`=SM4_CBC）
- 重构 SymmetricEncryptor 接口为 `encrypt(key, iv, plaintext, aad) → ciphertext`
- 重构盲索引为 HKDF 派生 + namespace 隔离（Info=`"lcl-blind-index-v1"`）
- 解密层统一使用 Wire Format V1（无需后向兼容，尚未发布正式版本）
- 集成 Java `vectors/` 黄金向量测试套件（encryption/blind-index/kcv/roundtrip）
- 暂不实现 SM4-GCM（`0x03`）

## Capabilities

### New Capabilities
- `wire-format-v1`: Wire Format V1 二进制编解码器、AlgorithmId 注册表、AAD 构造、Base64URL 存储编码
- `namespace-model`: 四段式 Namespace 解析/验证/规范化（tenant.realm.entity#field）
- `blind-index-engine`: HKDF-SHA256 派生 namespace-scoped HMAC key + 盲索引计算
- `golden-vector-suite`: 集成 Java vectors/ 黄金向量作为跨语言正确性验证

### Modified Capabilities
- `field-encryption`: 密文格式从 `[IV‖CT‖tag]` Buffer 变为 Wire Format V1 Base64URL 字符串；GCM 引入 AAD；解密增加双格式兼容层
- `blind-indexing`: 盲索引计算从直接 HMAC 改为 HKDF 派生 key + namespace 隔离

## Impact

- **src/crypto/**: 所有 Encryptor 接口签名变更（新增 iv、aad 参数）；新增 WireFormatEncoder/Decoder、AlgorithmId
- **src/service/FieldCryptoService.js**: encryptField/decryptField 逻辑重写
- **src/service/KeyVaultService.js**: 需传递 namespace 和 dekVersion 到加密层
- **src/plugin/lclCryptoPlugin.js**: 需构造 namespace（从 entityName + fieldName）
- **src/crypto/CryptoCodec.js**: generateBlindIndex 重构为 BlindIndexEngine
- **test/**: 所有现有加密相关测试需适配新格式；新增黄金向量测试
- **向后兼容**: 无需（尚未发布正式版本，干净断裂）
