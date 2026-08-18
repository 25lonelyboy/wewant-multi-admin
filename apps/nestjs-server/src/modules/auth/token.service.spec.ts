import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';
import {
  TokenService,
  REFRESH_KEY_PREFIX,
  BLACKLIST_KEY_PREFIX
} from './token.service.js';
import type { AppConfigService } from '../../config/app-config.service.js';

describe('TokenService', () => {
  let service: TokenService;
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let redis: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    exists: jest.Mock;
    eval: jest.Mock;
  };
  const config = {
    jwtAccessSecret: 'access-secret',
    jwtRefreshSecret: 'refresh-secret',
    jwtAccessTtlSeconds: 900,
    jwtRefreshTtlSeconds: 604800
  } as unknown as AppConfigService;
  const user = { id: 'u1', username: 'admin' };

  beforeEach(() => {
    jwt = { signAsync: jest.fn(), verifyAsync: jest.fn() };
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn(),
      eval: jest.fn()
    };
    service = new TokenService(
      jwt as unknown as JwtService,
      config,
      redis as unknown as Redis
    );
  });

  it('issuePair：双令牌独立 secret/TTL、注册会话、expires 毫秒时间戳', async () => {
    jwt.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    const before = Date.now();
    const pair = await service.issuePair(user);

    expect(pair.accessToken).toBe('access-token');
    expect(pair.refreshToken).toBe('refresh-token');
    expect(pair.sid).toEqual(expect.any(String));
    expect(pair.expires).toBeGreaterThanOrEqual(before + 900_000);
    const calls = jwt.signAsync.mock.calls as unknown[][];
    expect(calls[0][1]).toMatchObject({
      secret: 'access-secret',
      expiresIn: 900
    });
    expect(calls[1][1]).toMatchObject({
      secret: 'refresh-secret',
      expiresIn: 604800
    });
    const refreshJti = (calls[1][0] as { jti: string }).jti;
    expect(redis.set).toHaveBeenCalledWith(
      REFRESH_KEY_PREFIX + pair.sid,
      JSON.stringify({ userId: 'u1', jti: refreshJti }),
      'EX',
      604800
    );
  });

  it('verifyRefreshToken：有效返 claims；type 错/验签失败 → 40103', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 'u1',
      sid: 's1',
      jti: 'j1',
      type: 'refresh'
    });
    await expect(service.verifyRefreshToken('t')).resolves.toEqual({
      sub: 'u1',
      sid: 's1',
      jti: 'j1'
    });

    jwt.verifyAsync.mockResolvedValue({
      sub: 'u1',
      sid: 's1',
      jti: 'j1',
      type: 'access'
    });
    await expect(service.verifyRefreshToken('t')).rejects.toMatchObject({
      code: 40103
    });

    jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));
    await expect(service.verifyRefreshToken('t')).rejects.toMatchObject({
      code: 40103
    });
  });

  it('rotate：键缺失/jti 不符/CAS 竞争 → 40103；成功则 sid 不变、注册值换新 jti', async () => {
    const claims = { sub: 'u1', sid: 's1', jti: 'j-old' };

    redis.get.mockResolvedValue(null);
    await expect(service.rotate(claims, user)).rejects.toMatchObject({
      code: 40103
    });

    redis.get.mockResolvedValue(
      JSON.stringify({ userId: 'u1', jti: 'j-other' })
    );
    await expect(service.rotate(claims, user)).rejects.toMatchObject({
      code: 40103
    });

    redis.get.mockResolvedValue(JSON.stringify({ userId: 'u1', jti: 'j-old' }));
    redis.eval.mockResolvedValue(0);
    await expect(service.rotate(claims, user)).rejects.toMatchObject({
      code: 40103
    });

    redis.eval.mockResolvedValue(1);
    jwt.signAsync
      .mockResolvedValueOnce('new-access')
      .mockResolvedValueOnce('new-refresh');
    const pair = await service.rotate(claims, user);
    expect(pair.sid).toBe('s1');
    expect(pair.accessToken).toBe('new-access');
    const casArgs = redis.eval.mock.calls.at(-1) as unknown[];
    const newValue = JSON.parse(casArgs[4] as string) as {
      userId: string;
      jti: string;
    };
    expect(newValue.userId).toBe('u1');
    expect(newValue.jti).not.toBe('j-old');
  });

  it('blacklist：EX=ceil(ttl)；ttl ≤ 0 不写', async () => {
    await service.blacklist('j1', 12.3);
    expect(redis.set).toHaveBeenCalledWith(
      BLACKLIST_KEY_PREFIX + 'j1',
      '1',
      'EX',
      13
    );
    redis.set.mockClear();
    await service.blacklist('j2', 0);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('isBlacklisted / deleteSession 映射 exists / del', async () => {
    redis.exists.mockResolvedValue(1);
    await expect(service.isBlacklisted('j1')).resolves.toBe(true);
    await service.deleteSession('s1');
    expect(redis.del).toHaveBeenCalledWith(REFRESH_KEY_PREFIX + 's1');
  });
});
