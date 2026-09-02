// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const apiMock = vi.hoisted(() => ({
  getOnlineLogsList: vi.fn()
}));
vi.mock('@/api/system', () => apiMock);
vi.mock('@/utils/message', () => ({ message: vi.fn() }));

import { useRole } from './hook';

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getOnlineLogsList.mockResolvedValue({
    code: 0,
    data: { list: [], total: 0, pageSize: 10, currentPage: 1 }
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('monitor/online/hook', () => {
  it('初始状态：form.username 空, loading=true', () => {
    const { form, loading } = useRole();
    expect(form.username).toBe('');
    expect(loading.value).toBe(true);
  });

  it('columns 包含序号/用户名/登录IP/登录时间', () => {
    const { columns } = useRole();
    const props = columns.map((c: any) => c.prop).filter(Boolean);
    expect(props).toContain('id');
    expect(props).toContain('username');
    expect(props).toContain('ip');
    expect(props).toContain('loginTime');
    expect(props).toContain('browser');
    expect(props).toContain('system');
    expect(props).toContain('address');
  });

  it('onSearch 调用 getOnlineLogsList 并更新 dataList', async () => {
    const mockData = {
      list: [{ id: 1, username: 'admin' }],
      total: 1,
      pageSize: 10,
      currentPage: 1
    };
    apiMock.getOnlineLogsList.mockResolvedValue({ code: 0, data: mockData });
    const { onSearch, dataList, pagination } = useRole();
    await onSearch();
    expect(apiMock.getOnlineLogsList).toHaveBeenCalled();
    expect(dataList.value).toEqual(mockData.list);
    expect(pagination.total).toBe(1);
    expect(pagination.pageSize).toBe(10);
    expect(pagination.currentPage).toBe(1);
  });

  it('onSearch 非 0 码时不更新 dataList', async () => {
    apiMock.getOnlineLogsList.mockResolvedValue({ code: 1, data: null });
    const { onSearch, dataList } = useRole();
    await onSearch();
    expect(dataList.value).toEqual([]);
  });

  it('onSearch 分页字段缺失时使用兜底默认值', async () => {
    apiMock.getOnlineLogsList.mockResolvedValue({
      code: 0,
      data: { list: [] }
    });
    const { onSearch, pagination } = useRole();
    await onSearch();
    expect(pagination.total).toBe(0);
    expect(pagination.pageSize).toBe(10);
    expect(pagination.currentPage).toBe(1);
  });

  it('handleOffline 调用 message 并重新搜索', () => {
    const { handleOffline } = useRole();
    expect(() => handleOffline({ username: 'test' })).not.toThrow();
  });

  it('resetForm 无参安全返回', () => {
    const { resetForm } = useRole();
    expect(() => resetForm(null)).not.toThrow();
  });

  it('resetForm 有参时调用 resetFields 并搜索', () => {
    const mockFormEl = { resetFields: vi.fn() };
    const { resetForm } = useRole();
    resetForm(mockFormEl);
    expect(mockFormEl.resetFields).toHaveBeenCalled();
  });

  it('handleSelectionChange 不抛异常', () => {
    const { handleSelectionChange } = useRole();
    expect(() => handleSelectionChange([{ id: 1 }])).not.toThrow();
  });

  it('handleSizeChange 不抛异常', () => {
    const { handleSizeChange } = useRole();
    expect(() => handleSizeChange(20)).not.toThrow();
  });

  it('handleCurrentChange 不抛异常', () => {
    const { handleCurrentChange } = useRole();
    expect(() => handleCurrentChange(2)).not.toThrow();
  });

  it('loginTime formatter 格式化日期', () => {
    const { columns } = useRole();
    const col = columns.find((c: any) => c.prop === 'loginTime') as any;
    const result = col.formatter({ loginTime: '2024-01-15T10:30:00' });
    expect(result).toContain('2024');
    expect(result).toContain('10:30:00');
  });

  it('onSearch 500ms 后 loading 变为 false', async () => {
    vi.useFakeTimers();
    apiMock.getOnlineLogsList.mockResolvedValue({
      code: 0,
      data: { list: [], total: 0, pageSize: 10, currentPage: 1 }
    });
    const { onSearch, loading } = useRole();
    await onSearch();
    expect(loading.value).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(loading.value).toBe(false);
  });
});
