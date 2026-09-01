// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('@pureadmin/utils', async () => {
  const actual = await vi.importActual<Record<string, any>>('@pureadmin/utils');
  return {
    ...actual,
    cloneDeep: <T>(v: T) => JSON.parse(JSON.stringify(v))
  };
});

import {
  chartData,
  barChartData,
  progressData,
  tableData,
  latestNewsData
} from './data';

describe('welcome/data', () => {
  it('chartData 有4项（需求人数/提问数量/解决数量/用户满意度）', () => {
    expect(chartData).toHaveLength(4);
    expect(chartData[0].name).toBe('需求人数');
  });

  it('barChartData 有2项（上周/本周）', () => {
    expect(barChartData).toHaveLength(2);
    expect(barChartData[0].requireData).toHaveLength(7);
  });

  it('progressData 有7项', () => {
    expect(progressData).toHaveLength(7);
  });

  it('tableData 有30项，每项含 id/requiredNumber 等字段', () => {
    expect(tableData).toHaveLength(30);
    expect(tableData[0].id).toBe(1);
    expect(tableData[0].requiredNumber).toBeGreaterThanOrEqual(13500);
  });

  it('latestNewsData 有14项', () => {
    expect(latestNewsData).toHaveLength(14);
    expect(latestNewsData[0].date).toContain('周');
  });
});
