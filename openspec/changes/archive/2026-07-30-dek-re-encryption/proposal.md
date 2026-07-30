## Why

合规框架（PCI-DSS 8.2.4、等保 2.0、SOC2）要求定期轮换 DEK 并最终销毁旧密钥材料。当前 `rotateDek()` 只生成新 DEK 供后续写入使用，已有文档仍用旧 DEK 加密——旧密钥永远无法安全销毁。

CMK re-wrap（已完成）改变包装层而不碰业务数据。DEK 再加密是互补操作：将所有已有业务数据用活跃 DEK 重新加密，使旧密钥材料可以安全退役和销毁。

与 Java 端 `2026-07-30-dek-re-encryption` 变更对齐。

## What Changes

- 新增 `DocumentRewriteStore` SPI（`src/spi/`）——适配器无关的批量文档扫描、CAS 原子替换、checkpoint 持久化契约
- 新增 `RawDocument`、`ScanOptions` 数据模型（`src/spi/`）
- 新增 `DekReEncryptionService`（`src/service/`）——编排引擎：扫描文档 → 旧 DEK 解密 → 活跃 DEK 重加密 → 活跃 HMAC key 重算盲索引 → CAS 写回
- 新增 `MongoDocumentRewriteStore`（`src/adapter/`）——MongoDB 实现：cursor 批量扫描、`_k` 字段 CAS 替换、`__lcl_checkpoints` 集合 checkpoint
- 新增 `RETIRED` key status——标记旧 key entry 为可安全删除
- 新增 `KeyVaultService.markKeysRetired(namespace, kids)` 和 `pruneRetiredKeys(namespace)` API
- 新增 `docs/key-lifecycle.md`——统一文档：CMK re-wrap vs DEK rotation vs DEK re-encryption
- 通过 EventBus 发出 `lcl.reencrypt.*` 事件

## Capabilities

### New Capabilities
- `dek-re-encryption`: 适配器无关的 DEK 再加密编排引擎——批量扫描、解密/重加密、盲索引重算、CAS 并发保护、checkpoint 断点续传、key 退役标记

### Modified Capabilities
- `key-vault`: 新增 `RETIRED` key status；新增 `markKeysRetired(namespace, kids)` 和 `pruneRetiredKeys(namespace)` 操作；`getDekByVersion` 对 RETIRED entry 抛 KeyResolutionError

## Impact

- **Code**: `src/spi/`（新增 DocumentRewriteStore、RawDocument、ScanOptions）、`src/service/`（新增 DekReEncryptionService）、`src/adapter/`（新增 MongoDocumentRewriteStore）、`src/service/KeyVaultService.js`（RETIRED 扩展）
- **APIs**: 新增 `DekReEncryptionService.reEncrypt(fieldConfigs, options)` 和 `KeyVaultService.pruneRetiredKeys(namespace)`
- **Dependencies**: 无新外部依赖（使用已有 mongodb driver）
- **Data**: 业务文档原地改写（加密字段获得新 blob + 新盲索引）；vault keys 获得 RETIRED 状态；Wire Format 不变
- **Operational**: 大集合耗时数小时；无需停写——CAS 保护允许并发应用写入；checkpoint 支持中断恢复

## Non-Goals

- 自动调度（由应用决定：cron、手动触发）
- 自动删除 RETIRED keys（运维决策，手动 API）
- 并行/分片再加密（初始实现为单线程 per namespace）
- Mongoose plugin 级自动集成（本次为独立编程式 API）
