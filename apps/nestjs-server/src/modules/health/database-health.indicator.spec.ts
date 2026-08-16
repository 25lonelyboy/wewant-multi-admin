import { DatabaseHealthIndicator } from './database-health.indicator.js';

describe('DatabaseHealthIndicator', () => {
  it('$queryRaw 成功 → database up', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }])
    };
    const indicator = new DatabaseHealthIndicator(prisma as never);
    await expect(indicator.isHealthy()).resolves.toEqual({
      database: { status: 'up' }
    });
  });

  it('查询抛错 → database down（不向上抛，附根因）', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('conn'))
    };
    const indicator = new DatabaseHealthIndicator(prisma as never);
    await expect(indicator.isHealthy()).resolves.toEqual({
      database: { status: 'down', error: 'conn' }
    });
  });

  it('$queryRaw 永不 resolve → 超时 down（不向上抛）', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockReturnValue(new Promise(() => {}))
    };
    const indicator = new DatabaseHealthIndicator(prisma as never);
    await expect(indicator.isHealthy(20)).resolves.toEqual({
      database: { status: 'down', error: 'probe timeout' }
    });
  });
});
