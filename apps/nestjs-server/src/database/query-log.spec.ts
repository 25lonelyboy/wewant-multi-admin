import { resolveQueryLog } from './query-log.js';

describe('resolveQueryLog', () => {
  const threshold = 500;

  it('超过阈值 → warn 级 + 现有慢查询文案', () => {
    expect(
      resolveQueryLog({ query: 'SELECT 1', duration: 600 }, threshold, false)
    ).toEqual({
      level: 'warn',
      message: 'Slow query detected (600ms >= 500ms): SELECT 1'
    });
  });

  it('恰等于阈值（边界 >=）→ warn 级 + 慢查询文案', () => {
    const result = resolveQueryLog(
      { query: 'SELECT 1', duration: 500 },
      threshold,
      false
    );
    expect(result).toEqual({
      level: 'warn',
      message: 'Slow query detected (500ms >= 500ms): SELECT 1'
    });
  });

  it('低于阈值 + queryLog=true → log 级 + 新文案（不含 Slow query detected / >= 表述）', () => {
    const result = resolveQueryLog(
      { query: 'SELECT 1', duration: 10 },
      threshold,
      true
    );
    expect(result).toEqual({
      level: 'log',
      message: 'Query log (10ms): SELECT 1'
    });
    expect(result?.message).not.toContain('Slow query detected');
    expect(result?.message).not.toContain('>=');
  });

  it('低于阈值 + queryLog=false → null（不打日志）', () => {
    expect(
      resolveQueryLog({ query: 'SELECT 1', duration: 10 }, threshold, false)
    ).toBeNull();
  });

  it('超过阈值时无论 queryLog 开关均输出 warn', () => {
    expect(
      resolveQueryLog({ query: 'SELECT 1', duration: 900 }, threshold, true)
        ?.level
    ).toBe('warn');
  });
});
