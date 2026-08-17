import { RedisHealthIndicator } from './redis-health.indicator.js';

describe('RedisHealthIndicator', () => {
  it('ping PONG → up', async () => {
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const indicator = new RedisHealthIndicator(redis as never);
    await expect(indicator.isHealthy()).resolves.toEqual({ status: 'up' });
  });

  it('ping 抛错 → down（不向上抛，附根因）', async () => {
    const redis = { ping: jest.fn().mockRejectedValue(new Error('down')) };
    const indicator = new RedisHealthIndicator(redis as never);
    await expect(indicator.isHealthy()).resolves.toEqual({
      status: 'down',
      error: 'down'
    });
  });

  it('ping 永不 resolve → 超时 down（不向上抛）', async () => {
    const redis = { ping: jest.fn().mockReturnValue(new Promise(() => {})) };
    const indicator = new RedisHealthIndicator(redis as never);
    await expect(indicator.isHealthy(20)).resolves.toEqual({
      status: 'down',
      error: 'probe timeout'
    });
  });
});
