import { app, ipcMain, shell } from 'electron';
import type { SystemVersion } from '../../../types/ipc.js';

export function registerSystemHandlers() {
  // 预留接口：打开外部链接
  ipcMain.handle('system:openExternal', async (_event, url: string) => {
    if (typeof url === 'string' && url.startsWith('https:')) {
      await shell.openExternal(url);
    }
  });

  // 预留接口：获取应用版本
  ipcMain.handle('system:getVersion', (): SystemVersion => {
    return {
      app: app.getVersion(),
      web: process.env.WEB_VERSION ?? 'unknown',
      electron: process.versions.electron,
      node: process.versions.node
    };
  });
}
