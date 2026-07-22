## Why

`KeyVaultService` 硬编码耦合 Mongoose（`getKeyVaultModel(connection)`），无法用于非 Mongoose 场景。Java 版通过 `VaultStore` SPI + `MongoVaultStore`（原生 MongoDB driver，非 ORM）实现存储解耦（LCL-CORE-007 Adapter Contract）。Node.js 需要引入等价的 SPI 抽象，默认适配器使用原生 `mongodb` driver（对齐 Java），使 vault 持久化可插拔。

## What Changes

- 新增 `VaultStore` 抽象接口（save/load/exists/rotate/loadAll），对齐 Java SPI
- 新增 `VaultDocument` 纯数据模型（与存储无关的 plain object）
- 新增 `MongoVaultStore` 适配器（基于原生 `mongodb` driver，对齐 Java `MongoVaultStore`）
- **BREAKING**: `KeyVaultService` 构造函数从 `options.connection` 改为 `options.vaultStore`
- **BREAKING**: 移除 `src/model/KeyVaultDocument.js`（Mongoose schema 不再用于 vault 存储）
- 新增 `InMemoryVaultStore`（用于单元测试，无需 MongoDB）
- `lclCryptoPlugin` 配置接口新增 `vaultStore` 选项（便捷方式：如传 `connection` 则从 Mongoose Connection 提取原生 client 自动构造 MongoVaultStore）

## Capabilities

### New Capabilities
- `vault-store-spi`: VaultStore 抽象接口定义、VaultDocument 数据模型、适配器契约（save/load/exists/rotate/loadAll + 乐观锁语义）
- `in-memory-vault-store`: 内存 VaultStore 实现（用于测试和无持久化场景）

### Modified Capabilities
- `key-vault`: KeyVaultService 从硬编码 Mongoose 改为依赖 VaultStore 接口；构造函数参数变更

## Impact

- **src/service/KeyVaultService.js**: 构造函数改为接受 `vaultStore` 而非 `connection`；内部调用 VaultStore 方法
- **src/model/KeyVaultDocument.js**: 删除（Mongoose schema 不再需要，vault 存储由原生 driver 直接操作 BSON）
- **src/adapter/**: 新增目录，存放 VaultStore 接口 + MongoVaultStore + InMemoryVaultStore
- **src/plugin/lclCryptoPlugin.js**: 配置解析逻辑新增 vaultStore/connection 双路径（connection 时提取 `connection.getClient()`）
- **test/**: 单元测试可用 InMemoryVaultStore 替代 mongodb-memory-server（加速测试）
- **examples/**: 示例代码需更新配置方式
