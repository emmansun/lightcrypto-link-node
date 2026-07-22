## Context

当前 `KeyVaultService` 直接依赖 Mongoose：
- 构造函数接受 `options.connection`（Mongoose Connection）
- 内部调用 `getKeyVaultModel(connection)` 获取 Mongoose Model
- 所有 CRUD 操作通过 Mongoose API（`findById`, `save`, `updateOne`）

Java 版通过 `VaultStore` 接口（LCL-CORE-007）实现存储解耦，默认适配器 `MongoVaultStore` 使用 **原生 MongoDB driver**（MongoTemplate），而非 ORM：
```java
public interface VaultStore {
    void save(VaultDocument doc);
    Optional<VaultDocument> load(String namespace);
    boolean exists(String namespace);
    VaultDocument rotate(VaultDocument updatedDoc);  // CAS 乐观锁
    List<VaultDocument> loadAll();
}
```

**约束**:
- 无后向兼容需求（尚未发布正式版本）
- 默认适配器使用原生 `mongodb` driver（对齐 Java，不用 Mongoose）
- 测试应能脱离 MongoDB 运行（InMemoryVaultStore）

## Goals / Non-Goals

**Goals:**
- 定义 `VaultStore` 抽象接口，对齐 Java SPI 语义
- 定义 `VaultDocument` 纯数据模型（plain object，无 Mongoose 依赖）
- 实现 `MongoVaultStore` 适配器（原生 `mongodb` driver，对齐 Java）
- 实现 `InMemoryVaultStore`（Map-based，用于测试）
- `KeyVaultService` 仅依赖 VaultStore 接口
- Plugin 层保持易用：传 `connection` 时提取原生 client 自动构造 MongoVaultStore

**Non-Goals:**
- MySQL/Postgres/DynamoDB 适配器（后续独立 change）
- VaultStore 的集群/分布式语义（由具体适配器实现）
- 加密数据存储层的适配器（仅 vault 存储，不含业务文档）

## Decisions

### D1: VaultStore 接口设计（async）

**选择**: Node.js 版本所有方法返回 Promise（Java 是同步的）

```javascript
class VaultStore {
  async save(doc) {}           // upsert 语义
  async load(namespace) {}     // → VaultDocument | null
  async exists(namespace) {}   // → boolean
  async rotate(doc) {}         // CAS 乐观锁，失败抛 OptimisticLockError
  async loadAll() {}           // → VaultDocument[]
}
```

**理由**: Node.js 生态中数据库操作天然是异步的。Java 的同步接口不适合直接翻译。

### D2: VaultDocument 数据模型

**选择**: 纯 plain object（非 Mongoose Document），字段与现有 schema 一致

```javascript
{
  id: 'lcl-dek-User',        // 原 _id
  v: 1,                      // 版本号
  status: 'ACTIVE',
  activeKid: 'v1-abcd1234',
  keys: [{
    kid: 'v1-abcd1234',
    status: 'ACTIVE',
    dek: { wrapped: Buffer, algorithm: 'AES_256_GCM', kcv: 'hex', cmkVersion: '' },
    hmk: { wrapped: Buffer, algorithm: 'AES_256_GCM', kcv: 'hex', cmkVersion: '' },
    binding: 'hex',
    createdAt: Date
  }],
  cmk: { provider: 'local-symmetric', id: 'local-cmk-sha256:...' },
  createdAt: Date,
  updatedAt: Date
}
```

**理由**: 与存储解耦。MongoVaultStore 负责 plain object ↔ BSON Document 转换。

### D3: 乐观锁语义

**选择**: `rotate(doc)` 内部检查 `doc.v - 1` 是否等于存储中的版本

- 成功：更新并返回新文档
- 失败：抛出 `OptimisticLockError`（自定义 Error 子类）

**理由**: 对齐 Java `VaultStore.rotate()` 的 CAS 语义。MongoVaultStore 用原生 `replaceOne` + 版本过滤实现；InMemoryVaultStore 用同步检查实现。

### D4: 文件组织

```
src/
├── adapter/
│   ├── VaultStore.js          ← 抽象基类（定义接口 + 方法签名）
│   ├── VaultDocument.js       ← 纯数据模型 + 验证
│   ├── OptimisticLockError.js ← 自定义错误
│   ├── MongoVaultStore.js     ← 原生 mongodb driver 适配器
│   └── InMemoryVaultStore.js  ← 内存适配器
├── service/
│   └── KeyVaultService.js     ← 重构：依赖 VaultStore 接口
```

删除 `src/model/KeyVaultDocument.js`（Mongoose schema 不再用于 vault 存储）。

### D5: Plugin 配置兼容

**选择**: `lclCryptoPlugin` 接受两种配置方式

```javascript
// 方式 1：传 vaultStore（新方式，推荐）
schema.plugin(lclCryptoPlugin, { vaultStore, cmkProvider });

// 方式 2：传 connection（便捷方式，提取原生 client 构造 MongoVaultStore）
schema.plugin(lclCryptoPlugin, { connection, cmkProvider });
// 内部: new MongoVaultStore(connection.getClient().db(connection.name))
```

**理由**: Mongoose Connection 暴露 `getClient()` 可获取原生 MongoClient，无需额外依赖。保持 Mongoose 用户的零配置体验。

### D6: KeyVaultService 重构

**选择**: 构造函数改为 `constructor({ vaultStore, cmkProvider, cacheTtl })`

- 移除 `this._connection`
- 移除 `getKeyVaultModel` 调用
- `ensureVaultInitialized` → 调用 `vaultStore.load()` / `vaultStore.save()`
- `rotateDek` → 调用 `vaultStore.rotate()`
- 缓存逻辑不变（仍在 KeyVaultService 层）

## Risks / Trade-offs

- **[updatedAt 处理]** 原来由 Mongoose `pre('save')` hook 自动更新，现在由 MongoVaultStore 在 save/rotate 时手动设置 → 简单可控
- **[测试迁移]** 现有集成测试用 mongodb-memory-server，改为 InMemoryVaultStore 后覆盖范围缩小 → 保留 MongoVaultStore 集成测试验证原生 driver 路径
- **[接口粒度]** Java VaultStore 是 5 个方法的最小接口，Node.js 保持一致 → 如未来需要批量操作或分页，通过扩展接口版本解决
- **[mongodb 依赖]** 原生 `mongodb` driver 已作为 Mongoose 的内部依赖存在，无需额外安装 → 但需在 package.json 中显式声明为 peerDependency
