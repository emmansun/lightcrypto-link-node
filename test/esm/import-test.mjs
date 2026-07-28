import assert from 'node:assert/strict';
import cjs from '../../src/index.js';
import esmDefault, * as esmNamespace from '../../src/index.mjs';

const cjsKeys = Object.keys(cjs).sort();
const esmNamedKeys = Object.keys(esmNamespace)
  .filter((k) => k !== 'default')
  .sort();

assert.deepStrictEqual(
  esmNamedKeys,
  cjsKeys,
  'ESM named exports must match CJS exports exactly'
);

assert.strictEqual(
  esmDefault,
  cjs,
  'ESM default export must reference the same object as CJS module.exports'
);

for (const key of cjsKeys) {
  const fromEsm = esmNamespace[key];
  const fromCjs = cjs[key];

  assert.notStrictEqual(fromEsm, undefined, `Missing ESM export: ${key}`);
  assert.strictEqual(
    typeof fromEsm,
    typeof fromCjs,
    `Type mismatch for export: ${key}`
  );
  assert.strictEqual(
    fromEsm,
    esmDefault[key],
    `ESM named export and default export property differ: ${key}`
  );
  assert.strictEqual(
    fromEsm,
    fromCjs,
    `ESM named export and CJS export must be the same reference: ${key}`
  );
}

console.log(`ESM import test passed with ${cjsKeys.length} exports.`);
