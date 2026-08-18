/** JwtAuthGuard 挂载到 req.user 的会话用户（权限集实时查库） */
export interface AuthUser {
  userId: string;
  username: string;
  nickname: string;
  sid: string;
  jti: string;
  /** access 的 exp（unix 秒），登出黑名单计算剩余寿命用 */
  exp: number;
  roles: string[];
  permissions: string[];
}
