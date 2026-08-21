import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service.js';
import { BizCode } from '@multi-admin/contracts';
import type { RefreshResponse } from '@multi-admin/contracts';
import { BizException } from '../../common/errors/biz.exception.js';
import { TokenService } from './token.service.js';
import { derivePermissions } from './permissions.js';
import { buildRouteTree, type MenuRouteRow } from './route-tree.js';
import type { AuthUser } from './auth-user.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService
  ) {}

  /**
   * LocalStrategy 入口：始终执行 argon2 verify 消除时序差异，
   * 防止攻击者通过响应耗时区分「用户名有效」与「用户名不存在」。
   */
  async validateUser(username: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      include: {
        roles: {
          where: { role: { deletedAt: null } },
          include: { role: true }
        }
      }
    });
    // dummy hash 与真实 hash 结构一致，拉平 argon2 计算耗时
    const DUMMY_HASH =
      '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const hashToVerify = user?.password ?? DUMMY_HASH;
    const valid = await argon2.verify(hashToVerify, password);
    if (!user || !valid) {
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

  /** 轮换：旧 refresh 立即失效；用户已删/禁用 → 40103；对外剥离内部 sid */
  async refresh(refreshToken: string): Promise<RefreshResponse> {
    const claims = await this.tokens.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub }
    });
    if (!user || user.deletedAt !== null || user.status !== 'ACTIVE') {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID, '会话用户不可用');
    }
    const pair = await this.tokens.rotate(claims, {
      id: user.id,
      username: user.username
    });
    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expires: pair.expires
    };
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
    if (!user || user.deletedAt !== null || user.status !== 'ACTIVE') {
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

  /** mine 域个人信息（决策 #10）：与 get-user-info 不同，不含 roles/permissions，含四可空字段 */
  async getProfile(user: AuthUser) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        avatar: true,
        username: true,
        nickname: true,
        email: true,
        phone: true,
        description: true
      }
    });
    return {
      avatar: row?.avatar ?? null,
      username: row?.username ?? user.username,
      nickname: row?.nickname ?? user.nickname,
      email: row?.email ?? null,
      phone: row?.phone ?? null,
      description: row?.description ?? null
    };
  }

  /** get-async-routes：角色可见 MENU 树 */
  async getAsyncRoutes(user: AuthUser) {
    const roles = await this.prisma.role.findMany({
      where: { code: { in: user.roles }, deletedAt: null },
      select: { id: true, code: true }
    });
    const menus = await this.prisma.menu.findMany({
      where: {
        deletedAt: null,
        roles: { some: { roleId: { in: roles.map(r => r.id) } } }
      }
    });
    // meta 为写路径已校验的 MenuMeta（读时信任，分设计 §3.3）
    return buildRouteTree(menus as MenuRouteRow[], user.roles);
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
        where: { id: { in: roleIds }, deletedAt: null },
        select: { code: true }
      })
    ).map(r => r.code);
    const menus = await this.prisma.menu.findMany({
      where: {
        deletedAt: null,
        roles: { some: { roleId: { in: roleIds } } }
      },
      select: { type: true, permission: true }
    });
    return derivePermissions(menus, roleCodes);
  }

  private findUserWithRoles(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          where: { role: { deletedAt: null } },
          include: { role: true }
        }
      }
    });
  }
}
