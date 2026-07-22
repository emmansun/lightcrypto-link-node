## Why

当前 lightcrypto-link-node 仅以 CommonJS 格式发布（`"type": "commonjs"`，所有源文件使用 `require()`/`module.exports`）。随着 Node.js 生态全面转向 ESM，越来越多的项目使用 `"type": "module"` 或 `import` 语法。仅提供 CJS 入口会导致 ESM 消费者无法获得命名导出（named exports）、tree-shaking 以及 IDE 自动补全等能力，降低库的可用性和竞争力。

## What Changes

- 在 `package.json` 中添加 `exports` 字段，通过条件导出（`import` / `require`）同时暴露 ESM 和 CJS 入口
- 新增 ESM 包装入口文件（`src/index.mjs` 或 `dist/esm/index.mjs`），re-export 所有公共 API 为命名导出
- 保留现有 CJS 源码（`src/index.js`）不变，确保向后兼容
- 添加 `module` 字段指向 ESM 入口，方便打包工具识别
- 更新 `files` 字段确保 ESM 入口被包含在发布产物中
- 添加 ESM 导入的单元测试验证命名导出和默认导出均可用

## Capabilities

### New Capabilities
- `dual-module-packaging`: 双模块格式（CJS + ESM）打包与条件导出配置，确保两种模块系统均可正确导入所有公共 API

### Modified Capabilities

（无现有 spec 级别行为变更，本变更仅涉及打包/分发层面）

## Impact

- **package.json**: 新增 `exports`、`module` 字段，更新 `files`
- **新增文件**: ESM 入口包装文件（`src/index.mjs`）
- **测试**: 新增 ESM 导入验证测试
- **依赖**: 无新依赖
- **向后兼容**: CJS 消费者无任何变化（`require('lightcrypto-link-node')` 行为不变）
- **CI/发布**: 无需构建步骤（采用 wrapper 方案而非编译方案）
