// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : (m ?? ''))
}));

const apiMock = vi.hoisted(() => ({
  getRoleList: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  getMenuList: vi.fn(),
  getRoleMenuIds: vi.fn(),
  setRoleMenus: vi.fn()
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
  return { ...actual, deviceDetection: () => false };
});

import { useRole } from './hook';
import type { FormInstance } from 'element-plus';
import type { MenuVO, RoleVO } from '@multi-admin/contracts';

const roleFixture: RoleVO = {
  id: '1',
  code: 'admin',
  name: '管理员',
  status: 'ACTIVE',
  remark: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const mockTreeRef = {
  value: {
    setCheckedKeys: vi.fn(),
    getCheckedKeys: vi.fn(() => []),
    setExpandedKeys: vi.fn(),
    filter: vi.fn()
  }
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getRoleList.mockResolvedValue({
    code: 0,
    data: { items: [], total: 0, pageSize: 10, page: 1 }
  });
  apiMock.getMenuList.mockResolvedValue({ code: 0, data: [] });
});

describe('useRole', () => {
  it('初始状态：form 默认空, loading=true', () => {
    const { form, loading } = useRole(mockTreeRef);
    expect(form.name).toBe('');
    expect(form.code).toBe('');
    expect(form.status).toBe('');
    expect(loading.value).toBe(true);
  });

  it('columns 包含角色编号、名称、标识、状态、备注、创建时间', () => {
    const { columns } = useRole(mockTreeRef);
    const props = columns.map((c: any) => c.prop).filter(Boolean);
    expect(props).toContain('id');
    expect(props).toContain('name');
    expect(props).toContain('code');
    expect(props).toContain('remark');
    expect(props).toContain('createdAt');
  });

  it('onSearch 调用 getRoleList 并更新 dataList', async () => {
    const mockData = {
      items: [{ id: '1', name: '管理员', code: 'admin', status: 'ACTIVE' }],
      total: 1,
      pageSize: 10,
      page: 1
    };
    apiMock.getRoleList.mockResolvedValue({ code: 0, data: mockData });

    const { onSearch, dataList, pagination } = useRole(mockTreeRef);
    await onSearch();
    expect(dataList.value).toEqual(mockData.items);
    expect(pagination.total).toBe(1);
  });

  it('handleSizeChange / handleCurrentChange 不抛异常', () => {
    const { handleSizeChange, handleCurrentChange } = useRole(mockTreeRef);
    expect(() => handleSizeChange(20)).not.toThrow();
    expect(() => handleCurrentChange(2)).not.toThrow();
  });

  it('resetForm 无参时安全返回', () => {
    const { resetForm } = useRole(mockTreeRef);
    expect(() => resetForm(null as unknown as FormInstance)).not.toThrow();
  });

  it('openDialog 调用 addDialog（新增模式）', () => {
    const { openDialog } = useRole(mockTreeRef);
    openDialog();
    expect(dialogMock.addDialog).toHaveBeenCalledTimes(1);
    expect(dialogMock.addDialog.mock.calls[0][0].title).toContain('新增');
  });

  it('handleDelete 调用 deleteRole API', async () => {
    apiMock.deleteRole.mockResolvedValue({ code: 0, data: null });
    const { handleDelete } = useRole(mockTreeRef);
    await handleDelete(roleFixture);
    expect(apiMock.deleteRole).toHaveBeenCalledWith('1');
  });

  it('handleMenu 有 id 时设置 isShow=true 并加载菜单权限', async () => {
    apiMock.getRoleMenuIds.mockResolvedValue({ code: 0, data: ['1', '2'] });
    const { handleMenu, isShow, curRow } = useRole(mockTreeRef);
    await handleMenu(roleFixture);
    expect(isShow.value).toBe(true);
    expect(curRow.value).toEqual(roleFixture);
    expect(mockTreeRef.value.setCheckedKeys).toHaveBeenCalledWith(['1', '2']);
  });

  it('handleMenu 无 id 时关闭面板', async () => {
    const { handleMenu, isShow, curRow } = useRole(mockTreeRef);
    await handleMenu();
    expect(isShow.value).toBe(false);
    expect(curRow.value).toBeNull();
  });

  it('rowStyle 当前行高亮', () => {
    const { rowStyle, curRow } = useRole(mockTreeRef);
    curRow.value = roleFixture;
    const style = rowStyle({ row: { id: '1' } });
    expect(style.background).toBeTruthy();
  });

  it('onQueryChanged 调用 treeRef.filter', () => {
    const { onQueryChanged } = useRole(mockTreeRef);
    onQueryChanged('test');
    expect(mockTreeRef.value.filter).toHaveBeenCalledWith('test');
  });

  it('filterMethod 使用 transformI18n 匹配', () => {
    const { filterMethod } = useRole(mockTreeRef);
    const menuNode = { title: '菜单管理' } as MenuVO;
    expect(filterMethod('菜单', menuNode)).toBe(true);
    expect(filterMethod('不存在', menuNode)).toBe(false);
  });
});
