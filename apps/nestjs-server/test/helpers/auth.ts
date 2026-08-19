import * as argon2 from 'argon2';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

export const COMMON_PASSWORD = 'e2e-common-password';

/** 幂等准备 common 用户：common 角色 + System 组/SystemUser 页/system:user:query 权限点 */
export async function ensureCommonUser(prisma: PrismaClient): Promise<void> {
  const commonRole = await prisma.role.findFirstOrThrow({
    where: { code: 'common', deletedAt: null }
  });
  const password = await argon2.hash(COMMON_PASSWORD);
  const existing = await prisma.user.findFirst({
    where: { username: 'common', deletedAt: null }
  });
  const user =
    existing ??
    (await prisma.user.create({
      data: { username: 'common', password, nickname: '普通用户' }
    }));
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: commonRole.id } },
    update: {},
    create: { userId: user.id, roleId: commonRole.id }
  });
  const menus = await prisma.menu.findMany({
    where: { name: { in: ['System', 'SystemUser', 'SystemUser:query'] } }
  });
  await prisma.roleMenu.createMany({
    data: menus.map(m => ({ roleId: commonRole.id, menuId: m.id })),
    skipDuplicates: true
  });
}
