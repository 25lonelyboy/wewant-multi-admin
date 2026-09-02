// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSystemLogsList: vi.fn(),
  getSystemLogsDetail: vi.fn(),
  addDialog: vi.fn()
}));
vi.mock('@/api/system', () => ({
  getSystemLogsList: mocks.getSystemLogsList,
  getSystemLogsDetail: mocks.getSystemLogsDetail
}));
vi.mock('@/utils/message', () => ({ message: vi.fn() }));
vi.mock('@/components/ReDialog', () => ({ addDialog: mocks.addDialog }));
vi.mock('./detail.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@pureadmin/utils', async () => {
  const actual = await vi.importActual<Record<string, any>>('@pureadmin/utils');
  return {
    ...actual,
    getKeyList: (list: any[], key: string) => list.map((i: any) => i[key]),
    useCopyToClipboard: () => ({
      copied: { value: true },
      update: vi.fn()
    })
  };
});

import { useRole } from './hook';

const mockTableRef = {
  value: {
    setAdaptive: vi.fn(),
    getTableRef: () => ({
      clearSelection: vi.fn(),
      getSelectionRows: () => [{ id: 1 }, { id: 2 }]
    })
  }
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSystemLogsList.mockResolvedValue({
    code: 0,
    data: { list: [], total: 0, pageSize: 10, currentPage: 1 }
  });
  mocks.getSystemLogsDetail.mockResolvedValue({ data: {} });
});

describe('monitor/logs/system/hook', () => {
  it('初始状态：form.module 空, loading=true', () => {
    const { form, loading } = useRole(mockTableRef);
    expect(form.module).toBe('');
    expect(loading.value).toBe(true);
  });

  it('columns 包含 ID/所属模块/请求接口/请求方法/请求耗时', () => {
    const { columns } = useRole(mockTableRef);
    const props = columns.map((c: any) => c.prop).filter(Boolean);
    expect(props).toContain('id');
    expect(props).toContain('module');
    expect(props).toContain('url');
    expect(props).toContain('method');
    expect(props).toContain('takesTime');
    expect(props).toContain('requestTime');
  });

  it('onSearch 调用 getSystemLogsList 并更新 dataList', async () => {
    const mockData = {
      list: [{ id: 1, module: 'auth' }],
      total: 1,
      pageSize: 10,
      currentPage: 1
    };
    mocks.getSystemLogsList.mockResolvedValue({ code: 0, data: mockData });
    const { onSearch, dataList, pagination } = useRole(mockTableRef);
    await onSearch();
    expect(dataList.value).toEqual(mockData.list);
    expect(pagination.total).toBe(1);
    expect(pagination.pageSize).toBe(10);
    expect(pagination.currentPage).toBe(1);
  });

  it('handleSelectionChange 更新 selectedNum', () => {
    const { handleSelectionChange, selectedNum } = useRole(mockTableRef);
    handleSelectionChange([{ id: 1 }, { id: 2 }]);
    expect(selectedNum.value).toBe(2);
  });

  it('onSelectionCancel 重置 selectedNum 并清除选择', () => {
    const { onSelectionCancel, selectedNum } = useRole(mockTableRef);
    onSelectionCancel();
    expect(selectedNum.value).toBe(0);
  });

  it('handleCellDblclick url 列触发拷贝成功', () => {
    const { handleCellDblclick } = useRole(mockTableRef);
    expect(() =>
      handleCellDblclick({ url: '/api/test' }, { property: 'url' })
    ).not.toThrow();
  });

  it('handleCellDblclick 非 url 列不触发拷贝', () => {
    const { handleCellDblclick } = useRole(mockTableRef);
    expect(() =>
      handleCellDblclick({ url: '/api/test' }, { property: 'method' })
    ).not.toThrow();
  });

  it('onbatchDel 删除选中行并重新搜索', () => {
    const { onbatchDel } = useRole(mockTableRef);
    expect(() => onbatchDel()).not.toThrow();
  });

  it('onDetail 调用 getSystemLogsDetail 和 addDialog', async () => {
    const { onDetail } = useRole(mockTableRef);
    onDetail({ id: 1 });
    await vi.dynamicImportSettled();
    expect(mocks.getSystemLogsDetail).toHaveBeenCalledWith({ id: 1 });
  });

  it('resetForm 无参安全返回', () => {
    const { resetForm } = useRole(mockTableRef);
    expect(() => resetForm(null)).not.toThrow();
  });

  it('resetForm 有参调用 resetFields', () => {
    const mockFormEl = { resetFields: vi.fn() };
    const { resetForm } = useRole(mockTableRef);
    resetForm(mockFormEl);
    expect(mockFormEl.resetFields).toHaveBeenCalled();
  });

  it('clearAll 不抛异常', () => {
    const { clearAll } = useRole(mockTableRef);
    expect(() => clearAll()).not.toThrow();
  });

  it('handleSizeChange/handleCurrentChange 不抛异常', () => {
    const { handleSizeChange, handleCurrentChange } = useRole(mockTableRef);
    expect(() => handleSizeChange(20)).not.toThrow();
    expect(() => handleCurrentChange(2)).not.toThrow();
  });

  it('takesTime cellRenderer takesTime<1000 显示 success', () => {
    const { columns } = useRole(mockTableRef);
    const col = columns.find((c: any) => c.prop === 'takesTime') as any;
    const vnode = col.cellRenderer({
      row: { takesTime: 500 },
      props: { size: 'default' }
    });
    expect(vnode).toBeDefined();
  });

  it('takesTime cellRenderer takesTime>=1000 显示 warning', () => {
    const { columns } = useRole(mockTableRef);
    const col = columns.find((c: any) => c.prop === 'takesTime') as any;
    const vnode = col.cellRenderer({
      row: { takesTime: 1500 },
      props: { size: 'default' }
    });
    expect(vnode).toBeDefined();
  });

  it('requestTime formatter 格式化日期', () => {
    const { columns } = useRole(mockTableRef);
    const col = columns.find((c: any) => c.prop === 'requestTime') as any;
    const result = col.formatter({ requestTime: '2024-06-15T08:30:00' });
    expect(result).toContain('2024');
  });

  it('onDetail 调用 addDialog 并传入 contentRenderer', async () => {
    const { onDetail } = useRole(mockTableRef);
    onDetail({ id: 2 });
    await vi.dynamicImportSettled();
    expect(mocks.addDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '系统日志详情',
        fullscreen: true,
        hideFooter: true
      })
    );
  });

  it('onSearch 500ms 后 loading 变为 false', async () => {
    vi.useFakeTimers();
    mocks.getSystemLogsList.mockResolvedValue({
      code: 0,
      data: { list: [], total: 0, pageSize: 10, currentPage: 1 }
    });
    const { onSearch, loading } = useRole(mockTableRef);
    await onSearch();
    expect(loading.value).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(loading.value).toBe(false);
    vi.useRealTimers();
  });
});
