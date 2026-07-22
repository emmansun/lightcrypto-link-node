## 1. ESM 入口文件

- [ ] 1.1 创建 `src/index.mjs` ESM wrapper 文件，import CJS 入口并 re-export 所有 22 个公共 API 符号为命名导出，同时提供 default export
- [ ] 1.2 验证 `src/index.mjs` 中导出的符号列表与 `src/index.js` 的 `module.exports` 完全一致

## 2. package.json 条件导出配置

- [ ] 2.1 在 `package.json` 中添加 `exports` 字段，配置 `import` → `./src/index.mjs`、`require` → `./src/index.js`、`default` → `./src/index.js`
- [ ] 2.2 添加 `module` 字段指向 `./src/index.mjs`
- [ ] 2.3 确认 `files` 字段已包含 `src/` 目录（`.mjs` 文件自动包含）

## 3. 测试验证

- [ ] 3.1 创建 `test/esm/import-test.mjs` 脚本，使用 `import` 语法验证所有命名导出可用且类型正确
- [ ] 3.2 在 `test/esm/import-test.mjs` 中验证 default export 包含完整 API 对象
- [ ] 3.3 在 `test/esm/import-test.mjs` 中验证命名导出与 default export 属性引用一致（strict equality）
- [ ] 3.4 在 `test/unit/index.test.js` 中添加 CJS/ESM 导出一致性检查：对比 `require('../src/index.js')` 的 keys 与 `index.mjs` 中声明的导出列表
- [ ] 3.5 在 `package.json` scripts 中添加 `"test:esm": "node test/esm/import-test.mjs"` 命令
- [ ] 3.6 运行 `npm run test:esm` 验证 ESM 导入全部通过
- [ ] 3.7 运行 `npm run test:unit` 验证现有 CJS 测试无回归

## 4. 文档与收尾

- [ ] 4.1 更新 README.md 添加 ESM 导入用法示例（`import { AesGcmEncryptor } from 'lightcrypto-link-node'`）
- [ ] 4.2 运行 `npm run lint` 确认无 lint 错误
- [ ] 4.3 运行完整测试套件 `npm test` 确认全部通过
