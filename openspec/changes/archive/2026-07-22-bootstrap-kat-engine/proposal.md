## Why

应用启动时缺乏自检机制——如果加密库被篡改、KMS 不可达、或 Vault 存储异常，只有在首次加密/解密操作时才会发现。Java 版已实现完整的 Bootstrap Engine（BOOT-1 配置校验 → BOOT-2 KMS 连通 → BOOT-3 Vault 连通 → BOOT-4 KAT 向量验证），在启动阶段即暴露问题。Node.js 需要等价实现，确保 fail-fast。

## What Changes

- 新增 `BootstrapEngine` — 顺序执行注册的检查阶段，支持失败分类（FATAL/RECOVERABLE/ADVISORY）、超时、重试
- 新增 `KatRunner` — KAT（Known Answer Test）自检：使用 `test/vectors/` 中的黄金向量验证加密/盲索引/KCV 正确性
- 新增 `ConfigValidationCheck` — 验证必要配置（cmkProvider 存在且有效）
- 新增 `KmsReachabilityCheck` — 验证 CMK Provider 可达（调用 getPublicReference 或 wrap/unwrap 探测）
- 新增 `VaultReachabilityCheck` — 验证 VaultStore 可读写（exists + load 探测）
- 新增 `BootstrapContext` — 不可变上下文（cmkProvider, vaultStore, strictMode, timeout）
- 新增 `BootstrapResult` / `PhaseResult` — 结构化结果（READY/FAILED/DEGRADED）
- 新增 `lclCryptoPlugin` 启动时可选执行 bootstrap（`options.bootstrap: true`）

## Capabilities

### New Capabilities
- `bootstrap-engine`: BootstrapEngine 顺序执行器 + BootstrapPhase/BootstrapCheck/BootstrapContext/BootstrapResult/PhaseResult/FailureClass 数据模型
- `kat-runner`: KAT 向量验证（加密 AES-GCM/CBC + SM4-CBC、盲索引 HMAC-SHA256、KCV），使用 test/vectors/ 黄金向量
- `bootstrap-checks`: 内置检查实现（ConfigValidationCheck、KmsReachabilityCheck、VaultReachabilityCheck）

### Modified Capabilities
- `configuration-management`: lclCryptoPlugin 新增 `bootstrap` 选项，启动时可选执行自检

## Impact

- **src/bootstrap/**: 新增目录（BootstrapEngine, KatRunner, checks, models）
- **src/plugin/lclCryptoPlugin.js**: 新增 bootstrap 启动逻辑
- **test/vectors/**: 复用现有黄金向量作为 KAT 数据源（需复制到 src 可访问位置或运行时引用）
- **src/index.js**: 导出 BootstrapEngine 及相关类
- **package.json**: 无新依赖
