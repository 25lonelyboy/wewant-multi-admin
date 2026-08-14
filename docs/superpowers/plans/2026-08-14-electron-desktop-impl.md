# Electron Desktop 应用实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `apps/electron-desktop` 中创建基于 `pure-web` 包装的桌面端应用，实现分离式架构下的 Electron 套壳方案。

**Architecture:** 采用分离式架构，`pure-web` 独立演进，`electron-desktop` 仅作为容器。开发时加载 `pure-web` dev server，生产时加载本地构建产物。严格遵循 `contextIsolation: true` 安全策略。

**Tech Stack:** Electron 37.x, electron-builder 25.x, esbuild, TypeScript, pnpm workspace

---

## 文件结构映射

```
apps/electron-desktop/
├── assets/
│   └── icon.png
├── electron/
│   ├── main/
│   │   ├── index.ts              # 主进程入口
│   │   ├── window.ts             # 窗口管理
│   │   └── ipc/
│   │       ├── index.ts          # IPC 注册器
│   │       └── system.ts         # 系统能力预留接口
│   └── preload/
│       └── index.ts              # preload 脚本
├── scripts/
│   └── dev.mjs                   # 开发模式启动脚本
├── types/
│   └── ipc.d.ts                  # IPC API 类型声明
├── build/                        # 构建产物（gitignore）
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── electron-builder.yml
```

---

## Task 1: 创建基础包结构和依赖配置

**Files:**
- Create: `apps/electron-desktop/package.json`
- Create: `apps/electron-desktop/tsconfig.json`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@multi-admin/electron-desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "build/main/index.js",
  "scripts": {
    "dev": "node scripts/dev.mjs",
    "build": "node esbuild.config.mjs && electron-builder",
    "build:dir": "node esbuild.config.mjs && electron-builder --dir",
    "lint": "eslint --cache --max-warnings 0 electron scripts --fix"
  },
  "dependencies": {
    "electron": "^37.0.0"
  },
  "devDependencies": {
    "@multi-admin/pure-web": "workspace:*",
    "@multi-admin/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "cross-env": "^10.1.0",
    "electron-builder": "^25.0.0",
    "esbuild": "^0.25.0",
    "typescript": "catalog:"
  },
  "engines": {
    "node": ">=24",
    "pnpm": ">=11"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

通过 workspace 引入 monorepo 统一基准 `@multi-admin/tsconfig`：

```json
{
  "extends": "@multi-admin/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "./build",
    "rootDir": ".",
    "baseUrl": "."
  },
  "include": ["electron/**/*", "types/**/*", "scripts/**/*"],
  "exclude": ["node_modules", "build", "dist"]
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/electron-desktop/package.json apps/electron-desktop/tsconfig.json
git commit -m "feat(desktop): 初始化 electron-desktop 包结构和 tsconfig 配置"
```

---

## Task 2: 实现主进程入口和窗口管理

**Files:**
- Create: `apps/electron-desktop/electron/main/index.ts`
- Create: `apps/electron-desktop/electron/main/window.ts`

- [ ] **Step 1: 创建窗口管理模块 window.ts**

```ts
import { join } from "node:path";
import { BrowserWindow, app, shell } from "electron";

const isDev = process.env.NODE_ENV === "development";
const preload = join(__dirname, "../preload/index.js");

export async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Multi Admin",
    icon: join(__dirname, "../../assets/icon.png"),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    const indexHtml = join(__dirname, "../../build/web/index.html");
    win.loadFile(indexHtml);
  }

  // 外部链接用浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}
```

- [ ] **Step 2: 创建主进程入口 index.ts**

```ts
import { app } from "electron";
import { createWindow } from "./window";

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.whenReady().then(async () => {
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/electron-desktop/electron/main/
git commit -m "feat(desktop): 添加主进程和窗口管理器"
```

---

## Task 3: 实现 IPC 架构（preload + main）

**Files:**
- Create: `apps/electron-desktop/electron/preload/index.ts`
- Create: `apps/electron-desktop/electron/main/ipc/index.ts`
- Create: `apps/electron-desktop/electron/main/ipc/system.ts`
- Create: `apps/electron-desktop/types/ipc.d.ts`

- [ ] **Step 1: 创建 IPC 类型声明**

```ts
// types/ipc.d.ts
export interface ElectronAPI {
  versions: {
    node: string;
    electron: string;
    chrome: string;
  };
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  send: (channel: string, ...args: any[]) => void;
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
  off: (channel: string, callback: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

- [ ] **Step 2: 创建 preload 脚本**

```ts
// electron/preload/index.ts
import { ipcRenderer, contextBridge } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome
  },

  invoke: (channel: string, ...args: any[]) =>
    ipcRenderer.invoke(channel, ...args),

  send: (channel: string, ...args: any[]) =>
    ipcRenderer.send(channel, ...args),

  on: (channel: string, callback: (...args: any[]) => void) => {
    const handler = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  }
});
```

- [ ] **Step 3: 创建系统能力预留接口**

```ts
// electron/main/ipc/system.ts
import { ipcMain, shell } from "electron";

export function registerSystemHandlers() {
  // 预留接口：打开外部链接
  ipcMain.handle("system:openExternal", async (_event, url: string) => {
    if (typeof url === "string" && url.startsWith("https:")) {
      await shell.openExternal(url);
    }
  });

  // 预留接口：获取应用版本
  ipcMain.handle("system:getVersion", () => {
    return {
      app: "0.1.0",
      electron: process.versions.electron,
      node: process.versions.node
    };
  });
}
```

- [ ] **Step 4: 创建 IPC 注册器**

```ts
// electron/main/ipc/index.ts
import { registerSystemHandlers } from "./system";

export function registerIPCHandlers() {
  registerSystemHandlers();
}
```

- [ ] **Step 5: 更新主进程入口以注册 IPC**

修改 `electron/main/index.ts`，在 `app.whenReady()` 中调用 `registerIPCHandlers()`：

```ts
import { app } from "electron";
import { createWindow } from "./window";
import { registerIPCHandlers } from "./ipc";

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.whenReady().then(async () => {
  registerIPCHandlers();
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});
```

- [ ] **Step 6: Commit**

```bash
git add apps/electron-desktop/electron/preload/ apps/electron-desktop/electron/main/ipc/ apps/electron-desktop/types/
git commit -m "feat(desktop): 实现 IPC 架构和安全的 preload 脚本"
```

---

## Task 4: 实现开发脚本 dev.mjs

**Files:**
- Create: `apps/electron-desktop/scripts/dev.mjs`

- [ ] **Step 1: 创建开发启动脚本**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/electron-desktop/scripts/dev.mjs
git commit -m "feat(desktop): 添加开发脚本和自动检测 pure-web dev server"
```

---

## Task 5: 配置主进程构建脚本和 electron-builder

**Files:**
- Create: `apps/electron-desktop/esbuild.config.mjs`
- Create: `apps/electron-desktop/electron-builder.yml`

- [ ] **Step 1: 创建 esbuild 构建脚本**

```js
#!/usr/bin/env node
import * as esbuild from "esbuild";
import { rmSync } from "node:fs";

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

console.log("[build] Electron main process built successfully");
```

- [ ] **Step 2: 创建 electron-builder 配置**

```yaml
appId: com.multiadmin.desktop
productName: Multi Admin

directories:
  output: release/${version}

files:
  - "build/**/*"
  - "assets/**/*"
  - "package.json"

asar: true

win:
  target:
    - target: nsis
      arch: [x64]
  artifactName: "${productName}_${version}_win.${ext}"

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: "Multi Admin"

mac:
  target: [dmg]
  artifactName: "${productName}_${version}_mac.${ext}"

linux:
  target: [AppImage, deb]
  artifactName: "${productName}_${version}_linux.${ext}"

# 自动更新预留（当前不启用）
# publish:
#   provider: github
#   releaseType: release
```

- [ ] **Step 3: Commit**

```bash
git add apps/electron-desktop/esbuild.config.mjs apps/electron-desktop/electron-builder.yml
git commit -m "feat(desktop): 添加构建脚本和 electron-builder 配置"
```

---

## Task 6: 复制 pure-web 产物到 electron-desktop

**Files:**
- Modify: `apps/electron-desktop/esbuild.config.mjs`
- Modify: `apps/electron-desktop/electron-builder.yml`

- [ ] **Step 1: 修改 esbuild.config.mjs 添加产物复制**

```js
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
```

- [ ] **Step 2: 更新 electron-builder.yml 确保包含 web 产物**

```yaml
appId: com.multiadmin.desktop
productName: Multi Admin

directories:
  output: release/${version}

files:
  - "build/**/*"
  - "assets/**/*"
  - "package.json"

asar: true

win:
  target:
    - target: nsis
      arch: [x64]
  artifactName: "${productName}_${version}_win.${ext}"

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: "Multi Admin"

mac:
  target: [dmg]
  artifactName: "${productName}_${version}_mac.${ext}"

linux:
  target: [AppImage, deb]
  artifactName: "${productName}_${version}_linux.${ext}"

# 自动更新预留（当前不启用）
# publish:
#   provider: github
#   releaseType: release
```

- [ ] **Step 3: Commit**

```bash
git add apps/electron-desktop/esbuild.config.mjs apps/electron-desktop/electron-builder.yml
git commit -m "feat(desktop): 集成 pure-web 构建产物复制"
```

---

## Task 7: 根 Workspace 脚本扩展

**Files:**
- Modify: `package.json`（根目录）

- [ ] **Step 1: 在根 package.json 中新增脚本**

修改 `package.json`，在 `scripts` 对象中新增：

```json
{
  "scripts": {
    "dev:desktop": "pnpm --filter @multi-admin/electron-desktop run dev",
    "build:desktop": "pnpm --filter @multi-admin/electron-desktop run build",
    "build:web": "pnpm --filter @multi-admin/pure-web run build",
    "dev": "pnpm -r --parallel run dev"
  }
}
```

注意：需要保留现有的其他脚本，只添加这 3 个新脚本。

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore(repo): 添加 electron-desktop 工作区脚本"
```

---

## Task 8: 添加根 .gitignore 规则和静态资源占位

**Files:**
- Modify: `.gitignore`（根目录）
- Create: `apps/electron-desktop/assets/.gitkeep`

- [ ] **Step 1: 在根 .gitignore 中补充 Electron 特有产物**

在根 `.gitignore` 的 `# Runtime data` 节后追加：

```diff
 # Runtime data
 pids
 *.pid
 *.seed
 *.pid.lock

+# Electron 构建产物
+**/release
```

> 说明：`node_modules/`、`.log`、`**/dist` 已在根 `.gitignore` 中通过 `**/` 通配统一忽略，无需重复。`build/` 目录是 esbuild 主进程构建产物，electron-builder 的默认 `files` 配置会包含它，需要忽略。

- [ ] **Step 2: 创建 assets 占位**

```bash
# 创建 assets 目录和占位文件，后续替换为真实图标
New-Item -ItemType Directory -Path apps/electron-desktop/assets -Force
touch apps/electron-desktop/assets/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore apps/electron-desktop/assets/.gitkeep
git commit -m "chore(desktop): 添加根 gitignore Electron 规则和 assets 占位"
```

---

## Task 9: 验证和启动测试

**Files:**
- 无新增文件

- [ ] **Step 1: 安装依赖**

```bash
pnpm install
```

- [ ] **Step 2: 验证 dev 脚本**

```bash
pnpm dev:desktop
```

Expected: Electron 窗口成功打开，加载 `pure-web` dev server 内容。

- [ ] **Step 3: 验证构建脚本**

```bash
pnpm build:desktop
```

Expected: 成功生成 `release/` 目录，包含 Windows 安装包。

- [ ] **Step 4: Commit 任何修正**

如果在验证过程中发现问题并修正，单独 commit。

---

## Self-Review Checklist

### 1. Spec Coverage

| Spec 需求 | 对应任务 |
|-----------|---------|
| 分离式架构 | Task 1-3 |
| 开发工作流（三种场景） | Task 4 |
| IPC 架构（preload + main） | Task 3 |
| 窗口配置 | Task 2 |
| 安全策略 | Task 2, Task 3 |
| 构建产物复制 | Task 5, Task 6 |
| electron-builder 配置 | Task 5 |
| 根 Workspace 脚本 | Task 7 |

### 2. Placeholder Scan

- [x] 无 `TBD`、`TODO` 或模糊描述
- [x] 所有代码均为可直接运行的完整代码
- [x] 文件路径精确

### 3. Type Consistency

- [x] `preload` 路径在 `window.ts` 和实际构建产物中保持一致（`../preload/index.js`）
- [x] IPC 通道命名遵循 `domain:action` 约定
- [x] 环境变量名称统一使用 `VITE_DEV_SERVER_URL`

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-14-electron-desktop-impl.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
