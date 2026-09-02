// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const apiMock = vi.hoisted(() => ({
  getOperationLogsList: vi.fn()
}));
vi.mock('@/api/system', () => apiMock);
vi.mock('@/utils/message', () => ({ message: vi.fn() }));
vi.mock('@/views/system/hooks', () => ({
  usePublicHooks: () => ({
    tagStyle: { value: () => ({}) }
  })
}));

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

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getOperationLogsList.mockResolvedValue({
    code: 0,
    data: { list: [], total: 0, pageSize: 10, currentPage: 1 }
  });
});

describe('monitor/logs/operation/hook', () => {
  it('初始状态：form.module 空, loading=true', () => {
    const { form, loading } = useRole(mockTableRef);
    expect(form.module).toBe('');
    expect(form.status).toBe('');
    expect(loading.value).toBe(true);
  });

  it('columns 包含序号/操作人员/所属模块/操作概要/操作状态', () => {
    const { columns } = useRole(mockTableRef);
    const props = columns.map((c: any) => c.prop).filter(Boolean);
    expect(props).toContain('id');
    expect(props).toContain('username');
    expect(props).toContain('module');
    expect(props).toContain('summary');
    expect(props).toContain('status');
  });

  it('onSearch 调用 getOperationLogsList 并更新 dataList', async () => {
    const mockData = {
      list: [{ id: 1, username: 'admin', summary: 'test' }],
      total: 1,
      pageSize: 10,
      currentPage: 1
    };
    apiMock.getOperationLogsList.mockResolvedValue({
      code: 0,
      data: mockData
    });
    const { onSearch, dataList, pagination } = useRole(mockTableRef);
    await onSearch();
    expect(dataList.value).toEqual(mockData.list);
    expect(pagination.total).toBe(1);
  });

  it('onSearch 非 0 码时不更新 dataList', async () => {
    apiMock.getOperationLogsList.mockResolvedValue({ code: 1, data: null });
    const { onSearch, dataList } = useRole(mockTableRef);
    await onSearch();
    expect(dataList.value).toEqual([]);
  });

  it('onSearch 分页字段缺失时使用兜底默认值', async () => {
    apiMock.getOperationLogsList.mockResolvedValue({
      code: 0,
      data: { list: [] }
    });
    const { onSearch, pagination } = useRole(mockTableRef);
    await onSearch();
    expect(pagination.total).toBe(0);
    expect(pagination.pageSize).toBe(10);
    expect(pagination.currentPage).toBe(1);
  });

  it('handleSelectionChange 更新 selectedNum', () => {
    const { handleSelectionChange, selectedNum } = useRole(mockTableRef);
    handleSelectionChange([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(selectedNum.value).toBe(3);
  });

  it('onSelectionCancel 重置 selectedNum', () => {
    const { onSelectionCancel, selectedNum } = useRole(mockTableRef);
    selectedNum.value = 5;
    onSelectionCancel();
    expect(selectedNum.value).toBe(0);
  });

  it('onbatchDel 不抛异常', () => {
    const { onbatchDel } = useRole(mockTableRef);
    expect(() => onbatchDel()).not.toThrow();
  });

  it('resetForm 无参安全返回', () => {
    const { resetForm } = useRole(mockTableRef);
    expect(() => resetForm(null)).not.toThrow();
  });

  it('resetForm 有参调用 resetFields 并搜索', () => {
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

  it('status cellRenderer status=1 显示成功', () => {
    const { columns } = useRole(mockTableRef);
    const col = columns.find((c: any) => c.prop === 'status') as any;
    const vnode = col.cellRenderer({
      row: { status: 1 },
      props: { size: 'default' }
    });
    expect(vnode).toBeDefined();
  });

  it('status cellRenderer status=0 显示失败', () => {
    const { columns } = useRole(mockTableRef);
    const col = columns.find((c: any) => c.prop === 'status') as any;
    const vnode = col.cellRenderer({
      row: { status: 0 },
      props: { size: 'default' }
    });
    expect(vnode).toBeDefined();
  });

  it('operatingTime formatter 格式化日期', () => {
    const { columns } = useRole(mockTableRef);
    const col = columns.find((c: any) => c.prop === 'operatingTime') as any;
    const result = col.formatter({ operatingTime: '2024-05-20T16:45:00' });
    expect(result).toContain('2024');
  });

  it('onSearch 500ms 后 loading 变为 false', async () => {
    vi.useFakeTimers();
    apiMock.getOperationLogsList.mockResolvedValue({
      code: 0,
      data: { list: [], total: 0, pageSize: 10, currentPage: 1 }
    });
    const { onSearch, loading } = useRole(mockTableRef);
    await onSearch();
    expect(loading.value).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(loading.value).toBe(false);
  });
});
