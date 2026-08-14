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
