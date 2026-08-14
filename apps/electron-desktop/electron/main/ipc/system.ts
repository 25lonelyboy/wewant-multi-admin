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
