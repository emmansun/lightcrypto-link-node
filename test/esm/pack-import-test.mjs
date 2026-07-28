import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcl-pack-test-'));
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rootNodeModules = path.join(rootDir, 'node_modules');

const toJson = (output) => JSON.parse(output);

const run = (cwd, command, extraEnv = {}) =>
  execSync(command, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: {
      ...process.env,
      ...extraEnv
    }
  });

let tarballName = null;

try {
  const packed = toJson(run(rootDir, `${npmCmd} pack --json`));
  tarballName = packed[0].filename;
  const tarballPath = path.join(rootDir, tarballName);
  const extractDir = path.join(tempDir, 'extract');
  const localNodeModules = path.join(tempDir, 'node_modules');
  const packageDir = path.join(localNodeModules, 'lightcrypto-link-node');

  fs.mkdirSync(extractDir, { recursive: true });
  fs.mkdirSync(localNodeModules, { recursive: true });

  run(tempDir, `tar -xzf "${tarballPath}" -C "${extractDir}"`);
  fs.renameSync(path.join(extractDir, 'package'), packageDir);

  const nodePath = process.platform === 'win32'
    ? `${localNodeModules};${rootNodeModules}`
    : `${localNodeModules}:${rootNodeModules}`;

  const cjsCheck = run(
    tempDir,
    "node -e \"const lib=require('lightcrypto-link-node'); if(!lib || Object.keys(lib).length===0) throw new Error('empty CJS exports'); console.log(Object.keys(lib).length);\"",
    { NODE_PATH: nodePath }
  ).trim();

  const esmCheck = run(
    tempDir,
    "node --input-type=module -e \"import lib, * as ns from 'lightcrypto-link-node'; const keys=Object.keys(ns).filter(k=>k!=='default'); if(!keys.length) throw new Error('empty ESM named exports'); if(lib!==ns.default) throw new Error('default mismatch'); console.log(keys.length);\"",
    { NODE_PATH: nodePath }
  ).trim();

  assert.strictEqual(
    Number(cjsCheck),
    Number(esmCheck),
    'CJS and ESM exported symbol counts differ in packed artifact'
  );

  console.log(`Pack import test passed with ${cjsCheck} exports.`);
} finally {
  if (tarballName) {
    const tarballPath = path.join(rootDir, tarballName);
    if (fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath);
    }
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
}
