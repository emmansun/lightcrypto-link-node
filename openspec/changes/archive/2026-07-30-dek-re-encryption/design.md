## Context

DEK 再加密是最重的密钥生命周期操作：它触碰数据库中的每一条加密文档。与 CMK re-wrap（秒级、仅 vault）和 DEK rotation（瞬时、仅 vault）不同，再加密是 O(all documents)，大集合可能运行数小时。

Java 端已完成对齐实现（`DekReEncryptionService` + `DocumentRewriteStore` SPI + `MongoDocumentRewriteStore`），Node.js 需保持架构一致性。

关键差异：Java 通过 `EntityMetadataCache`（Spring Data 注解）获取加密字段元数据；Node.js 无注解系统，改为显式传入 `fieldConfigs` 数组。

## Goals / Non-Goals

**Goals:**
- 与 Java 端 SPI 契约对齐（DocumentRewriteStore / RawDocument / ScanOptions）
- 编程式 API：`reEncrypt(fieldConfigs, options)` + `reEncryptAll(fieldConfigSets, options)`
- 盲索引重算（使用活跃 HMAC key）
- CAS 并发保护（利用加密子文档的 `_k` 字段）
- Checkpoint 断点续传
- RETIRED key status + pruneRetiredKeys API
- EventBus 事件（batch / completion / failure）
- dry-run 模式

**Non-Goals:**
- 内置调度器
- 自动删除 RETIRED keys
- 并行/分片
- Mongoose middleware 自动触发

## Decisions

### D1: DocumentRewriteStore SPI（对齐 Java）

```javascript
// src/spi/DocumentRewriteStore.js
class DocumentRewriteStore {
  /** @returns {AsyncIterator<RawDocument>} 稳定 _id 顺序 */
  async *scan(scanOptions) { throw new Error('Not implemented'); }

  /** @returns {Promise<boolean>} CAS 替换，冲突返回 false */
  async replace(rawDocument) { throw new Error('Not implemented'); }

  /** @returns {Promise<number>} 批量替换，返回成功数 */
  async replaceBatch(rawDocuments) { throw new Error('Not implemented'); }

  /** 持久化 checkpoint */
  async saveCheckpoint(taskId, cursorState) { throw new Error('Not implemented'); }

  /** @returns {Promise<string|null>} 加载 checkpoint */
  async loadCheckpoint(taskId) { throw new Error('Not implemented'); }
}
```

**Rationale**: 与 Java SPI 一一对应。Node.js 用 AsyncIterator 替代 CloseableIterator（语言惯用法）。

### D2: CAS 策略——使用 `_k` 字段而非 `updatedAt`

Java 使用 `updatedAt` 时间戳做 CAS。Node.js 改为使用加密子文档的 `_k`（kid）字段：

```javascript
// MongoDB replaceOne filter:
{ _id: doc.id, 'phone._k': 'v1-old-kid' }
// 如果应用已用 v2 重写了 phone，条件不匹配 → skip
```

**Rationale**:
- 不依赖业务文档有 `updatedAt` 字段
- 更精确：只保护实际被改写的加密字段
- 与再加密的语义天然匹配（"只改还是旧版本的"）

### D3: FieldConfig 替代 EntityMetadataCache

```javascript
// 用户显式声明加密字段配置
const fieldConfigs = [
  {
    path: 'phone',                          // 文档中的字段路径
    namespace: 'default.default.User#phone', // 完整 canonical namespace
    blindIndex: true,                        // 是否重算盲索引
    blindIndexFieldName: 'phone',            // 盲索引字段名
    structuredType: null                     // null=scalar, 'DOC', 'COL', 'MAP'
  },
  { path: 'email', namespace: 'default.default.User#email', blindIndex: true }
];

await service.reEncrypt(db.collection('users'), fieldConfigs, options);
```

**Rationale**: Node.js 无注解反射，显式配置更清晰。可从 Mongoose schema 提取作为便利函数（后续增强）。

### D4: RETIRED key status

生命周期：`ACTIVE → ROTATED → RETIRED`

- `ROTATED`: 仍用于解密历史数据 + 盲索引查询
- `RETIRED`: 所有数据已迁移，可安全删除

再加密完成且 `docsFailed === 0` 时自动标记 ROTATED → RETIRED。删除通过独立 API `pruneRetiredKeys(namespace)`。

`getDekByVersion` 解析到 RETIRED entry 时 throw `KeyResolutionError`（数据应在退役前完成再加密）。

### D5: Checkpoint 存储

MongoDB 实现使用 `__lcl_checkpoints` 集合：

```javascript
{ _id: taskId, cursorState: lastDocId, updatedAt: new Date() }
```

**Rationale**: 与 Java 对齐。轻量（一条文档），幂等。

### D6: 性能策略委托给适配器

引擎按可配置 batchSize 处理。性能优化（cursor 类型、read preference、bulkWrite）是适配器实现细节。

MongoDocumentRewriteStore 使用：
- `collection.find().sort({ _id: 1 }).batchSize(N)` 稳定扫描
- `collection.bulkWrite(ordered: false)` 批量写入
- 可选 `noCursorTimeout` 防止长任务 cursor 超时

### D7: 盲索引重算

再加密时明文已在内存中（decrypt 产出）。盲索引重算开销 < 50µs/字段，可忽略。

```javascript
if (fieldConfig.blindIndex) {
  const activeHmacKey = await keyVaultService.getActiveHmacKey(namespace);
  const blindIndexEngine = new BlindIndexEngine(activeHmacKey);
  newBlindIndex = blindIndexEngine.compute(namespace, fieldName, plaintextString);
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| 高写入负载下 CAS skip 率高 | 低峰期运行；多次运行收敛 |
| 再加密期间盲索引版本混合 | 查询路径已支持多版本（Wire Format 中 dekVersion 路由） |
| 内存压力 | 引擎一次只持有一个 batch（默认 500 docs） |
| RETIRED key 堆积 | vault 文档极小；监控可告警 RETIRED 数量 |
| 大集合 cursor 超时 | MongoDocumentRewriteStore 使用 noCursorTimeout |
| 结构化字段（DOC/COL）再加密 | 使用 StructuredValueCodec 解码后重编码，与 scalar 路径统一 |
