// electron/preload/index.ts
// 安全约束：仅暴露具名方法，禁止透出 ipcRenderer 泛通道（invoke/send/on/off），
// 新增 IPC 时在此按 handler 一一登记具名包装。
import { ipcRenderer, contextBridge } from 'electron';
import type { ElectronAPI } from '../../types/ipc.js';

const api: ElectronAPI = {
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome
  },

  getVersion: () => ipcRenderer.invoke('system:getVersion'),

  openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url)
};

contextBridge.exposeInMainWorld('electronAPI', api);
