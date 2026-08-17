import { validateEnv } from './env.schema.js';

// DATABASE_URL/REDIS_URL/JWT_*_SECRET 为必填（无默认值），各用例须携带
const requiredEnv = {
  DATABASE_URL: 'postgresql://u:p@h:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-access',
  JWT_REFRESH_SECRET: 'test-refresh'
};

describe('envSchema', () => {
  it('仅提供必填项时可选字段应用全部默认值', () => {
    const env = validateEnv(requiredEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.CORS_ORIGIN).toBe('http://localhost:8848');
  });

  it('字符串数字的 PORT 被强转', () => {
    expect(validateEnv({ ...requiredEnv, PORT: '8080' }).PORT).toBe(8080);
  });

  it('非法 LOG_LEVEL 抛出含字段名的错误', () => {
    expect(() => validateEnv({ ...requiredEnv, LOG_LEVEL: 'verbose' })).toThrow(
      'LOG_LEVEL'
    );
  });

  it('非法 NODE_ENV 抛出错误', () => {
    expect(() => validateEnv({ ...requiredEnv, NODE_ENV: 'prod' })).toThrow(
      'NODE_ENV'
    );
  });

  it('DATABASE_URL/REDIS_URL 缺失时校验失败', () => {
    const raw = { DATABASE_URL: undefined, REDIS_URL: undefined };
    expect(() => validateEnv(raw as Record<string, unknown>)).toThrow(
      /DATABASE_URL/
    );
  });

  it('DATABASE_URL/REDIS_URL 就位时通过', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgresql://u:p@h:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a',
      JWT_REFRESH_SECRET: 'b'
    });
    expect(env.DATABASE_URL).toBe('postgresql://u:p@h:5432/db');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
  });

  it('缺失 JWT_ACCESS_SECRET / JWT_REFRESH_SECRET 时校验失败', () => {
    const raw = {
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379'
      // 故意缺 JWT_*SECRET
    };
    expect(() => validateEnv(raw)).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnv(raw)).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('JWT TTL 缺省为 15m / 7d', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a',
      JWT_REFRESH_SECRET: 'b'
    });
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.JWT_REFRESH_TTL).toBe('7d');
  });
});
