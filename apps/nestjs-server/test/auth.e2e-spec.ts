import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import type { Redis } from 'ioredis';
import { AppModule } from './../src/app.module.js';
import { applyAppDefaults } from './../src/common/bootstrap/apply-app-defaults.js';
import { REDIS_CLIENT } from './../src/common/redis/redis.constants.js';
import { RedisThrottlerStorage } from './../src/common/throttler/redis-throttler.storage.js';
import { TestProtectedController } from './fixtures/test-protected.controller.js';
import { COMMON_PASSWORD } from './helpers/auth.js';

const ADMIN_PASSWORD = 'e2e-admin-password';

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

interface LoginData {
  avatar: string | null;
  username: string;
  nickname: string;
  roles: string[];
  permissions: string[];
  accessToken: string;
  refreshToken: string;
  expires: number;
}

describe('认证链路 (e2e)', () => {
  let app: INestApplication<Server>;
  let redis: Redis;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestProtectedController]
    }).compile();
    app = moduleFixture.createNestApplication();
    applyAppDefaults(app);
    await app.init();
    redis = app.get(REDIS_CLIENT);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  const server = () => request(app.getHttpServer());
  const login = (username: string, password: string) =>
    server().post('/api/v1/auth/login').send({ username, password });
  const loginAdmin = async () => {
    const res = await login('admin', ADMIN_PASSWORD).expect(200);
    return (res.body as Envelope<LoginData>).data;
  };
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  // 用例 1：登录成功/失败
  it('admin 登录：契约形态 + 通配权限集 + expires 毫秒时间戳', async () => {
    const res = await login('admin', ADMIN_PASSWORD).expect(200);
    const body = res.body as Envelope<LoginData>;
    expect(body.code).toBe(0);
    expect(body.data.roles).toEqual(['admin']);
    expect(body.data.permissions).toEqual(['*:*:*']);
    expect(body.data.avatar).toBeNull();
    expect(body.data.nickname).toBe('超级管理员');
    expect(typeof body.data.accessToken).toBe('string');
    expect(typeof body.data.refreshToken).toBe('string');
    expect(body.data.expires).toBeGreaterThan(Date.now());
  });

  it('common 登录：真实权限集（非通配）', async () => {
    const res = await login('common', COMMON_PASSWORD).expect(200);
    const { data } = res.body as Envelope<LoginData>;
    expect(data.roles).toEqual(['common']);
    expect(data.permissions).toContain('system:user:query');
    expect(data.permissions).not.toContain('*:*:*');
  });

  it('密码错误与用户不存在同为 40101', async () => {
    for (const [username, password] of [
      ['admin', 'wrong-password'],
      ['ghost-user', 'whatever']
    ] as const) {
      const res = await login(username, password);
      expect(res.status).toBe(401);
      expect((res.body as Envelope<null>).code).toBe(40101);
    }
  });

  // 用例 2：登录限流
  it('窗口内第 6 次登录 → 42901', async () => {
    for (let i = 0; i < 5; i++) {
      await login('admin', 'wrong-password').expect(401);
    }
    const res = await login('admin', 'wrong-password');
    expect(res.status).toBe(429);
    expect((res.body as Envelope<null>).code).toBe(42901);
  });

  // 用例 3：refresh 轮换
  it('轮换：新令牌对可用，旧 refresh 重用 → 40103，缺参 → 40001', async () => {
    const session = await loginAdmin();
    const res = await server()
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    const pair = (
      res.body as Envelope<{
        accessToken: string;
        refreshToken: string;
        expires: number;
      }>
    ).data;
    expect(pair.refreshToken).not.toBe(session.refreshToken);

    await server()
      .get('/api/v1/auth/get-user-info')
      .set(bearer(pair.accessToken))
      .expect(200);

    const reuse = await server()
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: session.refreshToken });
    expect((reuse.body as Envelope<null>).code).toBe(40103);

    const missing = await server().post('/api/v1/auth/refresh-token').send({});
    expect((missing.body as Envelope<null>).code).toBe(40001);
  });

  // 用例 4：登出与多端共存
  it('登出：旧 access 40101、同会话 refresh 40103，他端会话不受影响', async () => {
    const s1 = await loginAdmin();
    const s2 = await loginAdmin();

    await server()
      .post('/api/v1/auth/logout')
      .set(bearer(s1.accessToken))
      .expect(200);

    const accessDenied = await server()
      .get('/api/v1/auth/get-user-info')
      .set(bearer(s1.accessToken));
    expect((accessDenied.body as Envelope<null>).code).toBe(40101);

    const refreshDenied = await server()
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: s1.refreshToken });
    expect((refreshDenied.body as Envelope<null>).code).toBe(40103);

    await server()
      .get('/api/v1/auth/get-user-info')
      .set(bearer(s2.accessToken))
      .expect(200);
  });

  // 用例 5：越权 40301
  it('越权：common 拒 40301、admin 通配过、无令牌 40101', async () => {
    const common = (await login('common', COMMON_PASSWORD).expect(200))
      .body as Envelope<LoginData>;
    const admin = await loginAdmin();

    const noToken = await server().get('/api/v1/__test/protected');
    expect((noToken.body as Envelope<null>).code).toBe(40101);

    const denied = await server()
      .get('/api/v1/__test/protected')
      .set(bearer(common.data.accessToken));
    expect(denied.status).toBe(403);
    expect((denied.body as Envelope<null>).code).toBe(40301);

    const ok = await server()
      .get('/api/v1/__test/protected')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect((ok.body as Envelope<{ ok: boolean }>).data.ok).toBe(true);
  });

  // 用例 6：Swagger 非生产可见
  it('Swagger 非生产可见', async () => {
    const res = await server().get('/api/docs').redirects(1).expect(200);
    expect(res.text).toMatch(/swagger/i);
  });

  // 用例 7：ThrottlerStorage 并发计数精确
  it('ThrottlerStorage 并发计数精确 = N 且 TTL 只设一次', async () => {
    const storage = app.get(RedisThrottlerStorage);
    await Promise.all(
      Array.from({ length: 20 }, () =>
        storage.increment('127.0.0.1', 60_000, 100, 60_000, 'e2e-smoke')
      )
    );
    expect(await redis.get('throttle:e2e-smoke:127.0.0.1')).toBe('20');
    const pttl = await redis.pttl('throttle:e2e-smoke:127.0.0.1');
    expect(pttl).toBeGreaterThan(0);
    expect(pttl).toBeLessThanOrEqual(65_000);
  });

  // 用例 8：用户信息 + 路由树
  it('get-user-info 实时查库；get-async-routes admin 全量两组树', async () => {
    const admin = await loginAdmin();
    const info = await server()
      .get('/api/v1/auth/get-user-info')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect((info.body as Envelope<{ nickname: string }>).data.nickname).toBe(
      '超级管理员'
    );

    const routes = await server()
      .get('/api/v1/auth/get-async-routes')
      .set(bearer(admin.accessToken))
      .expect(200);
    const data = (
      routes.body as Envelope<Array<{ path: string; children?: unknown[] }>>
    ).data;
    expect(data.map(n => n.path)).toEqual(['/system', '/monitor']);
    expect(data[0].children).toHaveLength(4);
    expect(data[1].children).toHaveLength(4);
  });
});
