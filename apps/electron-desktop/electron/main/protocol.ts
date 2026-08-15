// 自定义 app:// 协议：将渲染进程请求映射到本地 dist 静态文件。
// 与 nginx 部署共用同一份 pure-web 产物（绝对路径 /assets），桌面端不产生额外构建变体。
import { protocol, net } from 'electron';
import { existsSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SCHEME = 'app';
const DIST_ROOT = join(import.meta.dirname, '../../dist-electron/web');

/** 路径穿越防护：拼接结构必须落在 DIST_ROOT 内，否则回退 */
function safeJoin(urlPath: string): string {
  const resolved = resolve(DIST_ROOT, `.${urlPath}`);
  // 带 sep 边界，避免 dist-electron/web-evil 类同前缀兄弟目录误通过
  const insideRoot =
    resolved === DIST_ROOT || resolved.startsWith(DIST_ROOT + sep);
  return insideRoot ? resolved : join(DIST_ROOT, 'index.html');
}

function shouldFeedback(filePath: string): boolean {
  return extname(filePath) === '';
}

export function registerAppProtocol() {
  protocol.handle(SCHEME, async request => {
    const { pathname } = new URL(request.url);

    // 阶段二预留： /api/ 前缀请求在此转发到后端（主进程代理，天然规避 CORS 与混合内容拦截）
    // if (pathname.startsWith('/api/')){}

    let filePath = safeJoin(pathname);
    if (shouldFeedback(filePath) || !existsSync(filePath)) {
      // 资源文件（.js/.css/图片等）缺失必须返回404，不可 feedback，否则错误被 HTML 顶替难以排查
      if (!shouldFeedback(filePath)) {
        return new Response('Not Found', { status: 404 });
      }
      filePath = join(DIST_ROOT, 'index.html');
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}
