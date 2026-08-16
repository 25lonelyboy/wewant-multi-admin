// prisma/seed.ts
// 幂等 seed：upsert / createMany+skipDuplicates；超管 create-only 绝不覆盖已改密码。
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

/** 由菜单树推导 16 个按钮权限点（纯函数） */
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

  // 1. 角色 upsert
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {},
      create: { code: role.code, name: role.name }
    });
  }

  // 2. 菜单 upsert（两轮：先无父节点全建，再回填 parentId）
  const flat = flattenMenus(MENU_TREE);
  for (const menu of flat) {
    await prisma.menu.upsert({
      where: { name: menu.name },
      update: {
        title: menu.title,
        icon: menu.icon ?? null,
        path: menu.path ?? null,
        component: menu.component ?? null,
        sort: menu.sort
      },
      create: {
        name: menu.name,
        title: menu.title,
        // exactOptionalPropertyTypes：可选字段收窄为 null（Prisma create 不接受 undefined）
        icon: menu.icon ?? null,
        path: menu.path ?? null,
        component: menu.component ?? null,
        sort: menu.sort,
        type: 'MENU'
      }
    });
  }
  for (const menu of flat.filter(
    (m): m is FlatMenu & { parentName: string } => m.parentName !== undefined
  )) {
    const parent = await prisma.menu.findUniqueOrThrow({
      where: { name: menu.parentName }
    });
    await prisma.menu.update({
      where: { name: menu.name },
      data: { parentId: parent.id }
    });
  }

  // 3. 按钮权限点 upsert
  for (const btn of buildButtonSeeds(MENU_TREE)) {
    const parent = await prisma.menu.findUniqueOrThrow({
      where: { name: btn.parentName }
    });
    await prisma.menu.upsert({
      where: { name: btn.name },
      update: { permission: btn.permission, parentId: parent.id },
      create: {
        name: btn.name,
        title: btn.title,
        permission: btn.permission,
        parentId: parent.id,
        sort: btn.sort,
        type: 'BUTTON'
      }
    });
  }

  // 4. admin 角色 ← 全部菜单/权限点（createMany skipDuplicates，重跑无副作用）
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'admin' }
  });
  const allMenus = await prisma.menu.findMany({ select: { id: true } });
  await prisma.roleMenu.createMany({
    data: allMenus.map(m => ({ roleId: adminRole.id, menuId: m.id })),
    skipDuplicates: true
  });

  // 5. 超管 create-only：已存在即跳过，绝不覆盖已改密码
  const existingAdmin = await prisma.user.findUnique({
    where: { username: 'admin' }
  });
  if (!existingAdmin) {
    const hash = await argon2.hash(adminPassword);
    const adminUser = await prisma.user.create({
      data: { username: 'admin', password: hash, nickname: '超级管理员' }
    });
    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id }
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
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  });
  runSeed(prisma)
    .then(() => prisma.$disconnect())
    .catch(async err => {
      console.error('seed 失败:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
