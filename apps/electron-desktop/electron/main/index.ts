import { protocol, BrowserWindow, app } from 'electron';
import { createWindow } from './window.js';
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

void (async () => {
  await app.whenReady();
  registerAppProtocol();
  registerIPCHandlers();
  createWindow();
})();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
