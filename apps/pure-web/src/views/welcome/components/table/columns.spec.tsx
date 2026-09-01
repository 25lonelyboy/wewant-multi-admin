// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('@pureadmin/utils', async () => {
  const actual = await vi.importActual<Record<string, any>>('@pureadmin/utils');
  return { ...actual, delay: () => Promise.resolve() };
});

vi.mock('./empty.svg?component', () => ({ default: { template: '<div />' } }));

import { useColumns } from './columns';

describe('welcome/table/columns', () => {
  it('columns 包含序号/需求人数/提问数量/解决数量/用户满意度/统计日期/操作', () => {
    const { columns } = useColumns();
    const props = columns.map((c: any) => c.prop).filter(Boolean);
    expect(props).toContain('id');
    expect(props).toContain('requiredNumber');
    expect(props).toContain('satisfaction');
    expect(props).toContain('date');
  });

  it('pagination 默认 pageSize=10, currentPage=1', () => {
    const { pagination } = useColumns();
    expect(pagination.pageSize).toBe(10);
    expect(pagination.currentPage).toBe(1);
  });

  it('onCurrentChange 不抛异常', () => {
    const { onCurrentChange } = useColumns();
    expect(() => onCurrentChange(2)).not.toThrow();
  });

  it('filterMethod more: requiredNumber >= 16000 返回 true', () => {
    const { columns } = useColumns();
    const col = columns.find((c: any) => c.prop === 'requiredNumber') as any;
    expect(col.filterMethod('more', { requiredNumber: 16000 })).toBe(true);
    expect(col.filterMethod('more', { requiredNumber: 15999 })).toBe(false);
  });

  it('filterMethod less: requiredNumber < 16000 返回 true', () => {
    const { columns } = useColumns();
    const col = columns.find((c: any) => c.prop === 'requiredNumber') as any;
    expect(col.filterMethod('less', { requiredNumber: 15999 })).toBe(true);
    expect(col.filterMethod('less', { requiredNumber: 16000 })).toBe(false);
  });

  it('satisfaction cellRenderer 渲染百分比', () => {
    const { columns } = useColumns();
    const col = columns.find((c: any) => c.prop === 'satisfaction') as any;
    const vnode = col.cellRenderer({ row: { satisfaction: 99 } });
    expect(vnode).toBeDefined();
  });

  it('satisfaction cellRenderer 低满意度渲染', () => {
    const { columns } = useColumns();
    const col = columns.find((c: any) => c.prop === 'satisfaction') as any;
    const vnode = col.cellRenderer({ row: { satisfaction: 50 } });
    expect(vnode).toBeDefined();
  });
});
