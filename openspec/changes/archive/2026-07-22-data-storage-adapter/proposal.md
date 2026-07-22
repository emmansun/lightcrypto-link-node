## Why

`lclCryptoPlugin.js`（787 行）是一个 Mongoose 专属 monolith，将加密载荷构建、文档遍历、加解密编排、盲索引查询改写全部硬编码。Java 版通过 6 个 SPI 接口（StorageAdapter、DocumentAccessor、EncryptHandler、DecryptHandler、QueryTransformer、StructuredValueCodec）实现了数据存储层的完全解耦（lcl-spi + lcl-adapter-mongodb）。Node.js 需要引入等价的 SPI 抽象，使加密数据存储格式和文档访问模式可插拔，Mongoose 作为默认实现。

## What Changes

- 新增 `StorageAdapter` 接口 — 加密载荷的构建与解析（`{c, _e, _t, b}` 子文档格式）
- 新增 `DocumentAccessor` 接口 — 文档字段级读写抽象（getField/setField/isDocumentLike/asList/asMap）
- 新增 `StructuredValueCodec` 接口 — 结构化值（DOC/COL/MAP）的序列化/反序列化
- 新增 `QueryTransformer` 接口 — 盲索引查询改写抽象（rewriteFieldName/rewriteQueryValue/supportsField）
- 新增 Mongoose 默认实现：`MongooseStorageAdapter`、`MongooseDocumentAccessor`、`BsonStructuredValueCodec`、`MongooseQueryTransformer`
- **BREAKING**: 重构 `lclCryptoPlugin.js` — 从 monolith 拆分为 SPI 组合编排；内部逻辑委托给上述接口实现
- **BREAKING**: 重构 `queryRewriter.js` — 改为 `MongooseQueryTransformer` 的薄封装
- `FieldCryptoService` 改为依赖 `StorageAdapter` + `StructuredValueCodec` 接口

## Capabilities

### New Capabilities
- `storage-adapter-spi`: StorageAdapter 接口定义 + MongooseStorageAdapter 实现（加密载荷 `{c, _e, _t, b}` 的构建/提取/检测）
- `document-accessor-spi`: DocumentAccessor 接口定义 + MongooseDocumentAccessor 实现（plain object 字段读写、嵌套遍历）
- `structured-value-codec-spi`: StructuredValueCodec 接口定义 + BsonStructuredValueCodec 实现（DOC/COL/MAP 的 BSON 序列化）
- `query-transformer-spi`: QueryTransformer 接口定义 + MongooseQueryTransformer 实现（盲索引字段改写 + 值改写）

### Modified Capabilities
- `mongo-interoperability`: lclCryptoPlugin 从 monolith 重构为 SPI 组合；加密载荷格式不变（`{c, _e, _t, b}`）
- `field-encryption`: FieldCryptoService 改为通过 StorageAdapter 构建/解析载荷

## Impact

- **src/spi/**: 新增目录，存放 4 个 SPI 接口定义
- **src/adapter/**: 新增 Mongoose 实现（MongooseStorageAdapter、MongooseDocumentAccessor、BsonStructuredValueCodec、MongooseQueryTransformer）
- **src/plugin/lclCryptoPlugin.js**: 大幅重构，从 787 行 monolith 拆分为编排层（委托 SPI 实现）
- **src/plugin/queryRewriter.js**: 重构为 MongooseQueryTransformer 的薄封装
- **src/service/FieldCryptoService.js**: 改为接受 StorageAdapter 参数
- **test/**: 新增 SPI 单元测试；现有 plugin 测试应继续通过（行为不变）
