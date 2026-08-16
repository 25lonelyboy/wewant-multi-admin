// Prisma 7 ESM 兼容冒烟（总 spec §12 修订口径）：
// ESM import 生成 client + adapter 构造成功即通过。
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

describe('prisma 7 ESM 兼容冒烟', () => {
  it('生成 client 与 driver adapter 可构造', () => {
    const adapter = new PrismaPg({
      connectionString: 'postgresql://user:pass@localhost:5432/db'
    });
    const client = new PrismaClient({ adapter });
    expect(client).toBeDefined();
    expect(adapter).toBeDefined();
  });
});
