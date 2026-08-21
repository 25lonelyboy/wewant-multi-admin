/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { AuthService } from './auth.service.js';
import type { TokenService } from './token.service.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import * as argon2 from 'argon2';

jest.mock('argon2', () => ({ verify: jest.fn() }));

const ADMIN_ROW = {
  id: 'u1',
  username: 'admin',
  nickname: '超级管理员',
  password: 'hash',
  status: 'ACTIVE',
  deletedAt: null,
  roles: [{ roleId: 'r1', role: { code: 'admin' } }]
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; findFirst: jest.Mock };
    role: { findMany: jest.Mock };
    menu: { findMany: jest.Mock };
  };
  let tokens: {
    issuePair: jest.Mock;
    verifyRefreshToken: jest.Mock;
    rotate: jest.Mock;
    blacklist: jest.Mock;
    deleteSession: jest.Mock;
    isBlacklisted: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findFirst: jest.fn() },
      role: { findMany: jest.fn().mockResolvedValue([{ code: 'admin' }]) },
      menu: { findMany: jest.fn().mockResolvedValue([]) }
    };
    tokens = {
      issuePair: jest.fn(),
      verifyRefreshToken: jest.fn(),
      rotate: jest.fn(),
      blacklist: jest.fn().mockResolvedValue(undefined),
      deleteSession: jest.fn().mockResolvedValue(undefined),
      isBlacklisted: jest.fn().mockResolvedValue(false)
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      tokens as unknown as TokenService
    );
  });

  describe('validateUser', () => {
    it('用户不存在与密码错误同为 40101，且均调用 argon2.verify（时序拉平）', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      await expect(service.validateUser('ghost', 'x')).rejects.toMatchObject({
        code: 40101
      });
      // 用户不存在时仍然调用了 argon2.verify（dummy hash）
      expect(argon2.verify).toHaveBeenCalledTimes(1);

      (argon2.verify as jest.Mock).mockClear();
      prisma.user.findFirst.mockResolvedValue(ADMIN_ROW);
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      await expect(
        service.validateUser('admin', 'wrong')
      ).rejects.toMatchObject({ code: 40101 });
      expect(argon2.verify).toHaveBeenCalledTimes(1);
    });

    it('DISABLED 拒绝 40101；成功返回用户', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...ADMIN_ROW,
        status: 'DISABLED'
      });
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      await expect(service.validateUser('admin', 'ok')).rejects.toMatchObject({
        code: 40101
      });

      prisma.user.findFirst.mockResolvedValue(ADMIN_ROW);
      await expect(service.validateUser('admin', 'ok')).resolves.toBe(
        ADMIN_ROW
      );
    });

    it('查询带软删过滤：已删用户按不存在处理', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      await expect(service.validateUser('ghost', 'x')).rejects.toMatchObject({
        code: 40101
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ username: 'ghost', deletedAt: null })
        })
      );
    });
  });

  it('login：profile + 令牌对的契约形态', async () => {
    prisma.user.findUnique.mockResolvedValue(ADMIN_ROW);
    tokens.issuePair.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expires: 123,
      sid: 's1'
    });
    const result = await service.login(ADMIN_ROW as never);
    expect(result).toEqual({
      avatar: null,
      username: 'admin',
      nickname: '超级管理员',
      roles: ['admin'],
      permissions: ['*:*:*'],
      accessToken: 'a',
      refreshToken: 'r',
      expires: 123
    });
    expect(tokens.issuePair).toHaveBeenCalledWith({
      id: 'u1',
      username: 'admin'
    });
  });

  describe('refresh', () => {
    it('验 claims → 查用户 → rotate（对外剥离 sid）', async () => {
      const claims = { sub: 'u1', sid: 's1', jti: 'j1' };
      tokens.verifyRefreshToken.mockResolvedValue(claims);
      prisma.user.findUnique.mockResolvedValue(ADMIN_ROW);
      tokens.rotate.mockResolvedValue({
        accessToken: 'a2',
        refreshToken: 'r2',
        expires: 2,
        sid: 's1'
      });

      await expect(service.refresh('rt')).resolves.toEqual({
        accessToken: 'a2',
        refreshToken: 'r2',
        expires: 2
      });
      expect(tokens.rotate).toHaveBeenCalledWith(claims, {
        id: 'u1',
        username: 'admin'
      });
    });

    it('用户不存在/禁用 → 40103', async () => {
      tokens.verifyRefreshToken.mockResolvedValue({
        sub: 'u1',
        sid: 's1',
        jti: 'j1'
      });
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.refresh('rt')).rejects.toMatchObject({
        code: 40103
      });

      prisma.user.findUnique.mockResolvedValue({
        ...ADMIN_ROW,
        status: 'DISABLED'
      });
      await expect(service.refresh('rt')).rejects.toMatchObject({
        code: 40103
      });
    });

    it('用户已软删 → 40103', async () => {
      tokens.verifyRefreshToken.mockResolvedValue({
        sub: 'u1',
        sid: 's1',
        jti: 'j1'
      });
      prisma.user.findUnique.mockResolvedValue({
        ...ADMIN_ROW,
        deletedAt: new Date()
      });
      await expect(service.refresh('rt')).rejects.toMatchObject({
        code: 40103
      });
    });
  });

  it('logout：黑名单 access jti（TTL=剩余寿命）+ DEL sid 键', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const user = { jti: 'j1', sid: 's1', exp: nowSec + 300 } as AuthUser;
    await service.logout(user);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const ttl = tokens.blacklist.mock.calls[0]![1] as number;
    expect(tokens.blacklist).toHaveBeenCalledWith('j1', expect.any(Number));
    expect(ttl).toBeGreaterThanOrEqual(298);
    expect(ttl).toBeLessThanOrEqual(300);
    expect(tokens.deleteSession).toHaveBeenCalledWith('s1');
  });

  describe('resolveSessionUser', () => {
    const payload = {
      sub: 'u1',
      username: 'admin',
      sid: 's1',
      jti: 'j1',
      exp: 999
    };

    it('黑名单命中 → 40101', async () => {
      tokens.isBlacklisted.mockResolvedValue(true);
      await expect(service.resolveSessionUser(payload)).rejects.toMatchObject({
        code: 40101
      });
    });

    it('正常路径：实时查库组装 AuthUser', async () => {
      prisma.user.findUnique.mockResolvedValue(ADMIN_ROW);
      const user = await service.resolveSessionUser(payload);
      expect(user).toEqual({
        userId: 'u1',
        username: 'admin',
        nickname: '超级管理员',
        sid: 's1',
        jti: 'j1',
        exp: 999,
        roles: ['admin'],
        permissions: ['*:*:*']
      });
      expect(prisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['r1'] },
            deletedAt: null
          })
        })
      );
      expect(prisma.menu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null })
        })
      );
    });

    it('用户已软删 → 40101（旧令牌即时失效）', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...ADMIN_ROW,
        deletedAt: new Date()
      });
      await expect(service.resolveSessionUser(payload)).rejects.toMatchObject({
        code: 40101
      });
    });

    it('用户-角色关联查询过滤已删角色', async () => {
      prisma.user.findUnique.mockResolvedValue(ADMIN_ROW);
      await service.resolveSessionUser(payload);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            roles: {
              where: { role: { deletedAt: null } },
              include: { role: true }
            }
          }
        })
      );
    });
  });

  describe('getProfile', () => {
    it('返回 UserProfile 形状（四可空字段）', async () => {
      prisma.user.findUnique.mockResolvedValue({
        avatar: null,
        username: 'admin',
        nickname: '超级管理员',
        email: null,
        phone: null,
        description: null
      });
      const profile = await service.getProfile({
        userId: 'u1',
        username: 'admin',
        nickname: '超级管理员'
      } as never);
      expect(profile).toEqual({
        avatar: null,
        username: 'admin',
        nickname: '超级管理员',
        email: null,
        phone: null,
        description: null
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          select: expect.objectContaining({ description: true })
        })
      );
    });
  });

  describe('getAsyncRoutes 软删过滤', () => {
    it('角色与菜单查询均带 deletedAt: null', async () => {
      prisma.role.findMany.mockResolvedValue([{ id: 'r1', code: 'admin' }]);
      prisma.menu.findMany.mockResolvedValue([]);
      const user = { userId: 'u1', roles: ['admin'] } as AuthUser;
      await service.getAsyncRoutes(user);
      expect(prisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null })
        })
      );
      expect(prisma.menu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null })
        })
      );
    });
  });
});
