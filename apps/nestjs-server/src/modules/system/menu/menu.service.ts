import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { BizCode } from '@multi-admin/contracts';
import { BizException } from '../../../common/errors/biz.exception.js';
import type { Menu, Prisma } from '../../../generated/prisma/client.js';
import { Prisma as PrismaNamespace } from '../../../generated/prisma/client.js';
import { alive } from '../shared/system-shared.js';
import { buildMenuTree, type MenuTreeNodeOf } from './menu-tree.js';
import type { CreateMenuDto, UpdateMenuDto } from './dto/menu.dto.js';

export type MenuTreeNode = MenuTreeNodeOf<Menu>;

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  /** 全量活跃树（无分页），按 sort 升序 */
  async tree(): Promise<MenuTreeNode[]> {
    const rows = await this.prisma.menu.findMany({
      where: { ...alive() },
      orderBy: { sort: 'asc' }
    });
    return buildMenuTree(rows);
  }

  async create(dto: CreateMenuDto): Promise<Menu> {
    await this.assertNameUnique(dto.name, null);
    this.assertButtonPermission(dto.type, dto.permission ?? null);
    if (dto.permission) {
      await this.assertPermissionUnique(dto.permission, null);
    }
    await this.assertParentAlive(dto.parentId ?? null);
    return this.prisma.menu.create({
      data: {
        type: dto.type,
        parentId: dto.parentId ?? null,
        name: dto.name,
        title: dto.title,
        icon: dto.icon ?? null,
        path: dto.path ?? null,
        component: dto.component ?? null,
        permission: dto.permission ?? null,
        sort: dto.sort ?? 0,
        visible: dto.visible ?? true,
        // class 实例展开为纯对象再写入 Json 列
        meta: dto.meta ? { ...dto.meta } : PrismaNamespace.JsonNull
      }
    });
  }

  async update(id: string, dto: UpdateMenuDto): Promise<Menu> {
    const target = await this.findAliveMenu(id);
    if (dto.name !== undefined && dto.name !== target.name) {
      await this.assertNameUnique(dto.name, id);
    }
    const effectiveType = dto.type ?? target.type;
    const effectivePermission =
      dto.permission !== undefined ? dto.permission : target.permission;
    this.assertButtonPermission(effectiveType, effectivePermission);
    if (dto.permission !== undefined && dto.permission !== null) {
      await this.assertPermissionUnique(dto.permission, id);
    }
    if (dto.parentId !== undefined && dto.parentId !== target.parentId) {
      // 防环快速失败（护栏 4 第一层）
      if (dto.parentId !== null) {
        if (dto.parentId === id) {
          throw new BizException(BizCode.CONFLICT, '父菜单不能是自身');
        }
        await this.assertParentAlive(dto.parentId);
      }
    }
    const data: Prisma.MenuUncheckedUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.parentId !== undefined) data.parentId = dto.parentId;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.icon !== undefined) data.icon = dto.icon;
    if (dto.path !== undefined) data.path = dto.path;
    if (dto.component !== undefined) data.component = dto.component;
    if (dto.permission !== undefined) data.permission = dto.permission;
    if (dto.sort !== undefined) data.sort = dto.sort;
    if (dto.visible !== undefined) data.visible = dto.visible;
    if (dto.meta !== undefined) {
      data.meta = dto.meta ? { ...dto.meta } : PrismaNamespace.JsonNull;
    }
    return this.prisma.$transaction(async tx => {
      const updated = await tx.menu.update({ where: { id }, data });
      // 防环二次校验（护栏 4 第二层）：同事务内更新后回溯祖先链
      await this.assertNoCycle(tx, id);
      return updated;
    });
  }

  /** 软删只标当前节点：不级联、不因有子菜单拒绝 */
  async remove(id: string): Promise<void> {
    await this.findAliveMenu(id);
    await this.prisma.menu.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  /**
   * 详情：不存在/已软删 → 40404；
   * 附加父链完整性校验：沿 parentId 上行须全部 alive 至根，
   * 断链（逻辑孤儿）按 40404（与孤儿子树隐身语义对齐）；
   * 上行带环按断链 40404（脏数据防挂死）。
   */
  async findOne(id: string): Promise<Menu> {
    const target = await this.findAliveMenu(id);
    const visited = new Set<string>([id]);
    let cursor = target.parentId;
    while (cursor !== null) {
      if (visited.has(cursor)) {
        throw new BizException(BizCode.NOT_FOUND, '菜单不存在或已删除');
      }
      visited.add(cursor);
      const parent = await this.prisma.menu.findFirst({
        where: { id: cursor, ...alive() },
        select: { parentId: true }
      });
      if (!parent) {
        throw new BizException(BizCode.NOT_FOUND, '菜单不存在或已删除');
      }
      cursor = parent.parentId;
    }
    return target;
  }

  /**
   * 回溯祖先链检环：visited 从自身出发，若链上重遇已访问节点即成环。
   * 遍历不过滤软删节点（parentId 物理指针仍存在，环检测看物理链）。
   */
  private async assertNoCycle(
    tx: Prisma.TransactionClient,
    id: string
  ): Promise<void> {
    const self = await tx.menu.findFirst({
      where: { id },
      select: { parentId: true }
    });
    const visited = new Set<string>([id]);
    let cursor = self?.parentId ?? null;
    while (cursor !== null) {
      if (visited.has(cursor)) {
        throw new BizException(BizCode.CONFLICT, '菜单父子关系检测到循环引用');
      }
      visited.add(cursor);
      const parent = await tx.menu.findFirst({
        where: { id: cursor },
        select: { parentId: true }
      });
      cursor = parent?.parentId ?? null;
    }
  }

  private async findAliveMenu(id: string): Promise<Menu> {
    const menu = await this.prisma.menu.findFirst({
      where: { id, ...alive() }
    });
    if (!menu) {
      throw new BizException(BizCode.NOT_FOUND, '菜单不存在或已删除');
    }
    return menu;
  }

  private async assertNameUnique(
    name: string,
    excludeId: string | null
  ): Promise<void> {
    const duplicate = await this.prisma.menu.findFirst({
      where: {
        name,
        ...alive(),
        ...(excludeId ? { id: { not: excludeId } } : {})
      },
      select: { id: true }
    });
    if (duplicate) {
      throw new BizException(BizCode.CONFLICT, '菜单名称已存在');
    }
  }

  private async assertPermissionUnique(
    permission: string,
    excludeId: string | null
  ): Promise<void> {
    const duplicate = await this.prisma.menu.findFirst({
      where: {
        permission,
        ...alive(),
        ...(excludeId ? { id: { not: excludeId } } : {})
      },
      select: { id: true }
    });
    if (duplicate) {
      throw new BizException(BizCode.CONFLICT, '权限点已被其他活跃菜单占用');
    }
  }

  private assertButtonPermission(
    type: string,
    permission: string | null
  ): void {
    if (type === 'BUTTON' && !permission) {
      throw new BizException(
        BizCode.VALIDATION_FAILED,
        'BUTTON 型菜单必须提供 permission'
      );
    }
  }

  private async assertParentAlive(parentId: string | null): Promise<void> {
    if (parentId === null) return;
    const parent = await this.prisma.menu.findFirst({
      where: { id: parentId, ...alive() },
      select: { id: true }
    });
    if (!parent) {
      throw new BizException(BizCode.VALIDATION_FAILED, '父菜单不存在或已删除');
    }
  }
}
