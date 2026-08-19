/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { MenuService } from './menu.service.js';
import type { PrismaService } from '../../../database/prisma.service.js';
import { BizCode } from '../../../common/errors/biz-code.js';

const MENU_ROW = {
  id: 'm1',
  parentId: null,
  type: 'MENU',
  name: 'SystemUser',
  title: 'menus.pureUser',
  icon: null,
  path: '/system/user/index',
  component: null,
  permission: null,
  sort: 0,
  visible: true,
  meta: null,
  createdAt: new Date('2026-08-19T00:00:00Z'),
  updatedAt: new Date('2026-08-19T00:00:00Z')
};

describe('MenuService', () => {
  let service: MenuService;
  let prisma: {
    menu: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      menu: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      },
      $transaction: jest.fn()
    };
    service = new MenuService(prisma as unknown as PrismaService);
  });

  describe('tree', () => {
    it('全量活跃树：带软删过滤且按树形返回', async () => {
      prisma.menu.findMany.mockResolvedValue([MENU_ROW]);
      const tree = await service.tree();
      expect(prisma.menu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
          orderBy: { sort: 'asc' }
        })
      );
      expect(tree).toHaveLength(1);
      expect(tree[0]).toMatchObject({ name: 'SystemUser', children: [] });
    });
  });

  describe('create', () => {
    it('name 预查重命中 → 40900', async () => {
      prisma.menu.findFirst.mockResolvedValue({ id: 'dup' });
      await expect(
        service.create({ type: 'MENU', name: 'SystemUser', title: 't' })
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('BUTTON 型 permission 必填 → 40001', async () => {
      prisma.menu.findFirst.mockResolvedValue(null);
      await expect(
        service.create({ type: 'BUTTON', name: 'Btn', title: 't' })
      ).rejects.toMatchObject({ code: BizCode.VALIDATION_FAILED });
    });

    it('permission 已被活跃菜单占用 → 40900', async () => {
      prisma.menu.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'dup' });
      await expect(
        service.create({
          type: 'BUTTON',
          name: 'Btn',
          title: 't',
          permission: 'system:user:add'
        })
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('父菜单不存在/已删 → 40001（护栏 7）', async () => {
      prisma.menu.findFirst
        .mockResolvedValueOnce(null) // name 查重
        .mockResolvedValueOnce(null); // parent 存活校验
      await expect(
        service.create({
          type: 'MENU',
          name: 'Child',
          title: 't',
          parentId: 'ghost'
        })
      ).rejects.toMatchObject({ code: BizCode.VALIDATION_FAILED });
    });

    it('创建成功：meta 展开写入 + 默认值（sort=0 visible=true）', async () => {
      prisma.menu.findFirst.mockResolvedValue(null);
      prisma.menu.create.mockResolvedValue(MENU_ROW);
      await service.create({
        type: 'MENU',
        name: 'SystemUser',
        title: 't',
        meta: { keepAlive: true }
      });
      expect(prisma.menu.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sort: 0,
          visible: true,
          meta: { keepAlive: true }
        })
      });
    });
  });

  describe('update（防环护栏 4）', () => {
    it('目标不存在/已删 → 40404', async () => {
      prisma.menu.findFirst.mockResolvedValue(null);
      await expect(service.update('ghost', {})).rejects.toMatchObject({
        code: BizCode.NOT_FOUND
      });
    });

    it('parentId 指向自身 → 40900（快速失败）', async () => {
      prisma.menu.findFirst.mockResolvedValue(MENU_ROW);
      await expect(
        service.update('m1', { parentId: 'm1' })
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('事务内更新后回溯祖先链检出环 → 40900', async () => {
      prisma.menu.findFirst.mockResolvedValue(MENU_ROW); // 目标存活
      prisma.menu.findFirst.mockResolvedValueOnce(MENU_ROW); // 目标存活 (findAliveMenu)
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)
      );
      prisma.menu.update.mockResolvedValue({ ...MENU_ROW, parentId: 'm2' });
      // 回溯链：assertNoCycle 内
      // 1. findFirst({ where: { id: 'm1' } }) → { parentId: 'm2' }
      // 2. findFirst({ where: { id: 'm2' } }) → { parentId: 'm1' } → cycle detected!
      prisma.menu.findFirst
        .mockResolvedValueOnce({ parentId: 'm2' }) // updated self
        .mockResolvedValueOnce({ parentId: 'm1' }); // m2's parent → cycle
      await expect(
        service.update('m1', { parentId: 'm2' })
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });
  });

  describe('remove', () => {
    it('软删只标当前节点（不拒绝有子菜单，不级联）', async () => {
      prisma.menu.findFirst.mockResolvedValue(MENU_ROW);
      prisma.menu.update.mockResolvedValue(MENU_ROW);
      await service.remove('m1');
      expect(prisma.menu.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { deletedAt: expect.any(Date) }
      });
    });
  });
});
