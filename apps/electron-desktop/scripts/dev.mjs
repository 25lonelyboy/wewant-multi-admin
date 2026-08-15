#!/usr/bin/env node
import { get } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { rmSync, readFileSync } from 'node:fs';
import { run } from '@multi-admin/node-utils';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PURE_WEB_PORT = 8848;
const PURE_WEB_URL = `http://localhost:${PURE_WEB_PORT}`;

async function buildElectronMain() {
  console.log('[dev] Building Electron main process...');
  const cwd = resolve(__dirname, '..');

  // 清理旧构建产物
  try {
    rmSync(resolve(cwd, 'dist-electron'), { recursive: true, force: true });
  } catch {
    // 目录不存在，忽略
  }

  const webPkg = JSON.parse(
    readFileSync(resolve(cwd, '../pure-web/package.json'), 'utf-8')
  );

  const build = async (entryPoints, format, extension) => {
    await esbuild.build({
      entryPoints: entryPoints,
      bundle: true,
      platform: 'node',
      target: 'node22',
      outdir: resolve(cwd, 'dist-electron'),
      outbase: resolve(cwd, 'electron'),
      format: format,
      outExtension: extension,
      external: ['electron'],
      sourcemap: true,
      define: {
        'process.env.NODE_ENV': '"development"',
        'process.env.WEB_VERSION': JSON.stringify(webPkg.version)
      }
    });
  };

  await build([resolve(cwd, 'electron/main/index.ts')], 'esm');
  await build([resolve(cwd, 'electron/preload/index.ts')], 'cjs', {
    '.js': '.cjs'
  });

  console.log('[dev] Electron main process built successfully');
}

function checkDevServer() {
  return new Promise(resolve => {
    const req = get(PURE_WEB_URL, res => {
      res.destroy();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startPureWeb() {
  console.log('[dev] Starting pure-web dev server...');
  const child = run('pnpm', [
    '--filter',
    '@multi-admin/pure-web',
    'run',
    'dev'
  ]);

  // 等待 dev server 就绪
  await new Promise(resolve => {
    const interval = setInterval(async () => {
      const isReady = await checkDevServer();
      if (isReady) {
        clearInterval(interval);
        resolve();
      }
    }, 500);
  });

  return child;
}

async function startElectron() {
  console.log('[dev] Starting Electron...');
  const cwd = resolve(__dirname, '..');

  // Windows 下的可执行入口是 electron.cmd 垫片
  const electronPath = resolve(
    __dirname,
    '../node_modules/.bin/electron' +
      (process.platform === 'win32' ? '.cmd' : '')
  );

  const child = run(electronPath, ['.'], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: PURE_WEB_URL
    }
  });
  return child;
}

async function main() {
  let pureWebProcess = null;

  // 检查 pure-web dev server 是否已启动
  const isRunning = await checkDevServer();
  if (!isRunning) {
    pureWebProcess = await startPureWeb();
  } else {
    console.log('[dev] pure-web dev server already running');
  }

  // 启动 Electron
  await buildElectronMain();
  const electronProcess = await startElectron();

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n[dev] Shutting down...');
    electronProcess.kill();
    if (pureWebProcess) pureWebProcess.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    electronProcess.kill();
    if (pureWebProcess) pureWebProcess.kill();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[dev] Error:', err);
  process.exit(1);
});
