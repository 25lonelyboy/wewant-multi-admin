/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { RoleService } from './role.service.js';
import type { PrismaService } from '../../../database/prisma.service.js';
import { BizCode } from '../../../common/errors/biz-code.js';

const ROLE_ROW = {
  id: 'r1',
  code: 'editor',
  name: '编辑',
  status: 'ACTIVE',
  remark: null,
  createdAt: new Date('2026-08-19T00:00:00Z'),
  updatedAt: new Date('2026-08-19T00:00:00Z'),
  menus: [] as Array<{ menuId: string }>
};

describe('RoleService', () => {
  let service: RoleService;
  let prisma: {
    role: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    roleMenu: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    menu: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      role: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      },
      roleMenu: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn()
      },
      menu: { findMany: jest.fn() },
      $transaction: jest.fn()
    };
    service = new RoleService(prisma as unknown as PrismaService);
  });

  describe('list / all', () => {
    it('list 带软删过滤的分页', async () => {
      prisma.$transaction.mockResolvedValue([[ROLE_ROW], 1]);
      const result = await service.list({});
      expect(prisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null })
        })
      );
      expect(result.total).toBe(1);
    });

    it('list 条件查询：name/code 模糊 + status 精确均进 where', async () => {
      prisma.$transaction.mockResolvedValue([[ROLE_ROW], 1]);
      await service.list({ name: '编', code: 'ed', status: 'ACTIVE' });
      expect(prisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: '编', mode: 'insensitive' },
            code: { contains: 'ed', mode: 'insensitive' },
            status: 'ACTIVE'
          })
        })
      );
    });

    it('all 不分页返回 {id,name,code}', async () => {
      prisma.role.findMany.mockImplementation(
        (args?: { select?: Record<string, boolean> }) => {
          const row = args?.select
            ? Object.fromEntries(
                Object.entries(ROLE_ROW).filter(([k]) => args.select![k])
              )
            : ROLE_ROW;
          return Promise.resolve([row]);
        }
      );
      await expect(service.all()).resolves.toEqual([
        { id: 'r1', name: '编辑', code: 'editor' }
      ]);
    });
  });

  describe('create', () => {
    it('code 预查重命中 → 40900', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'dup' });
      await expect(
        service.create({ code: 'editor', name: '编辑' })
      ).rejects.toMatchObject({
        code: BizCode.CONFLICT
      });
    });

    it('menuIds 含已删菜单 → 40001（护栏 7）', async () => {
      prisma.role.findFirst.mockResolvedValue(null);
      prisma.menu.findMany.mockResolvedValue([]);
      await expect(
        service.create({ code: 'editor', name: '编辑', menuIds: ['ghost'] })
      ).rejects.toMatchObject({ code: BizCode.VALIDATION_FAILED });
    });

    it('创建成功：事务内写角色 + 菜单关联', async () => {
      prisma.role.findFirst.mockResolvedValue(null);
      prisma.menu.findMany.mockResolvedValue([{ id: 'm1' }]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)
      );
      prisma.role.create.mockResolvedValue({
        ...ROLE_ROW,
        menus: [{ menuId: 'm1' }]
      });
      const view = await service.create({
        code: 'editor',
        name: '编辑',
        menuIds: ['m1']
      });
      expect(prisma.roleMenu.createMany).toHaveBeenCalledWith({
        data: [{ roleId: 'r1', menuId: 'm1' }]
      });
      expect(view.code).toBe('editor');
    });
  });

  describe('update 护栏', () => {
    it('禁用 admin 角色 → 40900（护栏 1）', async () => {
      prisma.role.findFirst.mockResolvedValue({ ...ROLE_ROW, code: 'admin' });
      await expect(
        service.update('r1', { status: 'DISABLED' })
      ).rejects.toMatchObject({
        code: BizCode.CONFLICT
      });
    });

    it('目标不存在/已删 → 40404', async () => {
      prisma.role.findFirst.mockResolvedValue(null);
      await expect(
        service.update('ghost', { name: 'x' })
      ).rejects.toMatchObject({
        code: BizCode.NOT_FOUND
      });
    });

    it('全字段更新成功：name/status/remark 写入 + menuIds 事务内整体替换', async () => {
      prisma.role.findFirst.mockResolvedValue(ROLE_ROW);
      prisma.menu.findMany.mockResolvedValue([{ id: 'm1' }]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)
      );
      prisma.role.update.mockResolvedValue({ ...ROLE_ROW, name: '新名' });
      const view = await service.update('r1', {
        name: '新名',
        status: 'DISABLED',
        remark: '备注',
        menuIds: ['m1']
      });
      expect(prisma.roleMenu.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'r1' }
      });
      expect(prisma.roleMenu.createMany).toHaveBeenCalledWith({
        data: [{ roleId: 'r1', menuId: 'm1' }]
      });
      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { name: '新名', status: 'DISABLED', remark: '备注' }
      });
      expect(view.name).toBe('新名');
    });

    it('部分字段更新：menuIds 未提供时不触碰关联，data 只含提交字段', async () => {
      prisma.role.findFirst.mockResolvedValue(ROLE_ROW);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)
      );
      prisma.role.update.mockResolvedValue(ROLE_ROW);
      await service.update('r1', { remark: '仅备注' });
      expect(prisma.roleMenu.deleteMany).not.toHaveBeenCalled();
      expect(prisma.roleMenu.createMany).not.toHaveBeenCalled();
      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { remark: '仅备注' }
      });
    });
  });

  describe('remove（软删除）', () => {
    it('禁删 admin 角色 → 40900（护栏 1）', async () => {
      prisma.role.findFirst.mockResolvedValue({ ...ROLE_ROW, code: 'admin' });
      await expect(service.remove('r1')).rejects.toMatchObject({
        code: BizCode.CONFLICT
      });
    });

    it('软删除写 deletedAt（关联物理保留，靠查询过滤失效）', async () => {
      prisma.role.findFirst.mockResolvedValue(ROLE_ROW);
      prisma.role.update.mockResolvedValue(ROLE_ROW);
      await service.remove('r1');
      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { deletedAt: expect.any(Date) }
      });
      // 不触碰 roleMenu（关联物理保留）
      expect(prisma.roleMenu.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('menus 子资源', () => {
    it('menusOf 只返回活跃菜单', async () => {
      prisma.role.findFirst.mockResolvedValue(ROLE_ROW);
      prisma.roleMenu.findMany.mockResolvedValue([{ menuId: 'm1' }]);
      await expect(service.menuIdsOf('r1')).resolves.toEqual(['m1']);
      expect(prisma.roleMenu.findMany).toHaveBeenCalledWith({
        where: { roleId: 'r1', menu: { deletedAt: null } },
        select: { menuId: true }
      });
    });

    it('setMenus 成功：事务 deleteMany + createMany（幂等整体替换）', async () => {
      prisma.role.findFirst.mockResolvedValue(ROLE_ROW);
      prisma.menu.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
      prisma.$transaction.mockResolvedValue(undefined);
      await expect(service.setMenus('r1', ['m1', 'm2'])).resolves.toEqual([
        'm1',
        'm2'
      ]);
    });
  });
});
