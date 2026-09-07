// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import { nextTick } from 'vue';

// ── Mocks ──
const getMineLogsMock = vi.fn();
vi.mock('@/api/user', () => ({
  getMineLogs: (...args: any[]) => getMineLogsMock(...args)
}));

vi.mock('@pureadmin/utils', () => ({
  deviceDetection: () => false
}));

import SecurityLog from './SecurityLog.vue';

describe('SecurityLog.vue（T2 integration）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('onSearch code=0 填充 dataList 和 pagination', async () => {
    const mockList = [
      {
        id: 1,
        summary: '登录成功',
        ip: '192.168.1.1',
        address: '北京市',
        system: 'Windows 10',
        browser: 'Chrome',
        operatingTime: '2026-09-01T10:00:00Z'
      },
      {
        id: 2,
        summary: '修改密码',
        ip: '10.0.0.1',
        address: '上海市',
        system: 'macOS',
        browser: 'Safari',
        operatingTime: '2026-09-02T12:00:00Z'
      }
    ];

    getMineLogsMock.mockResolvedValue({
      code: 0,
      data: {
        list: mockList,
        total: 2,
        pageSize: 10,
        currentPage: 1
      }
    });

    const wrapper = mountWithEP(SecurityLog);

    // 等待 onMounted → onSearch 完成
    await vi.waitFor(() => {
      expect(getMineLogsMock).toHaveBeenCalled();
    });
    await nextTick();

    const vm = wrapper.vm as any;
    expect(vm.dataList).toEqual(mockList);
    expect(vm.pagination.total).toBe(2);
    expect(vm.pagination.pageSize).toBe(10);
    expect(vm.pagination.currentPage).toBe(1);
  });

  it('onSearch code=0 使用默认分页值', async () => {
    getMineLogsMock.mockResolvedValue({
      code: 0,
      data: {
        list: [],
        total: undefined,
        pageSize: undefined,
        currentPage: undefined
      }
    });

    const wrapper = mountWithEP(SecurityLog);
    await vi.waitFor(() => expect(getMineLogsMock).toHaveBeenCalled());
    await nextTick();

    const vm = wrapper.vm as any;
    expect(vm.dataList).toEqual([]);
    expect(vm.pagination.total).toBe(0);
    expect(vm.pagination.pageSize).toBe(10);
    expect(vm.pagination.currentPage).toBe(1);
  });

  it('404 catch 保持空态', async () => {
    getMineLogsMock.mockRejectedValue(
      new Error('Request failed with status 404')
    );

    const wrapper = mountWithEP(SecurityLog);
    await vi.waitFor(() => expect(getMineLogsMock).toHaveBeenCalled());
    // 等待 catch 处理
    await new Promise(r => setTimeout(r, 50));
    await nextTick();

    const vm = wrapper.vm as any;
    expect(vm.dataList).toEqual([]);
    expect(vm.pagination.total).toBe(0);
  });

  it('finally loading=false（成功路径）', async () => {
    getMineLogsMock.mockResolvedValue({
      code: 0,
      data: { list: [], total: 0 }
    });

    const wrapper = mountWithEP(SecurityLog);
    // 初始 loading=true
    expect((wrapper.vm as any).loading).toBe(true);

    await vi.waitFor(() => expect(getMineLogsMock).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 50));
    await nextTick();

    expect((wrapper.vm as any).loading).toBe(false);
  });

  it('finally loading=false（失败路径）', async () => {
    getMineLogsMock.mockRejectedValue(new Error('500'));

    const wrapper = mountWithEP(SecurityLog);
    expect((wrapper.vm as any).loading).toBe(true);

    await vi.waitFor(() => expect(getMineLogsMock).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 50));
    await nextTick();

    expect((wrapper.vm as any).loading).toBe(false);
  });

  it('渲染安全日志基本结构', async () => {
    getMineLogsMock.mockResolvedValue({
      code: 0,
      data: { list: [], total: 0 }
    });

    const wrapper = mountWithEP(SecurityLog);
    await nextTick();

    // 标题
    expect(wrapper.find('h3').text()).toBe('安全日志');
  });

  it('onSearch code!=0 不更新数据', async () => {
    getMineLogsMock.mockResolvedValue({ code: 500, data: null });

    const wrapper = mountWithEP(SecurityLog);
    await vi.waitFor(() => expect(getMineLogsMock).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 50));
    await nextTick();

    const vm = wrapper.vm as any;
    expect(vm.dataList).toEqual([]);
    expect(vm.pagination.total).toBe(0);
    expect(vm.loading).toBe(false);
  });
});
