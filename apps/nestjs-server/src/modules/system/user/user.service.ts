import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
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
import { ADMIN_USERNAME } from '../shared/system.constants.js';
import type {
  CreateUserDto,
  QueryUsersDto,
  UpdateUserDto
} from './dto/user.dto.js';

type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

/** 响应视图：剔除 password，roles 为角色 code 数组（分设计 §3.6/§5.1） */
export interface UserView {
  id: string;
  username: string;
  nickname: string;
  status: string;
  avatar: string | null;
  phone: string | null;
  email: string | null;
  sex: number | null;
  remark: string | null;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryUsersDto): Promise<PageResult<UserView>> {
    const { page, pageSize, skip, take } = normalizePageQuery(query);
    const where: Prisma.UserWhereInput = {
      ...alive(),
      ...(query.username
        ? { username: { contains: query.username, mode: 'insensitive' } }
        : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: {
          roles: {
            where: { role: { deletedAt: null } },
            include: { role: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      this.prisma.user.count({ where })
    ]);
    return pageResult(
      rows.map(u => this.toView(u)),
      total,
      page,
      pageSize
    );
  }

  async create(dto: CreateUserDto): Promise<UserView> {
    const duplicate = await this.prisma.user.findFirst({
      where: { username: dto.username, ...alive() },
      select: { id: true }
    });
    if (duplicate) {
      throw new BizException(BizCode.CONFLICT, '用户名已存在');
    }
    const roleIds = await this.assertActiveRoleIds(dto.roleIds ?? []);
    const password = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        password,
        nickname: dto.nickname,
        status: dto.status ?? 'ACTIVE',
        avatar: dto.avatar ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        sex: dto.sex ?? null,
        remark: dto.remark ?? null,
        roles: { create: roleIds.map(roleId => ({ roleId })) }
      },
      include: {
        roles: { where: { role: { deletedAt: null } }, include: { role: true } }
      }
    });
    return this.toView(user);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    operatorId: string
  ): Promise<UserView> {
    const target = await this.findAliveUser(id);
    // 护栏 1：禁禁用超管（禁删见 remove）
    if (target.username === ADMIN_USERNAME && dto.status === 'DISABLED') {
      throw new BizException(BizCode.CONFLICT, '不能禁用超级管理员用户');
    }
    if (target.id === operatorId) {
      // 护栏 2：不能禁用自己
      if (dto.status === 'DISABLED') {
        throw new BizException(BizCode.CONFLICT, '不能禁用自己');
      }
      // 护栏 3：不能修改自己的角色分配（防剥光自身自锁）
      if (dto.roleIds !== undefined) {
        throw new BizException(BizCode.CONFLICT, '不能修改自己的角色分配');
      }
    }
    const data: Prisma.UserUpdateInput = {};
    if (dto.nickname !== undefined) data.nickname = dto.nickname;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.avatar !== undefined) data.avatar = dto.avatar;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.sex !== undefined) data.sex = dto.sex;
    if (dto.remark !== undefined) data.remark = dto.remark;
    if (dto.password !== undefined) {
      data.password = await argon2.hash(dto.password);
    }
    const roleIds =
      dto.roleIds !== undefined
        ? await this.assertActiveRoleIds(dto.roleIds)
        : null;
    const updated = await this.prisma.$transaction(async tx => {
      if (roleIds !== null) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roleIds.map(roleId => ({ userId: id, roleId }))
        });
      }
      return tx.user.update({
        where: { id },
        data,
        include: {
          roles: {
            where: { role: { deletedAt: null } },
            include: { role: true }
          }
        }
      });
    });
    return this.toView(updated);
  }

  /** 软删除（分设计 §4）：写 deletedAt 时间戳，无硬删除 */
  async remove(id: string, operatorId: string): Promise<void> {
    const target = await this.findAliveUser(id);
    if (target.username === ADMIN_USERNAME) {
      throw new BizException(BizCode.CONFLICT, '不能删除超级管理员用户');
    }
    if (target.id === operatorId) {
      throw new BizException(BizCode.CONFLICT, '不能删除自己');
    }
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  /** 用户已分配的角色 id 列表（仅活跃角色） */
  async roleIdsOf(id: string): Promise<string[]> {
    await this.findAliveUser(id);
    const rows = await this.prisma.userRole.findMany({
      where: { userId: id, role: { ...alive() } },
      select: { roleId: true }
    });
    return rows.map(r => r.roleId);
  }

  /** 整体替换用户角色（幂等；护栏 3 禁改自己） */
  async setRoles(
    id: string,
    roleIds: string[],
    operatorId: string
  ): Promise<string[]> {
    const target = await this.findAliveUser(id);
    if (target.username === ADMIN_USERNAME) {
      throw new BizException(BizCode.CONFLICT, '不能修改超级管理员的角色分配');
    }
    if (target.id === operatorId) {
      throw new BizException(BizCode.CONFLICT, '不能修改自己的角色分配');
    }
    const unique = await this.assertActiveRoleIds(roleIds);
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: unique.map(roleId => ({ userId: id, roleId }))
      })
    ]);
    return unique;
  }

  /** 主体校验统一口径（分设计 §4.1）：不存在或已软删 → 40404 */
  private async findAliveUser(id: string): Promise<UserWithRoles> {
    const user = await this.prisma.user.findFirst({
      where: { id, ...alive() },
      include: {
        roles: { where: { role: { deletedAt: null } }, include: { role: true } }
      }
    });
    if (!user) {
      throw new BizException(BizCode.NOT_FOUND, '用户不存在或已删除');
    }
    return user;
  }

  /** 护栏 7：分配类入参校验目标存在且活跃；去重防复合主键冲突 */
  private async assertActiveRoleIds(roleIds: string[]): Promise<string[]> {
    const unique = [...new Set(roleIds)];
    if (unique.length === 0) return [];
    const found = await this.prisma.role.findMany({
      where: { id: { in: unique }, ...alive() },
      select: { id: true }
    });
    if (found.length !== unique.length) {
      throw new BizException(
        BizCode.VALIDATION_FAILED,
        'roleIds 包含不存在或已删除的角色'
      );
    }
    return unique;
  }

  private toView(user: UserWithRoles): UserView {
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      status: user.status,
      avatar: user.avatar,
      phone: user.phone,
      email: user.email,
      sex: user.sex,
      remark: user.remark,
      roles: user.roles.map(ur => ur.role.code),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }
}
