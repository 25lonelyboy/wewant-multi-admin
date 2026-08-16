import { RedisHealthIndicator } from './redis-health.indicator.js';

describe('RedisHealthIndicator', () => {
  it('ping PONG → redis up', async () => {
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const indicator = new RedisHealthIndicator(redis as never);
    await expect(indicator.isHealthy()).resolves.toEqual({
      redis: { status: 'up' }
    });
  });

  it('ping 抛错 → redis down（不向上抛）', async () => {
    const redis = { ping: jest.fn().mockRejectedValue(new Error('down')) };
    const indicator = new RedisHealthIndicator(redis as never);
    await expect(indicator.isHealthy()).resolves.toEqual({
      redis: { status: 'down' }
    });
  });
});
