## 1. MongoVaultStore 前缀层

- [x] 1.1 在 `MongoVaultStore` 中添加 `VAULT_ID_PREFIX = 'lcl-dek-'` 常量
- [x] 1.2 修改 `_toBson()`: `_id` 改为 `VAULT_ID_PREFIX + doc.id`
- [x] 1.3 修改 `_fromBson()`: `id` 改为去除前缀后的纯 namespace
- [x] 1.4 修改 `load(namespace)`: 查询 `_id: VAULT_ID_PREFIX + namespace`
- [x] 1.5 修改 `exists(namespace)`: 同上
- [x] 1.6 修改 `rotate(doc)`: `_id: VAULT_ID_PREFIX + doc.id`
- [x] 1.7 更新 `test/unit/adapter/MongoVaultStore.test.js`: mock _id 使用新格式

## 2. VaultDocument 数据模型

- [x] 2.1 更新 `VaultDocument` 验证：`id` 字段改为接受 canonical namespace 字符串（如 `"default.default.User#phone"`）
- [x] 2.2 更新 `test/unit/adapter/VaultDocument.test.js`

## 3. KeyVaultService 核心重构

- [x] 3.1 修改 `ensureVaultInitialized(entityName)` → `ensureVaultInitialized(namespace)`: 参数改为 canonical namespace，直接用 namespace 调用 vaultStore（不再拼接 `lcl-dek-` 前缀）
- [x] 3.2 修改 `_initializeVault()`: `id` 字段设为 canonical namespace 字符串
- [x] 3.3 重构 cache entry 结构: 新增 `activeDekVersion`、`resolvedKeys` (Map: kid→{dek,hmacKey})、`resolvedKeysByVersion` (Map: version→{dek,hmacKey})
- [x] 3.4 修改 `_loadAndCacheKeys()`: 填充新 cache 结构（resolvedKeys + resolvedKeysByVersion + activeDekVersion）
- [x] 3.5 修改 `getActiveKid(entityName)` → `getActiveKid(namespace)`: 按 namespace 查 cache
- [x] 3.6 新增 `getActiveDekVersion(namespace)`: 返回 activeDekVersion
- [x] 3.7 修改 `getDek(entityName, kid)` → `getDek(kid)`: 遍历所有 cache entries 查找 kid
- [x] 3.8 修改 `getHmacKey(entityName, kid)` → `getHmacKey(kid)`: 同上遍历查找
- [x] 3.9 新增 `getActiveHmacKey(namespace)`: `getHmacKey(getActiveKid(namespace))`
- [x] 3.10 新增 `getDekByVersion(namespace, dekVersion)`: 从 `resolvedKeysByVersion` 查找
- [x] 3.11 修改 `rotateDek(entityName)` → `rotateDek(namespace)`: 按 namespace 旋转，mark all ACTIVE → ROTATED
- [x] 3.12 更新 JSDoc 注释
- [x] 3.13 更新 `test/unit/service/KeyVaultService.test.js`: 全面重写为 per-namespace 测试

## 4. ProgrammaticCryptoService 重构

- [x] 4.1 修改 `encryptValue(value, entityName)` → `encryptValue(value, namespace)`: 接受 namespace 字符串，内部 `Namespace.parse()` → `canonical()`
- [x] 4.2 删除 encryptValue 结果中的 `_entity` 字段
- [x] 4.3 修改 `decryptValue(subDoc, entityName)` → `decryptValue(subDoc)`: 删除 entityName 参数
- [x] 4.4 decryptValue 从 Wire Format blob (`c` 字段) 解码 namespace + dekVersion: 使用 `WireFormatDecoder.decodeFromBase64Url()`
- [x] 4.5 decryptValue 调用 `getDekByVersion(namespace, dekVersion)` 获取 DEK
- [x] 4.6 修改 `decryptDocument(doc, entityName, fields)` → 更新参数和内部调用
- [x] 4.7 更新 JSDoc 注释
- [x] 4.8 更新 `test/unit/service/ProgrammaticCryptoService.test.js`
- [x] 4.9 更新 `test/integration/programmaticCryptoService.test.js`

## 5. Plugin 层 per-field namespace 传递

- [x] 5.1 修改 `lclCryptoPlugin.js` pre-save hook: 每个加密字段调用 `ensureVaultInitialized(canonicalNamespace)` 而非 entityName
- [x] 5.2 修改 pre-find / pre-findOne hooks: 同上 per-field 初始化
- [x] 5.3 修改 `decryptDocument()` 内部函数: 使用 `getDek(kid)` (kid-only) 解密
- [x] 5.4 移除 `_entity` 字段写入逻辑
- [x] 5.5 更新 `test/unit/plugin/lclCryptoPlugin.test.js`
- [x] 5.6 更新 `test/unit/plugin/queryRewriter.test.js` (如需要)

## 6. 集成测试与全量验证

- [x] 6.1 更新 `test/integration/keyVaultService.test.js`: per-namespace vault 文档
- [x] 6.2 更新 `test/integration/mongoosePlugin.test.js`: 多字段 = 多 vault
- [x] 6.3 更新 golden vector tests (如需要) — golden tests 通过，无需修改
- [x] 6.4 更新 examples 文件中所有 KeyVaultService/ProgrammaticCryptoService 调用
- [x] 6.5 运行全量测试 `npx jest --forceExit --no-coverage`，确保所有用例通过 (607 passed, 25 skipped, 0 failed)

## 7. 清理

- [x] 7.1 删除 `openspec/changes/namespace-vault-routing/` 目录（基于错误假设的废弃 change）
