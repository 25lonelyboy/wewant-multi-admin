#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const PURE_WEB_PORT = 5173;
const PURE_WEB_URL = `http://localhost:${PURE_WEB_PORT}`;

function checkDevServer() {
  return new Promise((resolve) => {
    const req = createServer().listen(PURE_WEB_PORT, () => {
      req.close();
      resolve(false);
    });
    req.on("error", () => resolve(true));
  });
}

async function startPureWeb() {
  console.log("[dev] Starting pure-web dev server...");
  const child = spawn("pnpm", ["--filter", "@multi-admin/pure-web", "run", "dev"], {
    stdio: "inherit",
    shell: true
  });

  // 等待 dev server 就绪
  await new Promise((resolve) => {
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
  console.log("[dev] Starting Electron...");
  const electronPath = "node_modules/.bin/electron";
  const child = spawn(electronPath, ["."], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
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
    console.log("[dev] pure-web dev server already running");
  }

  // 启动 Electron
  const electronProcess = await startElectron();

  // 优雅退出
  process.on("SIGINT", () => {
    console.log("\n[dev] Shutting down...");
    electronProcess.kill();
    if (pureWebProcess) pureWebProcess.kill();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    electronProcess.kill();
    if (pureWebProcess) pureWebProcess.kill();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[dev] Error:", err);
  process.exit(1);
});
