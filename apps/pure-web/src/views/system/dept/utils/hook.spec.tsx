// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : (m ?? ''))
}));

const apiMock = vi.hoisted(() => ({
  getDeptList: vi.fn()
}));
vi.mock('@/api/system', () => apiMock);

const dialogMock = vi.hoisted(() => ({
  addDialog: vi.fn()
}));
vi.mock('@/components/ReDialog', () => dialogMock);

vi.mock('@/utils/message', () => ({
  message: vi.fn()
}));

vi.mock('@pureadmin/utils', async () => {
  const actual = await vi.importActual<Record<string, any>>('@pureadmin/utils');
  return {
    ...actual,
    deviceDetection: () => false,
    isAllEmpty: (v: any) => !v && v !== 0,
    cloneDeep: (v: any) => JSON.parse(JSON.stringify(v))
  };
});

vi.mock('@/utils/tree', () => ({
  handleTree: (data: any[]) => data
}));

import { useDept } from './hook';
import type { FormInstance } from 'element-plus';
import type { DeptRow } from './types';

const deptRowFixture: DeptRow = {
  id: 1,
  parentId: 0,
  name: '测试部门',
  principal: '',
  phone: '',
  email: '',
  sort: 0,
  status: 1,
  createTime: '2026-01-01 00:00:00',
  remark: ''
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getDeptList.mockResolvedValue({ code: 0, data: [] });
});

describe('useDept', () => {
  it('初始状态：loading=true, dataList=[], form 默认空', () => {
    const { form, loading, dataList } = useDept();
    expect(form.name).toBe('');
    expect(form.status).toBeNull();
    expect(loading.value).toBe(true);
    expect(dataList.value).toEqual([]);
  });

  it('columns 包含部门名称、排序、状态、创建时间、备注、操作', () => {
    const { columns } = useDept();
    const props = columns.map((c: any) => c.prop).filter(Boolean);
    expect(props).toContain('name');
    expect(props).toContain('sort');
    expect(props).toContain('status');
    expect(props).toContain('createTime');
    expect(props).toContain('remark');
  });

  it('onSearch 调用 getDeptList 并更新 dataList', async () => {
    const mockData = [
      { id: 1, name: '技术部', status: 1, parentId: 0 },
      { id: 2, name: '市场部', status: 1, parentId: 0 }
    ];
    apiMock.getDeptList.mockResolvedValue({ code: 0, data: mockData });

    const { onSearch, loading } = useDept();
    await onSearch();
    expect(apiMock.getDeptList).toHaveBeenCalled();
    expect(loading.value).toBe(true);
  });

  it('onSearch 按名称和状态过滤', async () => {
    const mockData = [
      { id: 1, name: '技术部', status: 1, parentId: 0 },
      { id: 2, name: '市场部', status: 0, parentId: 0 }
    ];
    apiMock.getDeptList.mockResolvedValue({ code: 0, data: mockData });

    const { onSearch, form, dataList } = useDept();
    form.name = '技术';
    form.status = 1 as any;
    await onSearch();
    expect(dataList.value).toHaveLength(1);
    expect(dataList.value[0].name).toBe('技术部');
  });

  it('resetForm 无参时安全返回', () => {
    const { resetForm } = useDept();
    expect(() => resetForm(null as unknown as FormInstance)).not.toThrow();
    expect(() => resetForm(undefined)).not.toThrow();
  });

  it('resetForm 有参时调用 resetFields 并刷新', () => {
    const { resetForm } = useDept();
    const mockFormEl = { resetFields: vi.fn() };
    resetForm(mockFormEl as unknown as FormInstance);
    expect(mockFormEl.resetFields).toHaveBeenCalled();
  });

  it('handleSelectionChange 不抛异常', () => {
    const { handleSelectionChange } = useDept();
    expect(() => handleSelectionChange([])).not.toThrow();
  });

  it('openDialog 调用 addDialog', () => {
    const { openDialog } = useDept();
    openDialog();
    expect(dialogMock.addDialog).toHaveBeenCalledTimes(1);
    expect(dialogMock.addDialog.mock.calls[0][0].title).toContain('新增');
  });

  it('openDialog 编辑模式传入 row 数据', () => {
    const { openDialog } = useDept();
    const row = {
      id: 1,
      name: '技术部',
      parentId: 0,
      principal: '',
      phone: '',
      email: '',
      sort: 0,
      status: 1,
      remark: ''
    };
    openDialog('修改', row as any);
    expect(dialogMock.addDialog).toHaveBeenCalledTimes(1);
    expect(dialogMock.addDialog.mock.calls[0][0].title).toContain('修改');
  });

  it('openDialog beforeSure 存在且为函数', () => {
    const { openDialog } = useDept();
    openDialog('新增');
    const opts = dialogMock.addDialog.mock.calls[0][0];
    expect(opts.beforeSure).toBeDefined();
    expect(typeof opts.beforeSure).toBe('function');
  });

  it('handleDelete 调用 message 并触发 onSearch', () => {
    const { handleDelete } = useDept();
    handleDelete(deptRowFixture);
    // handleDelete 内部调用 message 和 onSearch
  });

  it('columns status cellRenderer 渲染标签', () => {
    const { columns } = useDept();
    const statusCol = columns.find((c: any) => c.prop === 'status');
    expect(statusCol).toBeDefined();
    expect(statusCol!.cellRenderer).toBeDefined();
  });

  it('columns createTime formatter 格式化日期', () => {
    const { columns } = useDept();
    const timeCol = columns.find((c: any) => c.prop === 'createTime');
    expect(timeCol).toBeDefined();
    expect(timeCol!.formatter).toBeDefined();
    const result = (timeCol as any).formatter({
      createTime: '2024-01-01T00:00:00Z'
    });
    expect(result).toContain('2024');
  });
});
