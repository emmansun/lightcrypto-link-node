## Context

Java 版 `lcl-core/bootstrap/` 实现了完整的启动自检引擎：
- `BootstrapEngine` — 顺序执行 phases，支持 FATAL/RECOVERABLE/ADVISORY 失败分类、超时、指数退避重试
- `KatRunner` — 加密 KAT（AES-256-GCM/CBC, SM4-GCM/CBC）+ 盲索引 KAT（HMAC-SHA256）+ KCV KAT
- `ConfigValidationCheck` / `KmsReachabilityCheck` / `VaultReachabilityCheck` — 连通性检查
- `BootstrapContext` — 不可变上下文（CmkProvider, EventBus, VaultStore, strictMode, timeout）

Node.js 当前状态：
- `test/vectors/` 已有黄金向量（aes-gcm.json, aes-cbc.json, sm4-cbc.json, blind-index.json, kcv.json）
- 加密原语已实现：AesGcmEncryptor, AesCbcEncryptor, Sm4CbcEncryptor
- BlindIndexEngine, CryptoCodec, AlgorithmId, WireFormatEncoder 已就绪
- 无 EventBus（后续 change 实现），需用轻量回调替代
- 无 SM4-GCM（Java 有但 Node.js 未实现）

## Goals / Non-Goals

**Goals:**
- 实现 BootstrapEngine 顺序执行器（对齐 Java 语义：失败分类 + 超时 + 重试）
- 实现 KatRunner 使用 `test/vectors/` 黄金向量验证加密正确性
- 实现 3 个内置检查（Config / KMS / Vault）
- 提供 plugin 集成入口（`options.bootstrap`）
- 全异步（async/await），适配 Node.js 事件循环

**Non-Goals:**
- 不实现 EventBus 集成（后续 event-bus change）
- 不实现 SM4-GCM KAT（Node.js 无 SM4-GCM 加密器）
- 不实现 CanaryRunner（Java 有但优先级低）
- 不实现 SpiVersionCheck（Node.js 单包无 SPI 版本协商）
- 不实现诊断端点（Java 通过 Actuator 暴露，Node.js 后续按需）

## Decisions

### Decision 1: KAT 向量来源

**选择**: 将 `test/vectors/*.json` 复制到 `src/bootstrap/kat/` 作为运行时资源。

**理由**:
- `test/` 目录在 npm publish 时可能被排除
- KAT 向量是运行时自检必需数据，不是测试数据
- 文件小（每个 < 2KB），不影响包体积

**替代方案**: 运行时引用 `test/vectors/`（被排除风险）、内联硬编码（不可维护）

### Decision 2: 无 EventBus 时的事件通知

**选择**: BootstrapContext 接受可选 `onEvent(eventName, detail)` 回调，默认 no-op。

**理由**:
- EventBus 尚未实现，但 BootstrapEngine 需要事件通知能力
- 回调是最轻量的抽象，后续 EventBus 实现后可适配
- 对齐 Java 的 `emitEvent` 语义但不引入依赖

### Decision 3: 失败分类与重试

**选择**: 完全对齐 Java 语义：
- `FATAL` — 立即中止（如 KAT 失败 = 加密库损坏）
- `RECOVERABLE` — 最多重试 3 次，指数退避（100ms, 200ms, 400ms）；strict 模式下重试耗尽升级为 FATAL
- `ADVISORY` — 记录警告继续（如 KMS 延迟高）

**默认阶段分类**:
| Phase | Name | FailureClass |
|-------|------|-------------|
| BOOT-1 | Config Validation | FATAL |
| BOOT-2 | KMS Reachability | RECOVERABLE |
| BOOT-3 | Vault Reachability | RECOVERABLE |
| BOOT-4 | KAT | FATAL |

### Decision 4: 超时机制

**选择**: 使用 `AbortSignal.timeout()` + 手动 elapsed 检查（对齐 Java 的 nanoTime 检查）。

- 默认总超时 15s（对齐 Java `Duration.ofSeconds(15)`）
- 每个 phase 执行前检查 elapsed >= timeout → 抛出 BootstrapTimeoutError
- KAT 总预算 200ms、单原语预算 30ms（advisory 级别，不中止）

### Decision 5: 目录结构

```
src/bootstrap/
├── BootstrapEngine.js      — 顺序执行器
├── BootstrapContext.js     — 不可变上下文
├── BootstrapResult.js      — 结果模型（含 PhaseResult, FailureClass）
├── BootstrapTimeoutError.js — 超时错误
├── KatRunner.js            — KAT 向量验证
├── KatVectorLoader.js      — 加载 kat/ 目录下的 JSON 向量
├── ConfigValidationCheck.js
├── KmsReachabilityCheck.js
├── VaultReachabilityCheck.js
└── kat/                    — 黄金向量 JSON
    ├── aes-256-gcm.json
    ├── aes-256-cbc.json
    ├── sm4-cbc.json
    ├── blind-index.json
    └── kcv.json
```

## Risks / Trade-offs

- **[KAT 向量同步]** `src/bootstrap/kat/` 与 `test/vectors/` 需保持同步 → 使用脚本从 test/vectors 复制，或在 CI 中校验一致性
- **[启动延迟]** KAT + 网络检查增加启动时间 → 默认 `bootstrap: false`，生产环境显式启用；KAT 预算 200ms
- **[KMS 探测方式]** 不同 Provider 的可达性检测方式不同 → 使用 `getPublicReference()` 作为轻量探测（不触发实际加密）
- **[无 EventBus]** 事件通知降级为回调 → 后续 event-bus change 实现后适配
