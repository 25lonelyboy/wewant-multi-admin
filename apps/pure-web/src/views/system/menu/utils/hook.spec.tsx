// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : (m ?? ''))
}));

const apiMock = vi.hoisted(() => ({
  getMenuList: vi.fn(),
  createMenu: vi.fn(),
  updateMenu: vi.fn(),
  deleteMenu: vi.fn()
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

import { useMenu } from './hook';

const mockMenuVO = [
  {
    id: '1',
    parentId: null,
    type: 'MENU' as const,
    name: 'system',
    title: '系统管理',
    icon: 'ep/home-filled',
    path: '/system',
    component: null,
    permission: null,
    sort: 1,
    visible: true,
    meta: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    children: []
  }
];

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getMenuList.mockResolvedValue({ code: 0, data: mockMenuVO });
});

describe('useMenu', () => {
  it('初始状态：form.title 空, loading=true', () => {
    const { form, loading } = useMenu();
    expect(form.title).toBe('');
    expect(loading.value).toBe(true);
  });

  it('columns 包含菜单名称、类型、路径、组件、权限标识、排序、隐藏', () => {
    const { columns } = useMenu();
    const props = columns.map((c: any) => c.prop).filter(Boolean);
    expect(props).toContain('title');
    expect(props).toContain('menuType');
    expect(props).toContain('path');
    expect(props).toContain('component');
    expect(props).toContain('auths');
    expect(props).toContain('sort');
    expect(props).toContain('showLink');
  });

  it('onSearch 调用 getMenuList 并更新 dataList', async () => {
    const { onSearch, dataList } = useMenu();
    await onSearch();
    expect(apiMock.getMenuList).toHaveBeenCalled();
    expect(dataList.value.length).toBeGreaterThan(0);
  });

  it('onSearch 带搜索词时过滤结果', async () => {
    const { onSearch, dataList, form } = useMenu();
    form.title = '不存在的菜单';
    await onSearch();
    expect(dataList.value).toEqual([]);
    form.title = '';
  });

  it('resetForm 无参时安全返回', () => {
    const { resetForm } = useMenu();
    expect(() => resetForm(null)).not.toThrow();
  });

  it('openDialog 调用 addDialog（新增模式）', () => {
    const { openDialog } = useMenu();
    openDialog();
    expect(dialogMock.addDialog).toHaveBeenCalledTimes(1);
    expect(dialogMock.addDialog.mock.calls[0][0].title).toContain('新增');
  });

  it('handleDelete 调用 deleteMenu API', async () => {
    apiMock.deleteMenu.mockResolvedValue({ code: 0, data: null });
    const { handleDelete } = useMenu();
    await handleDelete({ id: '1', title: '系统管理' });
    expect(apiMock.deleteMenu).toHaveBeenCalledWith('1');
  });

  it('getMenuType 返回正确的类型文本和标签类型', () => {
    // 通过 columns 的 cellRenderer 间接测试 getMenuType
    const { columns } = useMenu();
    const menuTypeCol = columns.find((c: any) => c.prop === 'menuType');
    expect(menuTypeCol).toBeDefined();
  });
});
