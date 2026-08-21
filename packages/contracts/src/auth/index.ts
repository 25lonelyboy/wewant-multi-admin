/** 登录请求（POST /api/v1/auth/login） */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * 对外令牌载荷：登录响应的令牌部分与刷新响应同形。
 * server 内部 TokenPair 含 sid，对外契约不含（refresh 端点剥离）。
 */
export interface TokenPayload {
  accessToken: string;
  refreshToken: string;
  /** access 过期的毫秒时间戳 */
  expires: number;
}

/** 认证画像：登录响应 = 画像 + 令牌载荷 */
export interface AuthProfile {
  avatar: string | null;
  username: string;
  nickname: string;
  roles: string[];
  permissions: string[];
}

export type LoginResponse = AuthProfile & TokenPayload;

/** 刷新响应（POST /api/v1/auth/refresh-token） */
export type RefreshResponse = TokenPayload;

/** mine 域个人信息（GET /api/v1/auth/profile，决策 #10） */
export interface UserProfile {
  avatar: string | null;
  username: string;
  nickname: string;
  email: string | null;
  phone: string | null;
  description: string | null;
}

/** 动态路由节点 meta：内置字段 + meta Json 透传字段（索引签名收纳） */
export interface AsyncRouteMeta {
  title: string;
  icon?: string;
  rank?: number;
  roles?: string[];
  showLink?: boolean;
  [key: string]: unknown;
}

/** 动态路由节点（GET /api/v1/auth/get-async-routes） */
export interface AsyncRouteNode {
  path: string;
  name?: string;
  component?: string;
  meta: AsyncRouteMeta;
  children?: AsyncRouteNode[];
}
