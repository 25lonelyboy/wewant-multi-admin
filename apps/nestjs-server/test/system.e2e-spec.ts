import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import type { Redis } from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppModule } from './../src/app.module.js';
import { applyAppDefaults } from './../src/common/bootstrap/apply-app-defaults.js';
import { REDIS_CLIENT } from './../src/common/redis/redis.constants.js';
import { COMMON_PASSWORD } from './helpers/auth.js';

const ADMIN_PASSWORD = 'e2e-admin-password';

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

interface LoginData {
  username: string;
  roles: string[];
  permissions: string[];
  accessToken: string;
  refreshToken: string;
}

interface UserInfo {
  username: string;
  roles: string[];
  permissions: string[];
}

describe('system RBAC CRUD (e2e)', () => {
  let app: INestApplication<Server>;
  let redis: Redis;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public'
    })
  });
  let adminToken = '';
  let commonToken = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();
    app = moduleFixture.createNestApplication();
    applyAppDefaults(app);
    await app.init();
    redis = app.get(REDIS_CLIENT);
    // 套件级 FLUSHDB：重置限流计数，防跨 spec 文件同分钟累积击穿限额
    await redis.flushdb();
    // 预登录缓存令牌：登录限额 5 次/分，全套件只登录 admin/common 各一次
    adminToken = await loginToken('admin', ADMIN_PASSWORD);
    commonToken = await loginToken('common', COMMON_PASSWORD);
    await prisma.$connect();
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = (method: 'get' | 'post' | 'put' | 'delete', url: string) =>
    server()[method](`/api/v1${url}`);
  const expectData = async <T>(req: request.Test): Promise<T> => {
    const res = await req;
    expect(res.status).toBeLessThan(300);
    const body = res.body as Envelope<T>;
    expect(body.code).toBe(0);
    return body.data;
  };
  const expectError = async (
    req: request.Test,
    status: number,
    code: number
  ): Promise<string> => {
    const res = await req;
    expect(res.status).toBe(status);
    const body = res.body as Envelope<unknown>;
    expect(body.code).toBe(code);
    return body.message;
  };
  const loginToken = async (username: string, password: string) => {
    const res = await api('post', '/auth/login')
      .send({ username, password })
      .expect(200);
    return (res.body as Envelope<LoginData>).data.accessToken;
  };
  const adminUser = () =>
    prisma.user.findFirstOrThrow({
      where: { username: 'admin', deletedAt: null }
    });
  const adminRole = () =>
    prisma.role.findFirstOrThrow({ where: { code: 'admin', deletedAt: null } });

  // ---------- 类 1：CRUD 全链路（含软删断言组） ----------
  describe('CRUD 全链路', () => {
    it('用户域：创建 → 分页/筛选 → 更新 → 角色分配往返 → 软删语义', async () => {
      const role = await adminRole();
      const created = await expectData<{
        id: string;
        username: string;
        roles: string[];
      }>(
        api('post', '/system/users')
          .set(bearer(adminToken))
          .send({
            username: 'e2e-crud-user',
            password: 'e2e-crud-password',
            nickname: 'CRUD 用户',
            roleIds: [role.id]
          })
      );
      expect(created.username).toBe('e2e-crud-user');
      expect(created.roles).toEqual(['admin']);

      const page = await expectData<{
        items: { username: string }[];
        total: number;
        page: number;
        pageSize: number;
      }>(
        api('get', '/system/users?page=1&pageSize=10&username=e2e-crud').set(
          bearer(adminToken)
        )
      );
      expect(page.items.map(i => i.username)).toContain('e2e-crud-user');
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(10);

      const updated = await expectData<{ nickname: string; status: string }>(
        api('put', `/system/users/${created.id}`)
          .set(bearer(adminToken))
          .send({ nickname: '已更新' })
      );
      expect(updated.nickname).toBe('已更新');

      const roleIds = await expectData<string[]>(
        api('get', `/system/users/${created.id}/roles`).set(bearer(adminToken))
      );
      expect(roleIds).toEqual([role.id]);
      await expectData(
        api('put', `/system/users/${created.id}/roles`)
          .set(bearer(adminToken))
          .send({ roleIds: [] })
      );
      expect(
        await expectData<string[]>(
          api('get', `/system/users/${created.id}/roles`).set(
            bearer(adminToken)
          )
        )
      ).toEqual([]);

      await expectData(
        api('delete', `/system/users/${created.id}`).set(bearer(adminToken))
      );
      // 软删断言组：列表不可见 / 同名可再建（部分唯一索引）/ 重复删 40404
      const afterDelete = await expectData<{ items: { username: string }[] }>(
        api('get', '/system/users?username=e2e-crud').set(bearer(adminToken))
      );
      expect(afterDelete.items.map(i => i.username)).not.toContain(
        'e2e-crud-user'
      );
      await expectData(
        api('post', '/system/users').set(bearer(adminToken)).send({
          username: 'e2e-crud-user',
          password: 'e2e-crud-password',
          nickname: '同名重建'
        })
      );
      await expectError(
        api('delete', `/system/users/${created.id}`).set(bearer(adminToken)),
        404,
        40404
      );
    });

    it('角色域：创建 → 菜单分配往返 → 软删后 users/roles 与 roles/all 均不可见', async () => {
      const created = await expectData<{ id: string; code: string }>(
        api('post', '/system/roles')
          .set(bearer(adminToken))
          .send({ code: 'e2e-crud-role', name: 'CRUD 角色' })
      );

      const menus = await prisma.menu.findMany({
        where: { name: { in: ['System', 'SystemUser'] }, deletedAt: null }
      });
      await expectData(
        api('put', `/system/roles/${created.id}/menus`)
          .set(bearer(adminToken))
          .send({ menuIds: menus.map(m => m.id) })
      );
      expect(
        await expectData<string[]>(
          api('get', `/system/roles/${created.id}/menus`).set(
            bearer(adminToken)
          )
        )
      ).toEqual(expect.arrayContaining(menus.map(m => m.id)));

      await expectData(
        api('delete', `/system/roles/${created.id}`).set(bearer(adminToken))
      );
      const dbRole = await prisma.role.findUnique({
        where: { id: created.id }
      });
      expect(dbRole?.deletedAt).not.toBeNull();
      const all = await expectData<{ code: string }[]>(
        api('get', '/system/roles/all').set(bearer(adminToken))
      );
      expect(all.map(r => r.code)).not.toContain('e2e-crud-role');
    });

    it('GET /system/users/:id 详情 200 / 软删后 40404', async () => {
      const created = await expectData<{ id: string }>(
        api('post', '/system/users').set(bearer(adminToken)).send({
          username: 'detail-probe',
          password: COMMON_PASSWORD,
          nickname: '详情探针'
        })
      );
      const detail = await expectData<{ id: string; username: string }>(
        api('get', `/system/users/${created.id}`).set(bearer(adminToken))
      );
      expect(detail.username).toBe('detail-probe');
      await expectData(
        api('delete', `/system/users/${created.id}`).set(bearer(adminToken))
      );
      await expectError(
        api('get', `/system/users/${created.id}`).set(bearer(adminToken)),
        404,
        40404
      );
    });

    it('GET /system/roles/:id 详情 200 / 软删后 40404', async () => {
      const created = await expectData<{ id: string }>(
        api('post', '/system/roles')
          .set(bearer(adminToken))
          .send({ code: 'detail-probe-role', name: '详情探针角色' })
      );
      const detail = await expectData<{ id: string; code: string }>(
        api('get', `/system/roles/${created.id}`).set(bearer(adminToken))
      );
      expect(detail.code).toBe('detail-probe-role');
      await expectData(
        api('delete', `/system/roles/${created.id}`).set(bearer(adminToken))
      );
      await expectError(
        api('get', `/system/roles/${created.id}`).set(bearer(adminToken)),
        404,
        40404
      );
    });

    it('菜单域：建树 → 树可见 → 软删后树不可见且子树物理保留', async () => {
      const group = await expectData<{ id: string }>(
        api('post', '/system/menus').set(bearer(adminToken)).send({
          type: 'MENU',
          name: 'E2EGroup',
          title: 'e2e 组',
          path: '/e2e'
        })
      );
      const page = await expectData<{ id: string }>(
        api('post', '/system/menus').set(bearer(adminToken)).send({
          type: 'MENU',
          name: 'E2EPage',
          title: 'e2e 页',
          path: '/e2e/page',
          parentId: group.id
        })
      );

      const tree = await expectData<{ name?: string; children?: unknown[] }[]>(
        api('get', '/system/menus').set(bearer(adminToken))
      );
      const found = JSON.stringify(tree);
      expect(found).toContain('E2EGroup');
      expect(found).toContain('E2EPage');

      await expectData(
        api('delete', `/system/menus/${group.id}`).set(bearer(adminToken))
      );
      const afterDelete = JSON.stringify(
        await expectData(api('get', '/system/menus').set(bearer(adminToken)))
      );
      expect(afterDelete).not.toContain('E2EGroup');
      expect(afterDelete).not.toContain('E2EPage');
      // §4.3：只标当前节点，子节点物理保留（孤儿不可见）
      const child = await prisma.menu.findUnique({ where: { id: page.id } });
      expect(child?.deletedAt).toBeNull();
      expect(child?.parentId).toBe(group.id);
    });

    it('GET /system/menus/:id 详情 200；软删父后子节点断链 40404', async () => {
      const parent = await expectData<{ id: string }>(
        api('post', '/system/menus').set(bearer(adminToken)).send({
          type: 'MENU',
          name: 'ChainParent',
          title: '断链父',
          path: '/chain-parent'
        })
      );
      const child = await expectData<{ id: string }>(
        api('post', '/system/menus').set(bearer(adminToken)).send({
          type: 'MENU',
          parentId: parent.id,
          name: 'ChainChild',
          title: '断链子',
          path: '/chain-child'
        })
      );
      const detail = await expectData<{ id: string }>(
        api('get', `/system/menus/${child.id}`).set(bearer(adminToken))
      );
      expect(detail.id).toBe(child.id);
      // 软删父 → 子成为逻辑孤儿，详情按断链 40404（与树隐身口径对齐）
      await expectData(
        api('delete', `/system/menus/${parent.id}`).set(bearer(adminToken))
      );
      await expectError(
        api('get', `/system/menus/${child.id}`).set(bearer(adminToken)),
        404,
        40404
      );
      // 卫生收尾：软删子节点，避免留下 alive 孤儿
      await expectData(
        api('delete', `/system/menus/${child.id}`).set(bearer(adminToken))
      );
    });
  });

  // ---------- 类 2：授权矩阵 ----------
  describe('授权矩阵', () => {
    it('单权限点角色：查询过、写操作 40301；admin 通配全过；未登录 40101', async () => {
      // 套件内建专用角色，只挂 system:user:query 一点（不动共享 common 角色）
      const role = await expectData<{ id: string }>(
        api('post', '/system/roles')
          .set(bearer(adminToken))
          .send({ code: 'e2e-matrix-role', name: '矩阵角色' })
      );
      const btn = await prisma.menu.findFirstOrThrow({
        where: { permission: 'system:user:query', deletedAt: null }
      });
      await expectData(
        api('put', `/system/roles/${role.id}/menus`)
          .set(bearer(adminToken))
          .send({ menuIds: [btn.id] })
      );
      const tempUser = await expectData<{ id: string }>(
        api('post', '/system/users')
          .set(bearer(adminToken))
          .send({
            username: 'e2e-matrix-user',
            password: 'e2e-matrix-password',
            nickname: '矩阵用户',
            roleIds: [role.id]
          })
      );
      const token = await loginToken('e2e-matrix-user', 'e2e-matrix-password');

      const page = await expectData<{ items: unknown[] }>(
        api('get', '/system/users').set(bearer(token))
      );
      expect(Array.isArray(page.items)).toBe(true);
      await expectError(
        api('post', '/system/users').set(bearer(token)).send({
          username: 'x',
          password: 'y',
          nickname: 'z'
        }),
        403,
        40301
      );
      await expectError(
        api('delete', `/system/users/${tempUser.id}`).set(bearer(token)),
        403,
        40301
      );

      // admin 通配 *:*:*：同一批端点全过
      await expectData<{ items: unknown[] }>(
        api('get', '/system/roles').set(bearer(adminToken))
      );
      await expectData(
        api('delete', `/system/users/${tempUser.id}`).set(bearer(adminToken))
      );

      // 未登录
      await expectError(api('get', '/system/users'), 401, 40101);
    });
  });

  // ---------- 类 3：护栏 ----------
  describe('护栏', () => {
    it('禁删/禁禁用内置 admin（40900）', async () => {
      const admin = await adminUser();
      const adminRoleId = (await adminRole()).id;
      expect(
        await expectError(
          api('delete', `/system/users/${admin.id}`).set(bearer(adminToken)),
          409,
          40900
        )
      ).toContain('管理员');
      expect(
        await expectError(
          api('put', `/system/users/${admin.id}`)
            .set(bearer(adminToken))
            .send({ status: 'DISABLED' }),
          409,
          40900
        )
      ).toContain('管理员');
      expect(
        await expectError(
          api('delete', `/system/roles/${adminRoleId}`).set(bearer(adminToken)),
          409,
          40900
        )
      ).toContain('管理员');
      expect(
        await expectError(
          api('put', `/system/roles/${adminRoleId}`)
            .set(bearer(adminToken))
            .send({ status: 'DISABLED' }),
          409,
          40900
        )
      ).toContain('管理员');
    });

    it('禁操作自己：禁用自己/删除自己/改自己角色分配（40900）', async () => {
      const role = await expectData<{ id: string }>(
        api('post', '/system/roles')
          .set(bearer(adminToken))
          .send({ code: 'e2e-guard-role', name: '护栏角色' })
      );
      // 给护栏角色分配 user update/delete 权限，以便通过权限守卫到达自操作护栏
      const guardBtns = await prisma.menu.findMany({
        where: {
          permission: { in: ['system:user:update', 'system:user:delete'] },
          deletedAt: null
        }
      });
      await expectData(
        api('put', `/system/roles/${role.id}/menus`)
          .set(bearer(adminToken))
          .send({ menuIds: guardBtns.map(m => m.id) })
      );
      const tempUser = await expectData<{ id: string }>(
        api('post', '/system/users')
          .set(bearer(adminToken))
          .send({
            username: 'e2e-guard-user',
            password: 'e2e-guard-password',
            nickname: '护栏用户',
            roleIds: [role.id]
          })
      );
      const token = await loginToken('e2e-guard-user', 'e2e-guard-password');

      await expectError(
        api('put', `/system/users/${tempUser.id}`)
          .set(bearer(token))
          .send({ status: 'DISABLED' }),
        409,
        40900
      );
      await expectError(
        api('delete', `/system/users/${tempUser.id}`).set(bearer(token)),
        409,
        40900
      );
      await expectError(
        api('put', `/system/users/${tempUser.id}`)
          .set(bearer(token))
          .send({ roleIds: [] }),
        409,
        40900
      );
      await expectError(
        api('put', `/system/users/${tempUser.id}/roles`)
          .set(bearer(token))
          .send({ roleIds: [] }),
        409,
        40900
      );

      await expectData(
        api('delete', `/system/users/${tempUser.id}`).set(bearer(adminToken))
      );
    });

    it('菜单防环：父节点指向自身 40900', async () => {
      const menu = await expectData<{ id: string }>(
        api('post', '/system/menus').set(bearer(adminToken)).send({
          type: 'MENU',
          name: 'E2ECycle',
          title: '防环用例',
          path: '/cycle'
        })
      );
      expect(
        await expectError(
          api('put', `/system/menus/${menu.id}`)
            .set(bearer(adminToken))
            .send({ parentId: menu.id }),
          409,
          40900
        )
      ).toContain('自身');
      await expectData(
        api('delete', `/system/menus/${menu.id}`).set(bearer(adminToken))
      );
    });
  });

  // ---------- 类 4：写后读一致性 ----------
  describe('写后读一致性', () => {
    it('改角色-菜单关联后，common 权限集与路由树下一请求即时变化', async () => {
      const commonRole = await prisma.role.findFirstOrThrow({
        where: { code: 'common', deletedAt: null }
      });
      const baseline = await expectData<UserInfo>(
        api('get', '/auth/get-user-info').set(bearer(commonToken))
      );
      expect(baseline.permissions).toContain('system:user:query');

      // 摘除全部菜单 → 权限点与路由树即时清空
      await expectData(
        api('put', `/system/roles/${commonRole.id}/menus`)
          .set(bearer(adminToken))
          .send({ menuIds: [] })
      );
      const emptied = await expectData<UserInfo>(
        api('get', '/auth/get-user-info').set(bearer(commonToken))
      );
      expect(emptied.permissions).not.toContain('system:user:query');
      const routes = await expectData<unknown[]>(
        api('get', '/auth/get-async-routes').set(bearer(commonToken))
      );
      expect(routes).toEqual([]);

      // 恢复既有绑定（System 组 + SystemUser 页 + query 按钮，对齐 helpers/auth.ts）
      const menus = await prisma.menu.findMany({
        where: {
          name: { in: ['System', 'SystemUser', 'SystemUser:query'] },
          deletedAt: null
        }
      });
      await expectData(
        api('put', `/system/roles/${commonRole.id}/menus`)
          .set(bearer(adminToken))
          .send({ menuIds: menus.map(m => m.id) })
      );
      const restored = await expectData<UserInfo>(
        api('get', '/auth/get-user-info').set(bearer(commonToken))
      );
      expect(restored.permissions).toContain('system:user:query');
    });

    it('软删用户后其旧令牌下一请求 40101（P3 实时查库 + 软删过滤）', async () => {
      const tempUser = await expectData<{ id: string }>(
        api('post', '/system/users').set(bearer(adminToken)).send({
          username: 'e2e-ghost-user',
          password: 'e2e-ghost-password',
          nickname: '幽灵用户'
        })
      );
      const token = await loginToken('e2e-ghost-user', 'e2e-ghost-password');
      await expectData<UserInfo>(
        api('get', '/auth/get-user-info').set(bearer(token))
      );

      await expectData(
        api('delete', `/system/users/${tempUser.id}`).set(bearer(adminToken))
      );
      await expectError(
        api('get', '/auth/get-user-info').set(bearer(token)),
        401,
        40101
      );
    });
  });
});
