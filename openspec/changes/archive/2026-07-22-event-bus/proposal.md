## Why

当前 `BootstrapEngine` 使用简单的 `onEvent(eventName, detail)` 回调进行事件通知，缺乏结构化事件模型。Java 版已实现完整的 EventBus SPI（`LclEvent` 不可变事件 + `EventTier` 分级 + `CompositeEventBus` 多播 + `NoOpEventBus` 默认），为加密操作、密钥轮换、启动自检等提供统一的可观测性基础设施。Node.js 需要等价实现，为后续 metrics/tracing/audit 集成奠定基础。

## What Changes

- 新增 `EventBus` 抽象基类 — 定义 `emit(event)` 契约，实现不得向调用方抛异常
- 新增 `LclEvent` — 不可变结构化事件模型（Builder 模式），含 event/tier/timestamp/durationMicros/result/namespace/algorithm/dekVersion/errorType/attributes
- 新增 `EventTier` — 事件分级常量（L1 诊断 / L2 运维 / L3 审计）
- 新增 `CompositeEventBus` — 多播委托，故障隔离（单个 delegate 异常不影响其余）
- 新增 `NoOpEventBus` — 单例，零开销丢弃所有事件（默认实现）
- 重构 `BootstrapEngine` — 将 `onEvent` 回调替换为 `EventBus` 接口
- 修改 `lclCryptoPlugin` — 接受 `eventBus` 选项，传递到 BootstrapContext

## Capabilities

### New Capabilities
- `event-bus`: EventBus 抽象 + LclEvent 结构化事件 + EventTier 分级 + CompositeEventBus 多播 + NoOpEventBus 默认

### Modified Capabilities
- `bootstrap-engine`: BootstrapContext 从 `onEvent` 回调升级为 `EventBus` 实例
- `configuration-management`: lclCryptoPlugin 新增 `eventBus` 选项

## Impact

- **src/event/**: 新增目录（EventBus, LclEvent, EventTier, CompositeEventBus, NoOpEventBus）
- **src/bootstrap/BootstrapContext.js**: `onEvent` → `eventBus`（EventBus 实例）
- **src/bootstrap/BootstrapEngine.js**: 使用 `eventBus.emit(LclEvent)` 替代回调
- **src/plugin/lclCryptoPlugin.js**: 新增 `eventBus` 选项
- **src/index.js**: 导出 EventBus 相关类
- **package.json**: 无新依赖
