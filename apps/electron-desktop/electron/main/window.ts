import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';

const preload = join(__dirname, '../preload/index.js');

export function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Multi Admin',
    icon: join(__dirname, '../../assets/icon.png'),
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
    const indexHtml = join(__dirname, '../../dist-electron/web/index.html');
    void win.loadFile(indexHtml);
  }

  // 外部链接用浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  return win;
}
