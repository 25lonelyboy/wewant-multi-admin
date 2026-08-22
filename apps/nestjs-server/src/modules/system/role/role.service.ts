import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { BizCode } from '@multi-admin/contracts';
import { BizException } from '../../../common/errors/biz.exception.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  alive,
  normalizePageQuery,
  pageResult,
  type PageResult
} from '../shared/system-shared.js';
import { ADMIN_ROLE_CODE } from '../shared/system.constants.js';
import type {
  CreateRoleDto,
  QueryRoleDto,
  UpdateRoleDto
} from './dto/role.dto.js';

/** 响应视图结构 */
interface RoleLike {
  id: string;
  code: string;
  name: string;
  status: string;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleView {
  id: string;
  code: string;
  name: string;
  status: string;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryRoleDto): Promise<PageResult<RoleView>> {
    const { page, pageSize, skip, take } = normalizePageQuery(query);
    const where: Prisma.RoleWhereInput = {
      ...alive(),
      ...(query.name
        ? { name: { contains: query.name, mode: 'insensitive' } }
        : {}),
      ...(query.code
        ? { code: { contains: query.code, mode: 'insensitive' } }
        : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      this.prisma.role.count({ where })
    ]);
    return pageResult(
      rows.map(r => this.toView(r)),
      total,
      page,
      pageSize
    );
  }

  /** 不分页全量（用户页下拉） */
  async all(): Promise<Array<{ id: string; name: string; code: string }>> {
    const rows = await this.prisma.role.findMany({
      where: { ...alive() },
      select: { id: true, name: true, code: true },
      orderBy: { createdAt: 'asc' }
    });
    return rows;
  }

  async create(dto: CreateRoleDto): Promise<RoleView> {
    const duplicate = await this.prisma.role.findFirst({
      where: { code: dto.code, ...alive() },
      select: { id: true }
    });
    if (duplicate) {
      throw new BizException(BizCode.CONFLICT, '角色标识已存在');
    }
    const menuIds = await this.assertActiveMenuIds(dto.menuIds ?? []);
    const role = await this.prisma.$transaction(async tx => {
      const created = await tx.role.create({
        data: {
          code: dto.code,
          name: dto.name,
          status: dto.status ?? 'ACTIVE',
          remark: dto.remark ?? null
        }
      });
      if (menuIds.length > 0) {
        await tx.roleMenu.createMany({
          data: menuIds.map(menuId => ({ roleId: created.id, menuId }))
        });
      }
      return created;
    });
    return this.toView(role);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleView> {
    const target = await this.findAliveRole(id);
    // 护栏 1：禁禁用超管角色
    if (target.code === ADMIN_ROLE_CODE && dto.status === 'DISABLED') {
      throw new BizException(BizCode.CONFLICT, '不能禁用超级管理员角色');
    }
    const data: Prisma.RoleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.remark !== undefined) data.remark = dto.remark;
    const menuIds =
      dto.menuIds !== undefined
        ? await this.assertActiveMenuIds(dto.menuIds)
        : null;
    const updated = await this.prisma.$transaction(async tx => {
      if (menuIds !== null) {
        await tx.roleMenu.deleteMany({ where: { roleId: id } });
        await tx.roleMenu.createMany({
          data: menuIds.map(menuId => ({ roleId: id, menuId }))
        });
      }
      return tx.role.update({ where: { id }, data });
    });
    return this.toView(updated);
  }

  /** 软删除：写 deletedAt；UserRole/RoleMenu 关联物理保留，靠查询过滤失效 */
  async remove(id: string): Promise<void> {
    const target = await this.findAliveRole(id);
    if (target.code === ADMIN_ROLE_CODE) {
      throw new BizException(BizCode.CONFLICT, '不能删除超级管理员角色');
    }
    await this.prisma.role.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  /** 详情：不存在/已软删 → 40404 */
  async findOne(id: string): Promise<RoleView> {
    return this.toView(await this.findAliveRole(id));
  }

  /** 角色已分配的菜单 id 列表（仅活跃菜单） */
  async menuIdsOf(id: string): Promise<string[]> {
    await this.findAliveRole(id);
    const rows = await this.prisma.roleMenu.findMany({
      where: { roleId: id, menu: { ...alive() } },
      select: { menuId: true }
    });
    return rows.map(r => r.menuId);
  }

  /** 整体替换角色菜单（幂等；护栏 7 校验目标活跃） */
  async setMenus(id: string, menuIds: string[]): Promise<string[]> {
    await this.findAliveRole(id);
    const unique = await this.assertActiveMenuIds(menuIds);
    await this.prisma.$transaction([
      this.prisma.roleMenu.deleteMany({ where: { roleId: id } }),
      this.prisma.roleMenu.createMany({
        data: unique.map(menuId => ({ roleId: id, menuId }))
      })
    ]);
    return unique;
  }

  private async findAliveRole(id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, ...alive() }
    });
    if (!role) {
      throw new BizException(BizCode.NOT_FOUND, '角色不存在或已删除');
    }
    return role;
  }

  private async assertActiveMenuIds(menuIds: string[]): Promise<string[]> {
    const unique = [...new Set(menuIds)];
    if (unique.length === 0) return [];
    const found = await this.prisma.menu.findMany({
      where: { id: { in: unique }, ...alive() },
      select: { id: true }
    });
    if (found.length !== unique.length) {
      throw new BizException(
        BizCode.VALIDATION_FAILED,
        'menuIds 包含不存在或已删除的菜单'
      );
    }
    return unique;
  }

  private toView(role: RoleLike): RoleView {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      status: role.status,
      remark: role.remark,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt
    };
  }
}
