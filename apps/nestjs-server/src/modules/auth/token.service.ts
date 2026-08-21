import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constants.js';
import { BizCode } from '@multi-admin/contracts';
import { BizException } from '../../common/errors/biz.exception.js';
import { AppConfigService } from '../../config/app-config.service.js';

export const REFRESH_KEY_PREFIX = 'auth:refresh:';
export const BLACKLIST_KEY_PREFIX = 'auth:blacklist:';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** access 过期的毫秒时间戳（契约：前端一行切换） */
  expires: number;
  sid: string;
}

export interface RefreshClaims {
  sub: string;
  sid: string;
  jti: string;
}

/** Lua CAS：仅当存储值 === 期望旧值时写入新值并重置 TTL（防并发双刷） */
const ROTATE_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  redis.call('set', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0`;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  /** 登录签发：新 sid + 双令牌 + 注册会话 */
  async issuePair(user: { id: string; username: string }): Promise<TokenPair> {
    const sid = randomUUID();
    const refreshJti = randomUUID();
    const accessToken = await this.signAccess(user.id, user.username, sid);
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, sid, jti: refreshJti, type: 'refresh' },
      {
        secret: this.config.jwtRefreshSecret,
        expiresIn: this.config.jwtRefreshTtlSeconds
      }
    );
    await this.redis.set(
      REFRESH_KEY_PREFIX + sid,
      JSON.stringify({ userId: user.id, jti: refreshJti }),
      'EX',
      this.config.jwtRefreshTtlSeconds
    );
    return {
      accessToken,
      refreshToken,
      expires: Date.now() + this.config.jwtAccessTtlSeconds * 1000,
      sid
    };
  }

  /** refresh 验签 + type 强校验；任何异常一律 40103 */
  async verifyRefreshToken(token: string): Promise<RefreshClaims> {
    let payload: RefreshClaims & { type?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.jwtRefreshSecret
      });
    } catch {
      throw new BizException(
        BizCode.REFRESH_TOKEN_INVALID,
        'refreshToken 无效或已过期'
      );
    }
    if (payload.type !== 'refresh') {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID, '令牌类型错误');
    }
    return { sub: payload.sub, sid: payload.sid, jti: payload.jti };
  }

  /**
   * 轮换：Lua CAS「比对 jti → 写新值 + 重置 TTL」原子执行；
   * sid 不变、jti 换新，旧 refresh 立即失效。
   */
  async rotate(
    claims: RefreshClaims,
    user: { id: string; username: string }
  ): Promise<TokenPair> {
    const key = REFRESH_KEY_PREFIX + claims.sid;
    const stored = await this.redis.get(key);
    if (!stored) {
      throw new BizException(
        BizCode.REFRESH_TOKEN_INVALID,
        '会话不存在或已登出'
      );
    }
    const record = JSON.parse(stored) as { userId: string; jti: string };
    if (record.jti !== claims.jti) {
      throw new BizException(
        BizCode.REFRESH_TOKEN_INVALID,
        'refreshToken 已被轮换'
      );
    }
    const newRefreshJti = randomUUID();
    const newValue = JSON.stringify({ userId: user.id, jti: newRefreshJti });
    const ok = await this.redis.eval(
      ROTATE_LUA,
      1,
      key,
      stored,
      newValue,
      String(this.config.jwtRefreshTtlSeconds)
    );
    if (ok !== 1) {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID, '刷新冲突，请重试');
    }
    const accessToken = await this.signAccess(
      user.id,
      user.username,
      claims.sid
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, sid: claims.sid, jti: newRefreshJti, type: 'refresh' },
      {
        secret: this.config.jwtRefreshSecret,
        expiresIn: this.config.jwtRefreshTtlSeconds
      }
    );
    return {
      accessToken,
      refreshToken,
      expires: Date.now() + this.config.jwtAccessTtlSeconds * 1000,
      sid: claims.sid
    };
  }

  /** 登出黑名单：TTL = access 剩余寿命；已自然过期则不写 */
  async blacklist(accessJti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.redis.set(
      BLACKLIST_KEY_PREFIX + accessJti,
      '1',
      'EX',
      Math.ceil(ttlSeconds)
    );
  }

  async isBlacklisted(accessJti: string): Promise<boolean> {
    return (await this.redis.exists(BLACKLIST_KEY_PREFIX + accessJti)) === 1;
  }

  /** 登出整会话吊销：DEL sid 注册键（幂等） */
  async deleteSession(sid: string): Promise<void> {
    await this.redis.del(REFRESH_KEY_PREFIX + sid);
  }

  private signAccess(userId: string, username: string, sid: string) {
    return this.jwt.signAsync(
      { sub: userId, username, sid, jti: randomUUID(), type: 'access' },
      {
        secret: this.config.jwtAccessSecret,
        expiresIn: this.config.jwtAccessTtlSeconds
      }
    );
  }
}
