// 托盘常驻：关闭主窗口仅隐藏，进程驻留后台，仅托盘"退出"真正退出
import { join } from 'node:path';
import { Menu, Tray, nativeImage } from 'electron';

export interface TrayCallbacks {
  onShow: () => void;
  onQuit: () => void;
}

// 模块级持有引用，防止托盘对象被 GC 导致图标消失（部分平台行为）
let tray: Tray | null = null;

export function createTray(callbacks: TrayCallbacks): Tray {
  // dist-electron/main -> ../../assets，dev/打包产物结构一致
  const iconPath = join(import.meta.dirname, '../../assets/tray.png');
  const icon = nativeImage.createFromPath(iconPath);
  // 图标缺失时降级为空图标，保证托盘功能可用
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Multi Admin');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: callbacks.onShow },
      { type: 'separator' },
      { label: '退出', click: callbacks.onQuit }
    ])
  );
  tray.on('double-click', callbacks.onShow);
  return tray;
}
