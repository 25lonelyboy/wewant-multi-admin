#!/usr/bin/env node
import * as esbuild from 'esbuild';
import { rmSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webPkg = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../pure-web/package.json'),
    'utf-8'
  )
);

// 清理旧构建产物
try {
  rmSync('dist-electron', { recursive: true, force: true });
} catch {
  // 目录不存在，忽略
}

async function build(entryPoints, format, extension) {
  // 构建主进程
  await esbuild.build({
    entryPoints: entryPoints,
    bundle: true,
    platform: 'node',
    target: 'node24',
    outdir: 'dist-electron',
    outbase: 'electron',
    format: format,
    outExtension: extension,
    external: ['electron'],
    sourcemap: true,
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.WEB_VERSION': JSON.stringify(webPkg.version)
    }
  });
}

await build(['electron/main/index.ts'], 'esm');
await build(['electron/preload/index.ts'], 'cjs', { '.js': '.cjs' });

// 复制 pure-web 构建产物
const pureWebDist = resolve(import.meta.dirname, '../pure-web/dist');
if (!existsSync(pureWebDist)) {
  throw new Error(
    `未找到 pure-web 构建产物：${pureWebDist}。请先执行 pnpm --filter @multi-admin/pure-web run build`
  );
}
const targetDir = resolve('dist-electron/web');
cpSync(pureWebDist, targetDir, { recursive: true });

console.log('[build] Electron main process and web assets built successfully');
