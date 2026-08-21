// prisma/seed.ts
// 幂等 seed：upsert / createMany+skipDuplicates + 软删不在 seed 集合中的存量菜单；
// 超管 create-only 绝不覆盖已改密码。
// 载体：tsx 直跑（prisma.config.ts migrations.seed）；e2e globalSetup 复用 runSeed。
import { pathToFileURL } from 'node:url';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  BUTTON_ACTIONS,
  MENU_TREE,
  PAGE_PERMISSION_PREFIX,
  ROLES,
  type MenuSeedItem
} from './seed-data.js';

export interface FlatMenu {
  name: string;
  title: string;
  icon?: string;
  path?: string;
  component?: string;
  sort: number;
  parentName?: string;
}

/** 展平菜单树（纯函数） */
export function flattenMenus(tree: MenuSeedItem[]): FlatMenu[] {
  const out: FlatMenu[] = [];
  const walk = (items: MenuSeedItem[], parentName?: string): void => {
    for (const item of items) {
      const { children, ...rest } = item;
      const flat: FlatMenu = { ...rest };
      if (parentName !== undefined) {
        flat.parentName = parentName;
      }
      out.push(flat);
      if (children) walk(children, item.name);
    }
  };
  walk(tree);
  return out;
}

export interface ButtonSeed {
  name: string;
  title: string;
  permission: string;
  parentName: string;
  sort: number;
}

/** 由菜单树推导 12 个按钮权限点（纯函数） */
export function buildButtonSeeds(tree: MenuSeedItem[]): ButtonSeed[] {
  const buttons: ButtonSeed[] = [];
  for (const group of tree) {
    for (const page of group.children ?? []) {
      const prefix = PAGE_PERMISSION_PREFIX[page.name];
      if (!prefix) continue;
      BUTTON_ACTIONS.forEach((action, index) => {
        buttons.push({
          name: `${page.name}:${action}`,
          title: `${page.title}.${action}`,
          permission: `${prefix}:${action}`,
          parentName: page.name,
          sort: index
        });
      });
    }
  }
  return buttons;
}

/**
 * 幂等执行 seed。传入已连接的 client，调用方负责 connect/disconnect，
 * 便于 prisma db seed 与 e2e globalSetup 两条链路复用。
 */
export async function runSeed(prisma: PrismaClient): Promise<void> {
  const adminPassword = process.env.ADMIN_INIT_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      'ADMIN_INIT_PASSWORD 未设置，seed 拒绝执行（不回落默认密码）'
    );
  }

  // 1. 角色：活跃记录 create-only（唯一性由部分唯一索引兜底）
  for (const role of ROLES) {
    const existing = await prisma.role.findFirst({
      where: { code: role.code, deletedAt: null }
    });
    if (!existing) {
      await prisma.role.create({ data: { code: role.code, name: role.name } });
    }
  }

  // 2. 菜单（两轮：先无父节点全建，再回填 parentId）
  // 两轮包在交互式事务内：回填中途失败整体回滚，不残留无父链菜单，
  // 与超管块事务口径一致；幂等 upsert 保证重跑自愈。
  const flat = flattenMenus(MENU_TREE);
  const buttons = buildButtonSeeds(MENU_TREE);
  // seed 全集（MENU 节点 + BUTTON 权限点）：清理步骤的排除口径，凡不在集合内的
  // 存量活跃行视为被裁剪项（如 P5 裁掉的 SystemDept/Monitor），软删之。
  const seedMenuNames = [...flat.map(m => m.name), ...buttons.map(b => b.name)];
  await prisma.$transaction(async tx => {
    for (const menu of flat) {
      const existing = await tx.menu.findFirst({
        where: { name: menu.name, deletedAt: null }
      });
      const data = {
        title: menu.title,
        icon: menu.icon ?? null,
        path: menu.path ?? null,
        component: menu.component ?? null,
        sort: menu.sort
      };
      if (existing) {
        await tx.menu.update({ where: { id: existing.id }, data });
      } else {
        // 同名软删行复活而非新建：避免裁剪后重新引入时产生重名活跃行，
        // 保证「裁剪 → 再引入」双向幂等。
        const tombstone = await tx.menu.findFirst({
          where: { name: menu.name, deletedAt: { not: null } }
        });
        if (tombstone) {
          await tx.menu.update({
            where: { id: tombstone.id },
            data: { ...data, deletedAt: null }
          });
        } else {
          await tx.menu.create({
            // exactOptionalPropertyTypes：可选字段收窄为 null（Prisma create 不接受 undefined）
            data: { name: menu.name, ...data, type: 'MENU' }
          });
        }
      }
    }
    for (const menu of flat.filter(
      (m): m is FlatMenu & { parentName: string } => m.parentName !== undefined
    )) {
      const parent = await tx.menu.findFirstOrThrow({
        where: { name: menu.parentName, deletedAt: null }
      });
      const self = await tx.menu.findFirstOrThrow({
        where: { name: menu.name, deletedAt: null }
      });
      await tx.menu.update({
        where: { id: self.id },
        data: { parentId: parent.id }
      });
    }
    // 清理：软删不在 seed 集合中的存量菜单/权限点（P5 裁决裁掉了 SystemDept 页与
    // Monitor 整组，纯 upsert 不会移除存量行，靠此步让开发/测试库同步裁剪）。
    // 软删而非物删：保留可追溯性；查询侧统一按 deletedAt IS NULL 过滤，
    // 裁剪项即时不可见；残留的 RoleMenu 关联随菜单软删自然失效。
    await tx.menu.updateMany({
      where: { deletedAt: null, name: { notIn: seedMenuNames } },
      data: { deletedAt: new Date() }
    });
  });

  // 3. 按钮权限点
  for (const btn of buttons) {
    const parent = await prisma.menu.findFirstOrThrow({
      where: { name: btn.parentName, deletedAt: null }
    });
    const existing = await prisma.menu.findFirst({
      where: { name: btn.name, deletedAt: null }
    });
    const data = { permission: btn.permission, parentId: parent.id };
    if (existing) {
      await prisma.menu.update({ where: { id: existing.id }, data });
    } else {
      // 同名软删行复活（与 MENU 块同口径）
      const tombstone = await prisma.menu.findFirst({
        where: { name: btn.name, deletedAt: { not: null } }
      });
      if (tombstone) {
        await prisma.menu.update({
          where: { id: tombstone.id },
          data: {
            title: btn.title,
            ...data,
            sort: btn.sort,
            deletedAt: null
          }
        });
      } else {
        await prisma.menu.create({
          data: {
            name: btn.name,
            title: btn.title,
            ...data,
            sort: btn.sort,
            type: 'BUTTON'
          }
        });
      }
    }
  }

  // 4. admin 角色 ← 全部菜单/权限点（createMany skipDuplicates，重跑无副作用）
  const adminRole = await prisma.role.findFirstOrThrow({
    where: { code: 'admin', deletedAt: null }
  });
  const allMenus = await prisma.menu.findMany({
    where: { deletedAt: null },
    select: { id: true }
  });
  await prisma.roleMenu.createMany({
    data: allMenus.map(m => ({ roleId: adminRole.id, menuId: m.id })),
    skipDuplicates: true
  });

  // 5. 超管 create-only：已存在即跳过，绝不覆盖已改密码。
  // 前置约束：seed 须串行执行（生产启动链单点执行），避免并发重入导致重复创建。
  // user.create 与 userRole.create 包在交互式事务内：部分失败整体回滚，重跑可自愈。
  const existingAdmin = await prisma.user.findFirst({
    where: { username: 'admin', deletedAt: null }
  });
  if (!existingAdmin) {
    const hash = await argon2.hash(adminPassword);
    await prisma.$transaction(async tx => {
      const adminUser = await tx.user.create({
        data: { username: 'admin', password: hash, nickname: '超级管理员' }
      });
      await tx.userRole.create({
        data: { userId: adminUser.id, roleId: adminRole.id }
      });
    });
  }
}

// CLI 入口（仅当直跑本文件时执行，被 import 时不触发）。
// 守卫用 pathToFileURL 形态：`new URL(\`file://${path}\`)` 在 Windows 盘符路径
//（D:\...）下会把 `D:` 误判为 host，pathToFileURL 是跨平台稳健形态。
const isDirectRun =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL 未设置，seed 拒绝执行');
    process.exit(1);
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl })
  });
  runSeed(prisma)
    .then(() => prisma.$disconnect())
    .catch(async err => {
      console.error('seed 失败:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
