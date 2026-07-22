## 1. Bootstrap 数据模型

- [ ] 1.1 创建 `src/bootstrap/BootstrapResult.js` — PhaseResult 类（name, success, durationMs, error）+ BootstrapResult 类（status, phaseResults, durationMs, failedPhase, errorDetails, timestamp）+ 静态工厂方法 ready/failed/degraded
- [ ] 1.2 创建 `src/bootstrap/BootstrapTimeoutError.js` — 继承 Error，含 phaseName 属性
- [ ] 1.3 创建 `src/bootstrap/BootstrapContext.js` — 不可变上下文（cmkProvider 必填, vaultStore 可选, strictMode 默认 true, bootstrapTimeoutMs 默认 15000, onEvent 可选回调）

## 2. BootstrapEngine 核心

- [ ] 2.1 创建 `src/bootstrap/BootstrapEngine.js` — 顺序执行 phases，实现 FATAL/RECOVERABLE/ADVISORY 失败分类、指数退避重试（3次, 100/200/400ms）、超时检查、事件发射
- [ ] 2.2 编写 `test/unit/bootstrap/BootstrapEngine.test.js` — 覆盖：全通过→READY、FATAL→FAILED、RECOVERABLE 重试成功、RECOVERABLE 重试耗尽 strict→FAILED、RECOVERABLE 重试耗尽 tolerant→DEGRADED、ADVISORY→继续、超时→BootstrapTimeoutError

## 3. KAT 向量与加载器

- [ ] 3.1 从 `test/vectors/` 复制黄金向量到 `src/bootstrap/kat/`（aes-256-gcm.json, aes-256-cbc.json, sm4-cbc.json, blind-index.json, kcv.json），适配 KatVectorLoader 格式
- [ ] 3.2 创建 `src/bootstrap/KatVectorLoader.js` — 加载并解析 kat/ 目录下的 JSON 向量文件（loadEncryptionVectors, loadBlindIndexVectors, loadKcvVectors）

## 4. KatRunner 实现

- [ ] 4.1 创建 `src/bootstrap/KatRunner.js` — 实现 BootstrapCheck 接口，执行加密 KAT（AES-256-GCM/CBC, SM4-CBC）+ 盲索引 KAT + KCV KAT，含时间预算检查（总 200ms, 单原语 30ms advisory），暴露 getLastResults()
- [ ] 4.2 编写 `test/unit/bootstrap/KatRunner.test.js` — 覆盖：全部通过、加密向量不匹配→失败、盲索引不匹配→失败、KCV 不匹配→失败、超时 advisory

## 5. 内置检查实现

- [ ] 5.1 创建 `src/bootstrap/ConfigValidationCheck.js` — 验证 cmkProvider 存在且 getProviderId() 有效
- [ ] 5.2 创建 `src/bootstrap/KmsReachabilityCheck.js` — 调用 getPublicReference() 探测可达性
- [ ] 5.3 创建 `src/bootstrap/VaultReachabilityCheck.js` — 调用 exists() 探测 VaultStore 可达性
- [ ] 5.4 创建 `src/bootstrap/index.js` — 导出所有 bootstrap 模块 + createDefaultPhases() 工厂函数
- [ ] 5.5 编写 `test/unit/bootstrap/checks.test.js` — 覆盖三个检查的成功/失败/跳过场景

## 6. Plugin 集成

- [ ] 6.1 修改 `src/plugin/lclCryptoPlugin.js` — 新增 `bootstrap` 选项处理：true 时构造 BootstrapContext + 执行 createDefaultPhases()，失败时抛出 Error 阻止初始化
- [ ] 6.2 修改 `src/index.js` — 导出 BootstrapEngine, BootstrapContext, BootstrapResult, KatRunner, createDefaultPhases 等
- [ ] 6.3 编写 `test/unit/bootstrap/pluginIntegration.test.js` — 覆盖：bootstrap:true 通过、bootstrap:true 失败→抛错、bootstrap:false 跳过、自定义配置

## 7. 文档与验证

- [ ] 7.1 更新 `docs/configuration.md` — 新增 bootstrap 配置说明
- [ ] 7.2 更新 `docs/architecture.md` — 新增 bootstrap 模块描述
- [ ] 7.3 运行全量测试确认无回归
