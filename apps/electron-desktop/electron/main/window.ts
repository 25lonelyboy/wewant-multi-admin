import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';
import { SCHEME } from './protocol.js';

// import.meta.dirname = dist-electron/main；与 esbuild 产物结构对应
const preload = join(import.meta.dirname, '../preload/index.cjs');
const DIST_ENTRY = `${SCHEME}://bundle/index.html`;

let mainWindow: BrowserWindow | null = null;
// 托盘常驻：默认关窗仅隐藏，仅托盘"退出"置位后才允许真正退出
let allowQuit = false;

export function allowAppQuit() {
  allowQuit = true;
}

export function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

export function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return mainWindow;
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Multi Admin',
    icon: join(import.meta.dirname, '../../assets/icon.png'),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadURL(DIST_ENTRY);
  }

  // 外部链接用浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 托盘常驻：关窗拦截为隐藏，进程驻留后台
  win.on('close', event => {
    if (!allowQuit) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  mainWindow = win;
  return win;
}
