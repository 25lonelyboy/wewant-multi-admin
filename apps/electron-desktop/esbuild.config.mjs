#!/usr/bin/env node
import * as esbuild from "esbuild";
import { rmSync, cpSync } from "node:fs";
import { resolve } from "node:path";

// 清理旧构建产物
try {
  rmSync("build", { recursive: true, force: true });
} catch {
  // 目录不存在，忽略
}

// 构建主进程
await esbuild.build({
  entryPoints: ["electron/main/index.ts", "electron/preload/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  outdir: "build",
  format: "esm",
  external: ["electron"],
  sourcemap: true,
  define: {
    "process.env.NODE_ENV": '"production"'
  }
});

// 复制 pure-web 构建产物
const pureWebDist = resolve("../pure-web/dist");
const targetDir = resolve("build/web");
cpSync(pureWebDist, targetDir, { recursive: true });

console.log("[build] Electron main process and web assets built successfully");
