## Context

lightcrypto-link-node 当前以纯 CommonJS 格式发布：`package.json` 中 `"type": "commonjs"`、`"main": "src/index.js"`，所有 20+ 源文件使用 `require()`/`module.exports`。项目无构建步骤，源码即发布产物。

Node.js 自 v12 起稳定支持 ESM，当前主流库均已提供双格式入口。ESM 消费者通过 `import` 导入纯 CJS 包时，只能获得 default export（整个 `module.exports` 对象），无法使用命名导入（`import { AesGcmEncryptor } from 'lightcrypto-link-node'`），且丧失 tree-shaking 能力。

## Goals / Non-Goals

**Goals:**
- ESM 消费者可通过 `import { X } from 'lightcrypto-link-node'` 使用所有公共 API
- CJS 消费者行为完全不变（`require('lightcrypto-link-node')` 保持现有语义）
- 零构建步骤：不引入 bundler/transpiler，保持"源码即产物"的简洁发布流程
- 提供默认导出（default export）以兼容 `import lib from 'lightcrypto-link-node'` 用法

**Non-Goals:**
- 不将源码从 CJS 迁移到 ESM（风险大、收益低）
- 不引入 TypeScript 编译或 bundler（tsup/rollup/esbuild）
- 不提供子路径导出（如 `lightcrypto-link-node/crypto`）——未来可扩展
- 不改变现有公共 API 签名或行为

## Decisions

### Decision 1: 采用 ESM wrapper 方案（`.mjs` 包装文件）

**选择**: 新增 `src/index.mjs`，通过 `import` CJS 入口并 re-export 命名导出。

**替代方案**:
- A) 使用 bundler（tsup/rollup）生成 `dist/esm/`：引入构建复杂度，与项目"零构建"理念冲突
- B) 将源码全部转为 ESM + CJS wrapper：破坏性大，所有 `require()` 需改为 `import`，测试需全面调整
- C) 使用 `module.createRequire` 在 `.mjs` 中加载 CJS：Node.js 原生支持，但命名导出需手动列举

**理由**: 方案 C（wrapper）最简洁——仅需一个 `.mjs` 文件手动 re-export 所有命名导出，无构建依赖，维护成本低。Node.js 的 CJS-ESM 互操作保证 `import cjs from './index.js'` 可获取 `module.exports` 对象。

### Decision 2: `package.json` 使用 `exports` 条件导出

```json
{
  "main": "src/index.js",
  "module": "src/index.mjs",
  "exports": {
    ".": {
      "import": "./src/index.mjs",
      "require": "./src/index.js",
      "default": "./src/index.js"
    }
  }
}
```

**理由**: `exports` 字段是 Node.js 官方推荐的条件导出机制。保留 `main` 兼容旧版 Node/bundler。`module` 字段供 webpack/rollup 等打包工具识别 ESM 入口。

### Decision 3: ESM wrapper 实现方式

```js
// src/index.mjs
import cjs from './index.js';

export const { CryptoCodec, BsonCodec, ... } = cjs;
export default cjs;
```

使用解构赋值从 CJS default import 中提取所有命名导出，同时提供 default export。

**理由**: 这是 Node.js 官方文档推荐的 CJS→ESM 包装模式，无需 `createRequire`，运行时开销为零。

### Decision 4: 测试策略

新增 `test/unit/esm-import.test.mjs` 使用 `import` 语法验证：
- 所有命名导出可用且类型正确
- default export 包含完整 API
- 命名导出与 default export 引用同一实例

Jest 通过 `--experimental-vm-modules` 或独立 Node.js 脚本执行 `.mjs` 测试。考虑到 Jest 对 ESM 支持仍为实验性，采用 Node.js 原生 `--test` 或简单断言脚本作为 ESM 验证手段。

## Risks / Trade-offs

- **[命名导出同步维护]** → 新增公共 API 时需同步更新 `index.mjs` 的导出列表。缓解：在 `index.test.js` 中添加自动对比测试，检测 `index.js` 与 `index.mjs` 导出是否一致。
- **[Node.js CJS-ESM 互操作边界]** → 某些极端场景（如 `__dirname` 在 ESM 中不可用）不影响本库，因为 wrapper 文件仅做 re-export。
- **[打包工具兼容性]** → 极少数旧版 bundler 不识别 `exports` 字段。缓解：保留 `main` + `module` 字段作为 fallback。
- **[`.mjs` 文件在 `"type": "commonjs"` 包中]** → Node.js 规定 `.mjs` 扩展名始终被视为 ESM，不受 `package.json` `type` 字段影响，无冲突。
