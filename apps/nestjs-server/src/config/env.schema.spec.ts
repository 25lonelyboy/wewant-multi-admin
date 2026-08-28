import { envSchema, validateEnv } from './env.schema.js';

/** 返回一份满足所有校验的完整 env 对象（JWT secrets ≥ 32 字符） */
function validEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgresql://u:p@h:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32)
  };
}

describe('envSchema', () => {
  it('仅提供必填项时可选字段应用全部默认值', () => {
    const env = validateEnv(validEnv());
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.CORS_ORIGIN).toBe('http://localhost:8848');
  });

  it('字符串数字的 PORT 被强转', () => {
    expect(validateEnv({ ...validEnv(), PORT: '8080' }).PORT).toBe(8080);
  });

  it('非法 LOG_LEVEL 抛出含字段名的错误', () => {
    expect(() => validateEnv({ ...validEnv(), LOG_LEVEL: 'verbose' })).toThrow(
      'LOG_LEVEL'
    );
  });

  it('非法 NODE_ENV 抛出错误', () => {
    expect(() => validateEnv({ ...validEnv(), NODE_ENV: 'prod' })).toThrow(
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
    const env = validateEnv(validEnv());
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
    const env = validateEnv(validEnv());
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.JWT_REFRESH_TTL).toBe('7d');
  });

  it('JWT_ACCESS_SECRET 短于 32 字符拒绝', () => {
    const raw = validEnv();
    raw.JWT_ACCESS_SECRET = 'a'.repeat(31);
    expect(envSchema.safeParse(raw).success).toBe(false);
  });

  it('JWT_ACCESS_SECRET 恰好 32 字符通过', () => {
    const raw = validEnv();
    raw.JWT_ACCESS_SECRET = 'a'.repeat(32);
    expect(envSchema.safeParse(raw).success).toBe(true);
  });

  it('JWT_REFRESH_SECRET 短于 32 字符拒绝', () => {
    const raw = validEnv();
    raw.JWT_REFRESH_SECRET = 'b'.repeat(31);
    expect(envSchema.safeParse(raw).success).toBe(false);
  });

  it('BODY_LIMIT 默认 1mb', () => {
    const raw = validEnv();
    delete raw.BODY_LIMIT;
    expect(envSchema.parse(raw).BODY_LIMIT).toBe('1mb');
  });

  it('UPLOAD_BODY_LIMIT 默认 10mb', () => {
    const raw = validEnv();
    delete raw.UPLOAD_BODY_LIMIT;
    expect(envSchema.parse(raw).UPLOAD_BODY_LIMIT).toBe('10mb');
  });

  it('PRISMA_SLOW_QUERY_MS 默认 500', () => {
    const raw = validEnv();
    delete raw.PRISMA_SLOW_QUERY_MS;
    expect(envSchema.parse(raw).PRISMA_SLOW_QUERY_MS).toBe(500);
  });

  it('DATABASE_POOL_MAX 默认 20', () => {
    const raw = validEnv();
    delete raw.DATABASE_POOL_MAX;
    expect(envSchema.parse(raw).DATABASE_POOL_MAX).toBe(20);
  });

  it('PRISMA_QUERY_LOG 默认 false', () => {
    const raw = validEnv();
    delete raw.PRISMA_QUERY_LOG;
    expect(envSchema.parse(raw).PRISMA_QUERY_LOG).toBe('false');
  });
});
