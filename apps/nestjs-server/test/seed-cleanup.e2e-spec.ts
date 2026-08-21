// test/seed-cleanup.e2e-spec.ts
// seed 清理/复活逻辑的集成用例：前置植入「裁剪前存量菜单」+「被软删的种子按钮」，
// 跑 runSeed 后断言清理（软删非集合行）与复活（tombstone 转活跃）双向幂等。
// 基建：globalSetup（test/e2e-env.ts）已对 multi_admin_test 库跑过 migrate + runSeed，
// 本套件自建连向测试库的 PrismaClient；globalTeardown 会全表 truncate，
// 且本套件 afterAll 恢复 seed 基准 + ensureCommonUser，不污染其他套件。
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { runSeed } from '../prisma/seed.js';
import { ensureCommonUser } from './helpers/auth.js';

describe('seed 清理与复活双向幂等 (e2e)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public'
    })
  });

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    // 恢复 seed 基准（本套件软删了植入行，重跑 runSeed 幂等自愈）+ common 用户，
    // 避免影响依赖基准数据的其他套件（jest 可能并行执行各 spec 文件）。
    await runSeed(prisma);
    await ensureCommonUser(prisma);
    await prisma.$disconnect();
  });

  it('清理软删非集合存量行、复活同名 tombstone 且全量口径收敛（双向幂等）', async () => {
    // 1. 前置植入：
    //    a) 活跃菜单 SystemDept（type MENU）——模拟裁剪前存量，不在 seed 集合；
    //       name 无唯一约束，前置基准经 globalTeardown truncate 必不含同名行，直接 create 安全
    const planted = await prisma.menu.create({
      data: { name: 'SystemDept', title: 'menus.pureDept', type: 'MENU' }
    });

    //    b) 把现有活跃的 SystemUser:add 按钮行置 deletedAt——模拟被软删的种子项
    const btn = await prisma.menu.findFirstOrThrow({
      where: { name: 'SystemUser:add', deletedAt: null }
    });
    await prisma.menu.update({
      where: { id: btn.id },
      data: { deletedAt: new Date() }
    });

    // 2. 执行 seed
    await runSeed(prisma);

    // 3. 断言：
    //    a) SystemDept 被清理（软删）
    const deptAfter = await prisma.menu.findUnique({
      where: { id: planted.id }
    });
    expect(deptAfter?.deletedAt).not.toBeNull();

    //    b) SystemUser:add 复活（同一行、deletedAt 清空）且 permission 正确
    const btnAfter = await prisma.menu.findFirstOrThrow({
      where: { name: 'SystemUser:add', deletedAt: null }
    });
    expect(btnAfter.id).toBe(btn.id);
    expect(btnAfter.permission).toBe('system:user:add');

    //    c) seed 全量口径抽查：活跃 MENU 恰 4 条、活跃 BUTTON 恰 12 条
    const [menuCount, buttonCount] = await Promise.all([
      prisma.menu.count({ where: { type: 'MENU', deletedAt: null } }),
      prisma.menu.count({ where: { type: 'BUTTON', deletedAt: null } })
    ]);
    expect(menuCount).toBe(4);
    expect(buttonCount).toBe(12);
  }, 30_000);
});
