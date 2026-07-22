# 可插拔存储适配器实现计划

## 背景

`KeyVaultService` 当前硬编码依赖 Mongoose（`getKeyVaultModel(connection)`），无法用于非 Mongoose 场景。需要对齐 Java 版的 `VaultStore` SPI 设计，引入存储抽象层。

## 目标

- 定义 `VaultStore` 抽象接口（save/load/exists/rotate/loadAll）
- 定义 `VaultDocument` 纯数据模型（plain object，无 Mongoose 依赖）
- 实现 `MongoVaultStore`（原生 mongodb driver）和 `InMemoryVaultStore`（测试用）
- `KeyVaultService` 仅依赖 VaultStore 接口
- Plugin 层支持 `vaultStore` 和 `connection` 双配置路径
- **BREAKING**: 移除 `src/model/KeyVaultDocument.js`

## 实施阶段

### 阶段 1: VaultStore SPI Layer
- 创建 `src/adapter/VaultStore.js` — 抽象基类
- 创建 `src/adapter/VaultDocument.js` — 纯数据模型 + 验证
- 创建 `src/adapter/OptimisticLockError.js` — 自定义错误
- 编写单元测试

### 阶段 2: InMemoryVaultStore
- 创建 `src/adapter/InMemoryVaultStore.js` — Map-based 实现
- 编写单元测试

### 阶段 3: MongoVaultStore
- 创建 `src/adapter/MongoVaultStore.js` — 原生 mongodb driver 适配器
- 编写单元测试（mock mongodb）

### 阶段 4: KeyVaultService 重构
- 构造函数改为 `{ vaultStore, cmkProvider, cacheTtl }`
- `ensureVaultInitialized()` 使用 VaultStore 方法
- `rotateDek()` 使用 `vaultStore.rotate()` + OptimisticLockError
- 更新单元测试使用 InMemoryVaultStore

### 阶段 5: Plugin 层更新
- `lclCryptoPlugin` 接受 `vaultStore` 或 `connection`
- 更新单元测试

### 阶段 6: 公共 API 更新
- `src/index.js` 导出新模块
- 更新 index.test.js

### 阶段 7: 集成测试与清理
- 更新集成测试使用 MongoVaultStore
- 删除 `src/model/KeyVaultDocument.js`
- 运行全量测试

## 关键文件

### 新增
- `src/adapter/VaultStore.js`
- `src/adapter/VaultDocument.js`
- `src/adapter/OptimisticLockError.js`
- `src/adapter/InMemoryVaultStore.js`
- `src/adapter/MongoVaultStore.js`
- 对应单元测试

### 修改
- `src/service/KeyVaultService.js`
- `src/plugin/lclCryptoPlugin.js`
- `src/index.js`
- 集成测试文件

### 删除
- `src/model/KeyVaultDocument.js`
