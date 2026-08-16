import { validateEnv } from './env.schema.js';

describe('envSchema', () => {
  it('空输入应用全部默认值', () => {
    const env = validateEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.CORS_ORIGIN).toBe('http://localhost:8848');
  });

  it('字符串数字的 PORT 被强转', () => {
    expect(validateEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('非法 LOG_LEVEL 抛出含字段名的错误', () => {
    expect(() => validateEnv({ LOG_LEVEL: 'verbose' })).toThrow('LOG_LEVEL');
  });

  it('非法 NODE_ENV 抛出错误', () => {
    expect(() => validateEnv({ NODE_ENV: 'prod' })).toThrow('NODE_ENV');
  });
});
