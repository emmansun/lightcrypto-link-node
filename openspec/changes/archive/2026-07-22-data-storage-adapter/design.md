## Context

当前 `lclCryptoPlugin.js`（787 行）承担了所有数据存储层职责：
- 加密载荷构建/解析（`{c, _e, _t, b}` 子文档）
- 文档遍历（嵌套对象、数组、子文档）
- 加解密编排（调用 FieldCryptoService）
- 盲索引查询改写（queryRewriter.js）
- 结构化值序列化（BsonCodec）

Java 版将这些职责拆分为清晰的 SPI 接口：
- `StorageAdapter` — 载荷格式（buildEncryptedPayload/extractBlob/extractTypeMarker/extractBlindIndex/isEncryptedPayload）
- `DocumentAccessor` — 文档字段访问（getField/setField/isDocumentLike/asList/asMap）
- `StructuredValueCodec` — 结构化值编解码（encode/decode with typeMarker）
- `QueryTransformer` — 查询改写（rewriteFieldName/rewriteQueryValue/supportsField）
- `EncryptHandler` / `DecryptHandler` — 加解密编排

**约束**:
- 无后向兼容需求
- 加密载荷格式 `{c, _e, _t, b}` 不变（跨语言互操作）
- Mongoose 仍是默认且唯一的 Data Storage 实现
- 重构后现有测试应继续通过（行为不变，结构变）

## Goals / Non-Goals

**Goals:**
- 定义 4 个 SPI 接口（StorageAdapter、DocumentAccessor、StructuredValueCodec、QueryTransformer），对齐 Java lcl-spi
- 提供 Mongoose/BSON 默认实现
- 重构 lclCryptoPlugin 为编排层，委托 SPI 实现
- 重构 queryRewriter 为 QueryTransformer 实现
- FieldCryptoService 通过 StorageAdapter 构建/解析载荷

**Non-Goals:**
- EncryptHandler/DecryptHandler 独立接口（Node.js 中由 plugin 编排层承担，无需额外抽象）
- 非 Mongoose 数据存储实现（MySQL/Postgres 等，后续独立 change）
- HmacKeyProvider/BlindIndexFieldChecker 独立接口（Node.js 中由 KeyVaultService + schema metadata 直接提供）
- EventBus 集成（后续独立 change）

## Decisions

### D1: SPI 接口放置位置

**选择**: `src/spi/` 目录存放纯接口定义

```
src/spi/
├── StorageAdapter.js        ← 抽象基类
├── DocumentAccessor.js      ← 抽象基类
├── StructuredValueCodec.js  ← 抽象基类
└── QueryTransformer.js      ← 抽象基类
```

**理由**: 对齐 Java `lcl-spi` 模块的职责。接口与实现分离，便于未来非 Mongoose 适配器引用。

### D2: StorageAdapter 接口设计

**选择**: 对齐 Java 5 方法接口

```javascript
class StorageAdapter {
  buildEncryptedPayload(blob, typeMarker, blindIndex) {} // → Object (子文档)
  extractBlob(payload) {}          // → String (Base64URL)
  extractTypeMarker(payload) {}    // → String
  extractBlindIndex(payload) {}    // → String | null
  isEncryptedPayload(value) {}     // → boolean
}
```

Mongoose 实现（`MongooseStorageAdapter`）：
- `buildEncryptedPayload` → `{ c: blob, _e: 1, _t: typeMarker, b?: blindIndex }`
- `isEncryptedPayload` → 检查 `value._e === 1`

**理由**: 与 Java `MongoStorageAdapter` 字节级一致，确保跨语言互操作。

### D3: DocumentAccessor 接口设计

**选择**: 对齐 Java 5 方法接口，适配 Node.js plain object

```javascript
class DocumentAccessor {
  getField(doc, field) {}       // → any
  setField(doc, field, value) {} // in-place 修改
  isDocumentLike(value) {}      // → boolean (plain object, 非 null/Array/Buffer)
  asList(value) {}              // → Array | null
  asMap(value) {}               // → [key, value][] | null
}
```

Mongoose 实现（`MongooseDocumentAccessor`）：
- 操作 Mongoose Document 或 plain object（`toObject()` 后的）
- `isDocumentLike`: `typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)`
- `asMap`: `Object.entries(value)`

**理由**: Node.js 中 Mongoose Document 和 plain object 的字段访问方式相同（点号/括号），无需区分。

### D4: StructuredValueCodec 接口设计

**选择**: 对齐 Java，使用 BSON 序列化

```javascript
class StructuredValueCodec {
  encode(structuredValue, typeMarker) {} // → Buffer (BSON binary)
  decode(data, typeMarker) {}            // → Object
}
```

实现（`BsonStructuredValueCodec`）：
- `encode`: DOC/MAP → `BSON.serialize(value)`; COL → `BSON.serialize({ _v: value })`
- `decode`: DOC/MAP → `BSON.deserialize(data)`; COL → `BSON.deserialize(data)._v`

**理由**: 与 Java `BsonStructuredValueCodec` 一致（Java 用 DocumentCodec，Node.js 用 bson 包的 serialize/deserialize）。当前 `BsonCodec.js` 已有此逻辑，重构为接口实现。

### D5: QueryTransformer 接口设计

**选择**: 对齐 Java 3 方法接口

```javascript
class QueryTransformer {
  rewriteFieldName(originalField) {}          // → String (field + '.b')
  rewriteQueryValue(plaintextValue, namespace) {} // → String (blind index hash)
  supportsField(field, encryptedFields) {}    // → boolean
}
```

Mongoose 实现（`MongooseQueryTransformer`）：
- 接受 `BlindIndexEngine` + schema metadata
- `rewriteFieldName`: `field + '.b'`
- `rewriteQueryValue`: 调用 BlindIndexEngine.computeBlindIndex
- `supportsField`: 检查 schema metadata 中该字段是否启用 blindIndex

**理由**: 当前 `queryRewriter.js` 的逻辑直接迁移。

### D6: lclCryptoPlugin 重构策略

**选择**: 保留 plugin 作为编排层，内部委托 SPI 实现

重构后的 plugin 结构：
```javascript
function lclCryptoPlugin(schema, options) {
  // 1. 构造 SPI 实现
  const storageAdapter = options.storageAdapter || new MongooseStorageAdapter();
  const docAccessor = options.documentAccessor || new MongooseDocumentAccessor();
  const structuredCodec = options.structuredValueCodec || new BsonStructuredValueCodec();
  const queryTransformer = new MongooseQueryTransformer(...);

  // 2. pre-save hook: 遍历加密字段 → 序列化 → 加密 → storageAdapter.buildEncryptedPayload
  // 3. post-find hook: 检测 isEncryptedPayload → extractBlob → 解密 → 反序列化
  // 4. query 拦截: queryTransformer.rewriteFieldName/rewriteQueryValue
}
```

**理由**: 保持用户 API 不变（`schema.plugin(lclCryptoPlugin, {...})`），内部结构清晰化。

### D7: 文件组织

```
src/
├── spi/
│   ├── StorageAdapter.js
│   ├── DocumentAccessor.js
│   ├── StructuredValueCodec.js
│   └── QueryTransformer.js
├── adapter/
│   ├── VaultStore.js              (existing)
│   ├── MongoVaultStore.js         (existing)
│   ├── InMemoryVaultStore.js      (existing)
│   ├── MongooseStorageAdapter.js  (new)
│   ├── MongooseDocumentAccessor.js (new)
│   ├── BsonStructuredValueCodec.js (new, 重构自 BsonCodec.js)
│   └── MongooseQueryTransformer.js (new, 重构自 queryRewriter.js)
├── plugin/
│   └── lclCryptoPlugin.js         (重构: 编排层)
├── crypto/
│   └── BsonCodec.js               (删除, 逻辑移入 BsonStructuredValueCodec)
```

## Risks / Trade-offs

- **[重构范围大]** lclCryptoPlugin 787 行需大幅重构 → 分步进行：先提取 SPI 接口 + 实现，再重构 plugin 内部委托
- **[行为一致性]** 重构后加密/解密/查询行为必须完全不变 → 现有 607 个测试作为回归保障
- **[过度抽象风险]** Node.js 目前只有 Mongoose 一个 Data Storage 实现 → SPI 接口保持最小化（对齐 Java 即可），不预设扩展点
- **[BsonCodec 删除]** 现有 `BsonCodec.js` 被 `BsonStructuredValueCodec` 取代 → 需更新所有引用
