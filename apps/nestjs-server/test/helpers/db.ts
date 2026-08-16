// test/helpers/db.ts
import type { PrismaClient } from '../../src/generated/prisma/client.js';

/** 套件间清理：全表 truncate（外键级联），P4 再固化完整隔离策略 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "UserRole", "RoleMenu", "User", "Role", "Menu" RESTART IDENTITY CASCADE'
  );
}
