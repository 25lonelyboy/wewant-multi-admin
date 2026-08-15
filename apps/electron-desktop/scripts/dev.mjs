#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';

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

  await esbuild.build({
    entryPoints: [
      resolve(cwd, 'electron/main/index.ts'),
      resolve(cwd, 'electron/preload/index.ts')
    ],
    bundle: true,
    platform: 'node',
    target: 'node22',
    outdir: resolve(cwd, 'dist-electron'),
    format: 'esm',
    external: ['electron'],
    sourcemap: true,
    define: {
      'process.env.NODE_ENV': '"development"'
    }
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
  const child = spawn(
    'pnpm',
    ['--filter', '@multi-admin/pure-web', 'run', 'dev'],
    {
      stdio: 'inherit',
      shell: true
    }
  );

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

  // 在 Windows 上使用 cmd /c 执行 electron.cmd
  const isWin = process.platform === 'win32';
  const electronPath = isWin
    ? resolve(__dirname, '../node_modules/.bin/electron.cmd')
    : resolve(__dirname, '../node_modules/.bin/electron');

  const args = isWin ? ['/c', electronPath, '.'] : ['.'];
  const command = isWin ? 'cmd' : electronPath;

  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
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
