// prisma/seed.ts
// 幂等 seed（create-only 语义）：只补不删不改，以生产库为事实源。
// 首次部署初始化必要数据，后续重跑跳过已存在的活跃记录；
// 仅复活被软删的种子项（支持「裁剪 → 再引入」场景）。
// 载体：tsx 直跑（prisma.config.ts migrations.seed）；e2e globalSetup 复用 runSeed。
import { pathToFileURL } from 'node:url';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { localDeviceIdForIndex } from '@multi-admin/contracts';
import {
  AGGREGATES,
  type ModelDeclaration
} from '@multi-admin/device-registry';
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
  // 与超管块事务口径一致；create-only 保证重跑自愈。
  const flat = flattenMenus(MENU_TREE);
  const buttons = buildButtonSeeds(MENU_TREE);
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
        continue;
      } else {
        // 同名软删行复活而非新建：避免裁剪后重新引入时产生重名活跃行，
        // 保证「裁剪 → 再引入」双向幂等。orderBy 固定取最旧行，
        // 同名多 tombstone 时结果确定。
        const tombstone = await tx.menu.findFirst({
          where: { name: menu.name, deletedAt: { not: null } },
          orderBy: { id: 'asc' }
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
      if (self.parentId === null) {
        await tx.menu.update({
          where: { id: self.id },
          data: { parentId: parent.id }
        });
      }
    }
    // 事务内只剩 create-if-missing 操作，保留事务以保证首次部署的原子性。
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
      continue;
    } else {
      // 同名软删行复活（与 MENU 块同口径）；orderBy 固定取最旧行，
      // 同名多 tombstone 时结果确定。
      const tombstone = await prisma.menu.findFirst({
        where: { name: btn.name, deletedAt: { not: null } },
        orderBy: { id: 'asc' }
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

  // 6. iot：p1 模型 + 版本 1，以及 100 台 P1 设备与各自的 open usage。
  // 设备标识一律取自 p1DeviceRecords()——那份映射有「有数据即冻结」的约束，不在此重新推导。
  await seedP1Registry(prisma);
}

/**
 * P1 的物模型与设备档案——**种子数据**，不是运行期档案（运行期来自注册接口与快照）。
 * 三个数值测点，各声明四类聚合；量程与 worker 的过滤口径同源。
 */
const P1_MODEL_CODE = 'p1';
const P1_DEVICE_COUNT = 100;

const P1_MODEL: ModelDeclaration = {
  modelCode: P1_MODEL_CODE,
  properties: [
    {
      key: 'temperature',
      kind: 'float',
      unit: '°C',
      range: { min: -50, max: 200 },
      aggregates: AGGREGATES
    },
    {
      key: 'vibration',
      kind: 'float',
      unit: 'mm/s',
      range: { min: 0, max: 100 },
      aggregates: AGGREGATES
    },
    {
      key: 'current',
      kind: 'float',
      unit: 'A',
      range: { min: 0, max: 100 },
      aggregates: AGGREGATES
    }
  ],
  services: [],
  events: []
};

const DEVICE_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DEVICE_ID_LEAD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DEVICE_ID_LENGTH = 16;

/** 由序号**确定性**地推出平台标识；映射一旦有数据就冻结，不重新推导 */
function deriveDeviceId(index: number): string {
  let state = Math.imul(index, 2654435761) >>> 0;
  let out = '';
  for (let i = 0; i < DEVICE_ID_LENGTH; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const alphabet = i === 0 ? DEVICE_ID_LEAD_ALPHABET : DEVICE_ID_ALPHABET;
    out += alphabet.charAt(state % alphabet.length);
  }
  return out;
}

function p1DeviceRecords(count = P1_DEVICE_COUNT): {
  localDeviceId: string;
  deviceId: string;
  modelCode: string;
}[] {
  return Array.from({ length: count }, (_, i) => ({
    localDeviceId: localDeviceIdForIndex(i + 1),
    deviceId: deriveDeviceId(i + 1),
    modelCode: P1_MODEL_CODE
  }));
}

const P1_MODEL_VERSION = 1;

/**
 * create-only 幂等：模型、版本、设备、usage 都只补缺失行。
 * 已有 open usage 的设备不追加 p1 usage——它可能已被换到别的型号。
 */
async function seedP1Registry(prisma: PrismaClient): Promise<void> {
  const modelCode = P1_MODEL.modelCode;
  await prisma.iotDeviceModel.upsert({
    where: { code: modelCode },
    create: { code: modelCode },
    update: {}
  });

  const now = new Date();
  await prisma.iotModelVersion.upsert({
    where: { modelCode_version: { modelCode, version: P1_MODEL_VERSION } },
    create: {
      modelCode,
      version: P1_MODEL_VERSION,
      status: 'ACTIVE',
      properties: toJson(P1_MODEL.properties),
      services: toJson(P1_MODEL.services),
      events: toJson(P1_MODEL.events),
      effectiveFrom: now,
      statusChangedAt: now
    },
    update: {}
  });

  const records = p1DeviceRecords();
  await prisma.iotDevice.createMany({
    data: records.map(record => ({
      localDeviceId: record.localDeviceId,
      deviceId: record.deviceId,
      status: 'ACTIVE' as const,
      statusChangedAt: now
    })),
    skipDuplicates: true
  });

  const devices = await prisma.iotDevice.findMany({
    where: { localDeviceId: { in: records.map(r => r.localDeviceId) } },
    select: {
      deviceId: true,
      usages: { where: { toAt: null }, select: { id: true } }
    }
  });
  await prisma.iotDeviceModelUsage.createMany({
    data: devices
      .filter(device => device.usages.length === 0)
      .map(device => ({
        deviceId: device.deviceId,
        modelCode,
        version: P1_MODEL_VERSION
      })),
    skipDuplicates: true
  });
}

/** Prisma 的 Json 入参不接受 readonly 数组，按值复制一份 */
function toJson(value: unknown): object {
  return structuredClone(value) as object;
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
