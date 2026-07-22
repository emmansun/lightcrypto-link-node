## Why

Node.js 的 vault 架构（per-entity：一个实体共享一把 DEK）与 Java（per-field：每个字段独立 DEK/vault）存在根本性不一致，导致两端加密的数据**无法互相解密**。通过对比 Java `KeyVaultService` 源码发现：Java 以完整 canonical namespace（如 `default.default.User#phone`）作为 vault 路由粒度，而 Node.js 以裸 entity name（如 `User`）路由。此外 KeyVaultService 的方法签名（`getDek(kid)` vs `getDek(entityName, kid)`）、缓存策略、`ProgrammaticCryptoService.decryptValue` 签名、`_entity` 字段等均不对齐。必须在首次正式发布前全面对齐，确保跨语言互操作。

## What Changes

- **BREAKING**: Vault 粒度从 per-entity 改为 per-field（per-namespace）。每个加密字段拥有独立的 vault document 和 DEK/HMAC key pair
- **BREAKING**: Vault ID 格式从 `lcl-dek-{EntityName}` 改为 `lcl-dek-{canonical-namespace}`（如 `lcl-dek-default.default.User#phone`）
- **BREAKING**: `lcl-dek-` 前缀从 KeyVaultService 层移到 MongoVaultStore 层（对齐 Java `VAULT_ID_PREFIX`）
- **BREAKING**: `KeyVaultService` 方法签名全面重构——`getDek(kid)`、`getHmacKey(kid)` 只传 kid；新增 `getActiveDekVersion(namespace)`、`getDekByVersion(namespace, dekVersion)`、`getActiveHmacKey(namespace)`
- **BREAKING**: `ProgrammaticCryptoService.decryptValue(subDoc)` 删除 `entityName` 参数，从 Wire Format blob 解码 namespace + dekVersion
- **BREAKING**: 加密 sub-document 不再存储 `_entity` 字段
- Cache 从 entity-level 改为 namespace-level，新增 `resolvedKeysByVersion` 索引
- Plugin 层改为 per-field namespace 初始化

## Capabilities

### New Capabilities
- `field-level-vault-routing`: Per-namespace vault 粒度模型——每个加密字段独立 vault/DEK，vault ID = `lcl-dek-{canonical-namespace}`，缓存按 namespace 隔离

### Modified Capabilities
- `key-vault`: KeyVaultService API 签名全面重构（getDek/getHmacKey 只传 kid、新增 getDekByVersion/getActiveDekVersion/getActiveHmacKey、ensureVaultInitialized/getActiveKid/rotateDek 接受 canonical namespace）
- `programmatic-crypto-service`: encryptValue 接受 canonical namespace、decryptValue 无 entityName 参数（从 Wire Format 解码）、删除 _entity 字段
- `mongo-interoperability`: Vault document _id 格式对齐 Java（`lcl-dek-{canonical-namespace}`）、per-field vault 互操作

## Impact

- **核心代码**: `src/service/KeyVaultService.js`（全面重构）、`src/service/ProgrammaticCryptoService.js`（签名变更）、`src/adapter/MongoVaultStore.js`（添加前缀层）、`src/plugin/lclCryptoPlugin.js`（per-field 初始化）
- **适配器**: `src/adapter/InMemoryVaultStore.js`（无需前缀变更）、`src/adapter/VaultStore.js`（JSDoc 更新）
- **Namespace**: `src/namespace/Namespace.js`（不需要 vaultId 方法，canonical() 就是 vault key）
- **测试**: 几乎所有单元测试和集成测试需要重写
- **Examples**: 所有 example 文件更新
- **互操作性**: 变更后 Node.js 和 Java 可互相解密对方加密的数据
- **废弃**: `namespace-vault-routing` change 的 proposal/design/specs 全部作废（基于错误的 per-entity 假设）
