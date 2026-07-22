## Context

Java 版 `lcl-core/event/` 实现了结构化事件基础设施：
- `EventBus` — 函数式接口，`emit(LclEvent)` 不抛异常
- `LclEvent` — 不可变事件模型（Builder），含 event/tier/timestamp/durationMicros/result/namespace/algorithm/dekVersion/errorType/attributes
- `EventTier` — 枚举（L1 诊断 / L2 运维 / L3 审计）
- `CompositeEventBus` — 多播委托 + 故障隔离
- `NoOpEventBus` — 单例零开销默认

Node.js 当前状态：
- `BootstrapEngine` 使用 `context.onEvent(eventName, detail)` 回调（非结构化）
- `BootstrapContext` 接受可选 `onEvent` 回调
- 无独立事件模块

## Goals / Non-Goals

**Goals:**
- 实现 EventBus 抽象基类 + LclEvent 不可变事件模型（对齐 Java 字段）
- 实现 EventTier 常量、CompositeEventBus、NoOpEventBus
- 重构 BootstrapEngine/BootstrapContext 使用 EventBus 替代 onEvent 回调
- Plugin 接受 `eventBus` 选项
- 事件安全约束：永不包含 IV/Tag/密文/密钥/明文/个人数据

**Non-Goals:**
- 不实现具体 metrics/tracing 后端（如 Prometheus、OpenTelemetry）
- 不在加密/解密热路径发射事件（性能优先，后续按需）
- 不实现事件持久化或异步队列
- 不实现事件过滤/订阅（EventBus 是单向 emit，无 subscribe）

## Decisions

### Decision 1: 目录位置

**选择**: `src/event/`（独立目录，对齐 Java `lcl-core/event/` 包）

**理由**:
- 事件是横切关注点，不属于 spi（不是存储抽象）也不属于 bootstrap（不仅服务于启动）
- Java 中 event 是独立包，Node.js 对齐

### Decision 2: EventBus 是抽象类而非接口

**选择**: 使用抽象基类（项目惯例），`emit(event)` 为必须覆盖的方法。

**理由**:
- 项目所有 SPI 均使用抽象基类模式（VaultStore, StorageAdapter 等）
- 保持一致性

### Decision 3: LclEvent 使用 Builder 模式

**选择**: 对齐 Java 的 `LclEvent.builder().event(...).tier(...).result(...).build()` 模式。

**字段映射**:
| Java 字段 | Node.js 字段 | 类型 | 必填 |
|-----------|-------------|------|------|
| event | event | string | ✅ |
| tier | tier | EventTier | ✅ |
| timestamp | timestamp | Date | 默认 now |
| durationMicros | durationMicros | number | 默认 -1 |
| result | result | string | ✅ |
| namespace | namespace | string | 可选 |
| algorithm | algorithm | string | 可选 |
| dekVersion | dekVersion | number | 默认 -1 |
| errorType | errorType | string | 可选 |
| attributes | attributes | Map<string,string> | 默认空 |

### Decision 4: 向后兼容 BootstrapContext

**选择**: `BootstrapContext` 同时接受 `eventBus`（EventBus 实例）和 `onEvent`（回调），优先使用 `eventBus`。若两者都未提供，默认 `NoOpEventBus.INSTANCE`。

**理由**:
- 避免破坏已有 bootstrap-kat-engine 测试中使用 `onEvent` 的代码
- 平滑迁移路径

### Decision 5: 事件命名规范

**选择**: 对齐 Java `lcl.<subsystem>.<operation>.<status>` 格式（小写、点分隔、最长 96 字符）。

**示例**:
- `lcl.bootstrap.started`
- `lcl.bootstrap.kat.completed`
- `lcl.bootstrap.kms.failed`
- `lcl.bootstrap.ready`

## Risks / Trade-offs

- **[Breaking change]** BootstrapContext 的 `onEvent` 被标记为 deprecated → 保留兼容但文档引导使用 `eventBus`
- **[性能]** LclEvent 对象创建开销 → NoOpEventBus 默认零开销；热路径不发射事件
- **[安全]** 事件可能泄露敏感信息 → 文档明确禁止列表 + LclEvent 不含 payload 字段
