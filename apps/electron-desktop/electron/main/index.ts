import { protocol, BrowserWindow, app } from 'electron';
import { createWindow, showMainWindow, allowAppQuit } from './window.js';
import { createTray } from './tray.js';
import { registerIPCHandlers } from './ipc/index.js';
import { registerAppProtocol, SCHEME } from './protocol.js';

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  }
]);

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// 二次启动不新开实例，直接唤起已驻留的主窗口
app.on('second-instance', () => {
  showMainWindow();
});

void (async () => {
  await app.whenReady();
  registerAppProtocol();
  registerIPCHandlers();
  createWindow();
  createTray({
    onShow: showMainWindow,
    onQuit: () => {
      allowAppQuit();
      app.quit();
    }
  });
})();

app.on('window-all-closed', () => {
  // 托盘常驻场景下关窗仅隐藏，正常不会触发；触发即窗口真正销毁，按平台默认退出
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
