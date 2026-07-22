## 1. 事件模型

- [x] 1.1 创建 `src/event/EventTier.js` — 导出 L1/L2/L3 常量（Object.freeze）
- [x] 1.2 创建 `src/event/LclEvent.js` — 不可变事件类 + Builder（event/tier/timestamp/durationMicros/result/namespace/algorithm/dekVersion/errorType/attributes），build() 校验必填字段 + 96 字符限制，Object.freeze 冻结实例

## 2. EventBus 抽象与实现

- [x] 2.1 创建 `src/event/EventBus.js` — 抽象基类，emit(event) 抛 'Not implemented'
- [x] 2.2 创建 `src/event/NoOpEventBus.js` — 单例 INSTANCE，emit() 空操作
- [x] 2.3 创建 `src/event/CompositeEventBus.js` — 接受 delegates 数组，emit() 顺序委托 + try/catch 故障隔离 + console.warn 日志
- [x] 2.4 创建 `src/event/index.js` — 导出所有 event 模块

## 3. Bootstrap 集成重构

- [x] 3.1 修改 `src/bootstrap/BootstrapContext.js` — 新增 `eventBus` 选项（优先于 onEvent）；若提供 onEvent 则包装为 CallbackEventBus 适配器；默认 NoOpEventBus.INSTANCE
- [x] 3.2 修改 `src/bootstrap/BootstrapEngine.js` — 将 emitEvent 内部方法改为构造 LclEvent 并调用 context.eventBus.emit()
- [x] 3.3 更新 `test/unit/bootstrap/BootstrapEngine.test.js` — 适配 EventBus 接口（使用收集事件的 mock EventBus 替代 onEvent 回调断言）

## 4. Plugin 集成

- [x] 4.1 修改 `src/plugin/lclCryptoPlugin.js` — 接受 `eventBus` 选项，传递到 BootstrapContext
- [x] 4.2 修改 `src/index.js` — 导出 EventBus, LclEvent, EventTier, CompositeEventBus, NoOpEventBus

## 5. 测试

- [x] 5.1 编写 `test/unit/event/LclEvent.test.js` — 覆盖：Builder 成功构建、缺少必填字段抛错、96 字符限制、Object.freeze 不可变、attributes 不可变
- [x] 5.2 编写 `test/unit/event/EventBus.test.js` — 覆盖：NoOpEventBus 单例、CompositeEventBus 多播顺序、故障隔离、空 delegates
- [x] 5.3 更新 `test/unit/bootstrap/pluginIntegration.test.js` — 新增 eventBus 选项测试

## 6. 文档与验证

- [x] 6.1 更新 `docs/architecture.md` — 新增 Event System 章节
- [x] 6.2 更新 `docs/configuration.md` — 新增 eventBus 配置说明
- [x] 6.3 运行全量测试确认无回归
