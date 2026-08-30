import { removeToken, setToken, type DataInfo } from './auth';
import { subBefore, getQueryMap } from '@pureadmin/utils';

/**
 * 简版前端单点登录，根据实际业务自行编写，平台启动后本地可以跳后面这个链接进行测试 http://localhost:8848/#/permission/page/index?username=sso&roles=admin&accessToken=eyJhbGciOiJIUzUxMiJ9.admin
 * 划重点：
 * 判断是否为单点登录，不为则直接返回不再进行任何逻辑处理，下面是单点登录后的逻辑处理
 * 1.清空本地旧信息；
 * 2.获取url中的重要参数信息，然后通过 setToken 保存在本地；
 * 3.删除不需要显示在 url 的参数
 * 4.使用 window.location.replace 跳转正确页面
 */

const SSO_MUST_KEYS = ['username', 'roles', 'accessToken'] as const;

/** 解析 url 参数；键数恰为 3 且 must 三键齐备时判定为单点登录参数，否则返回 null */
export function getSsoParams(url: string): DataInfo<number> | null {
  const params = getQueryMap(url) as DataInfo<number>;
  const keys = Object.keys(params);
  if (keys.length !== SSO_MUST_KEYS.length) return null;
  const matched = SSO_MUST_KEYS.filter(k => keys.includes(k));
  return matched.length === SSO_MUST_KEYS.length ? params : null;
}

export function isSsoLogin(
  params: DataInfo<number> | null
): params is DataInfo<number> {
  return params !== null;
}

/** 拼接去除 roles/accessToken 后的跳转地址（url 中不再暴露敏感参数） */
export function buildSsoRedirectUrl(
  params: DataInfo<number>,
  loc: Pick<Location, 'origin' | 'pathname' | 'hash'>
): string {
  const { roles: _roles, accessToken: _accessToken, ...rest } = params;
  const query = JSON.stringify(rest)
    .replace(/["{}]/g, '')
    .replace(/:/g, '=')
    .replace(/,/g, '&');
  const hashPath = loc.hash.includes('?') ? subBefore(loc.hash, '?') : loc.hash;
  return `${loc.origin}${loc.pathname}${hashPath}?${query}`;
}

/** 单点登录主流程：非单点参数早退；命中则清旧 → 存新 → 替换跳转 */
export function handleSsoLogin(loc: Location = window.location): void {
  const params = getSsoParams(loc.href);
  if (!isSsoLogin(params)) return;

  removeToken();
  setToken(params);
  loc.replace(buildSsoRedirectUrl(params, loc));
}

handleSsoLogin();
