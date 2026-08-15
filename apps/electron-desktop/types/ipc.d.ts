export interface SystemVersion {
  app: string;
  web: string;
  electron: string;
  node: string;
}

// preload 暴露给渲染层的 API 契约：仅具名方法，不透出 ipcRenderer 泛通道。
// 新增 IPC handler 时需同步在 preload/index.ts 登记具名包装并在此补充签名。
export interface ElectronAPI {
  versions: {
    node: string;
    electron: string;
    chrome: string;
  };
  /** 对应主进程 system:getVersion */
  getVersion(): Promise<SystemVersion>;
  /** 对应主进程 system:openExternal，仅 https 链接会被放行 */
  openExternal(url: string): Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
