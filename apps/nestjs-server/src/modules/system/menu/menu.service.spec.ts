/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { MenuService } from './menu.service.js';
import type { PrismaService } from '../../../database/prisma.service.js';
import { BizCode } from '@multi-admin/contracts';
import { Prisma as PrismaNamespace } from '../../../generated/prisma/client.js';
import type { MenuMetaDto } from '../shared/menu-meta.dto.js';

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

    it('全字段更新成功：name/permission 查重带 excludeId + 父存活校验 + meta 置空写 JsonNull', async () => {
      prisma.menu.findFirst
        .mockResolvedValueOnce(MENU_ROW) // findAliveMenu 目标存活
        .mockResolvedValueOnce(null) // name 查重（带 excludeId 排除自身）
        .mockResolvedValueOnce(null) // permission 查重（带 excludeId 排除自身）
        .mockResolvedValueOnce({ id: 'm9' }); // 新父存活
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)
      );
      // assertNoCycle：自身无父 → 链终止，不检出环
      prisma.menu.findFirst.mockResolvedValueOnce({ parentId: null });
      prisma.menu.update.mockResolvedValue(MENU_ROW);
      await service.update('m1', {
        type: 'BUTTON',
        parentId: 'm9',
        name: 'Renamed',
        title: '新标题',
        icon: 'i',
        path: '/p',
        component: 'c',
        permission: 'sys:x',
        sort: 3,
        visible: false,
        // 运行期 HTTP body 可传 null（DTO 类型未含 null，此处显式断言模拟真实载荷）
        meta: null as unknown as MenuMetaDto
      });
      // name 查重带 excludeId 排除自身
      expect(prisma.menu.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            name: 'Renamed',
            id: { not: 'm1' }
          })
        })
      );
      expect(prisma.menu.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: expect.objectContaining({
          type: 'BUTTON',
          parentId: 'm9',
          name: 'Renamed',
          title: '新标题',
          icon: 'i',
          path: '/p',
          component: 'c',
          permission: 'sys:x',
          sort: 3,
          visible: false,
          meta: PrismaNamespace.JsonNull
        })
      });
    });

    it('空 DTO 更新成功：不触发任何查重，data 为空对象', async () => {
      prisma.menu.findFirst
        .mockResolvedValueOnce(MENU_ROW) // findAliveMenu
        .mockResolvedValueOnce({ parentId: null }); // assertNoCycle 链终止
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)
      );
      prisma.menu.update.mockResolvedValue(MENU_ROW);
      await service.update('m1', {});
      // findAliveMenu + assertNoCycle 共 2 次，无任何查重调用
      expect(prisma.menu.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.menu.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {}
      });
    });

    it('改名提交同名：name 与现状一致时跳过 name 查重', async () => {
      prisma.menu.findFirst
        .mockResolvedValueOnce(MENU_ROW) // findAliveMenu
        .mockResolvedValueOnce({ parentId: null }); // assertNoCycle 链终止
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)
      );
      prisma.menu.update.mockResolvedValue(MENU_ROW);
      await service.update('m1', { name: MENU_ROW.name });
      // 未发生 name 查重（同名无需校验）
      expect(prisma.menu.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.menu.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { name: MENU_ROW.name }
      });
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

  describe('findOne', () => {
    it('活跃且父链完整返回 Menu 行', async () => {
      prisma.menu.findFirst
        .mockResolvedValueOnce({ ...MENU_ROW, parentId: 'p1' }) // findAliveMenu 目标
        .mockResolvedValueOnce({ parentId: null }); // 父节点 → 链终止
      const menu = await service.findOne('m1');
      expect(menu.id).toBe('m1');
      // 父链上行带存活过滤（deletedAt: null）
      expect(prisma.menu.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: 'p1', deletedAt: null }
        })
      );
    });

    it('目标不存在/已软删抛 40404', async () => {
      prisma.menu.findFirst.mockResolvedValue(null);
      await expect(service.findOne('ghost')).rejects.toMatchObject({
        code: BizCode.NOT_FOUND
      });
    });

    it('父链断链（父已软删）抛 40404', async () => {
      prisma.menu.findFirst
        .mockResolvedValueOnce({ ...MENU_ROW, parentId: 'p1' }) // 目标命中
        .mockResolvedValueOnce(null); // 父节点查询返回 null → 断链
      await expect(service.findOne('orphan')).rejects.toMatchObject({
        code: BizCode.NOT_FOUND
      });
    });

    it('父链成环（m1 → p1 → m1）按断链抛 40404（脏数据防挂死）', async () => {
      prisma.menu.findFirst
        .mockResolvedValueOnce({ ...MENU_ROW, parentId: 'p1' }) // 目标命中
        .mockResolvedValueOnce({ parentId: 'm1' }); // p1 的父指回 m1 → 环，无需第 3 次查询
      await expect(service.findOne('m1')).rejects.toMatchObject({
        code: BizCode.NOT_FOUND
      });
      expect(prisma.menu.findFirst).toHaveBeenCalledTimes(2);
    });
  });
});
