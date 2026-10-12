// 覆盖率门禁：用 Node 内置覆盖率，不引额外依赖；只统计本应用的 src。
//
// ⚠️ 不能写成一行 package.json 脚本：`src/**` 会被 shell 展开成一串文件路径，
// `--test-coverage-include` 收到的就不再是模式，报告会变成空的。这里用数组参数启动子进程，
// 不经过 shell，模式原样传下去。
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const testDir = join(appRoot, 'test');
const testFiles = readdirSync(testDir)
  .filter(name => name.endsWith('.ts'))
  .sort()
  .map(name => join('test', name));

const result = spawnSync(
  process.execPath,
  [
    '--import',
    'tsx',
    '--test',
    '--experimental-test-coverage',
    '--test-coverage-include=src/**',
    '--test-coverage-lines=90',
    '--test-coverage-functions=85',
    '--test-coverage-branches=80',
    ...testFiles
  ],
  { cwd: appRoot, stdio: 'inherit' }
);

process.exit(result.status ?? 1);
