import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service.js';
import { BizCode } from '../../common/errors/biz-code.js';
import { BizException } from '../../common/errors/biz.exception.js';
import { TokenService, type TokenPair } from './token.service.js';
import { derivePermissions } from './permissions.js';
import { buildRouteTree } from './route-tree.js';
import type { AuthUser } from './auth-user.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService
  ) {}

  /** LocalStrategy 入口：密码错误/用户不存在同码不泄露 */
  async validateUser(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { roles: { include: { role: true } } }
    });
    if (!user || !(await argon2.verify(user.password, password))) {
      throw new BizException(BizCode.UNAUTHORIZED, '用户名或密码错误');
    }
    if (user.status !== 'ACTIVE') {
      throw new BizException(BizCode.UNAUTHORIZED, '账号已禁用');
    }
    return user;
  }

  async login(user: Awaited<ReturnType<AuthService['validateUser']>>) {
    const pair = await this.tokens.issuePair({
      id: user.id,
      username: user.username
    });
    const roleCodes = user.roles.map(ur => ur.role.code);
    return {
      ...(await this.profileOf(user.id, roleCodes)),
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expires: pair.expires
    };
  }

  /** 轮换：旧 refresh 立即失效；用户已删/禁用 → 40103 */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const claims = await this.tokens.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub }
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID, '会话用户不可用');
    }
    return this.tokens.rotate(claims, { id: user.id, username: user.username });
  }

  /** 严格校验登出：黑名单 access jti + DEL sid 注册键 */
  async logout(user: AuthUser): Promise<void> {
    await this.tokens.blacklist(
      user.jti,
      user.exp - Math.floor(Date.now() / 1000)
    );
    await this.tokens.deleteSession(user.sid);
  }

  /** JwtStrategy 回调：黑名单 → 实时查库组装 req.user */
  async resolveSessionUser(payload: {
    sub: string;
    username: string;
    sid: string;
    jti: string;
    exp: number;
  }): Promise<AuthUser> {
    if (await this.tokens.isBlacklisted(payload.jti)) {
      throw new BizException(BizCode.UNAUTHORIZED, '令牌已失效');
    }
    const user = await this.findUserWithRoles(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new BizException(BizCode.UNAUTHORIZED, '用户不存在或已禁用');
    }
    const roleCodes = user.roles.map(ur => ur.role.code);
    return {
      userId: user.id,
      username: user.username,
      nickname: user.nickname,
      sid: payload.sid,
      jti: payload.jti,
      exp: payload.exp,
      roles: roleCodes,
      permissions: await this.permissionsOf(user.roles.map(ur => ur.roleId))
    };
  }

  /** get-user-info：从库实时查（非令牌快照） */
  async getUserInfo(user: AuthUser) {
    return this.profileOf(user.userId, user.roles);
  }

  /** get-async-routes：角色可见 MENU 树 */
  async getAsyncRoutes(user: AuthUser) {
    const roles = await this.prisma.role.findMany({
      where: { code: { in: user.roles } },
      select: { id: true, code: true }
    });
    const menus = await this.prisma.menu.findMany({
      where: { roles: { some: { roleId: { in: roles.map(r => r.id) } } } }
    });
    return buildRouteTree(menus, user.roles);
  }

  private async profileOf(userId: string, roleCodes: string[]) {
    const user = await this.findUserWithRoles(userId);
    const roleIds = user?.roles.map(ur => ur.roleId) ?? [];
    return {
      avatar: null,
      username: user?.username ?? '',
      nickname: user?.nickname ?? '',
      roles: roleCodes,
      permissions: await this.permissionsOf(roleIds)
    };
  }

  private async permissionsOf(roleIds: string[]): Promise<string[]> {
    const roleCodes = (
      await this.prisma.role.findMany({
        where: { id: { in: roleIds } },
        select: { code: true }
      })
    ).map(r => r.code);
    const menus = await this.prisma.menu.findMany({
      where: { roles: { some: { roleId: { in: roleIds } } } },
      select: { type: true, permission: true }
    });
    return derivePermissions(menus, roleCodes);
  }

  private findUserWithRoles(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } }
    });
  }
}
