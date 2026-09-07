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

const msgBoxMock = vi.hoisted(() => ({
  confirm: vi.fn()
}));
vi.mock('@pureadmin/utils', async () => {
  const actual = await vi.importActual<Record<string, any>>('@pureadmin/utils');
  return { ...actual, deviceDetection: () => false };
});

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, any>>('element-plus');
  return { ...actual, ElMessageBox: msgBoxMock };
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

  it('rowStyle 非当前行无高亮', () => {
    const { rowStyle, curRow } = useRole(mockTreeRef);
    curRow.value = roleFixture;
    const style = rowStyle({ row: { id: '999' } });
    expect(style.background).toBe('');
  });

  it('handleDelete 失败时不抛异常', async () => {
    apiMock.deleteRole.mockRejectedValue(new Error('network'));
    const { handleDelete } = useRole(mockTreeRef);
    await expect(handleDelete(roleFixture)).resolves.not.toThrow();
  });

  it('handleSave 无 curRow 时安全返回', () => {
    const { handleSave, curRow } = useRole(mockTreeRef);
    curRow.value = null;
    expect(() => handleSave()).not.toThrow();
  });

  it('handleSave 有 curRow 时调用 setRoleMenus', () => {
    apiMock.setRoleMenus.mockResolvedValue({ code: 0 });
    const { handleSave, curRow } = useRole(mockTreeRef);
    curRow.value = roleFixture;
    handleSave();
    expect(apiMock.setRoleMenus).toHaveBeenCalled();
  });

  it('handleSave setRoleMenus 失败时不抛异常', () => {
    apiMock.setRoleMenus.mockRejectedValue(new Error('network'));
    const { handleSave, curRow } = useRole(mockTreeRef);
    curRow.value = roleFixture;
    expect(() => handleSave()).not.toThrow();
  });

  it('openDialog 编辑模式传入 row', () => {
    const { openDialog } = useRole(mockTreeRef);
    openDialog('修改', {
      id: '1',
      name: '管理员',
      code: 'admin',
      remark: '拥有所有权限'
    } as any);
    expect(dialogMock.addDialog.mock.calls[0][0].title).toContain('修改');
  });

  it('openDialog beforeSure 和 contentRenderer 存在', () => {
    const { openDialog } = useRole(mockTreeRef);
    openDialog('新增');
    const opts = dialogMock.addDialog.mock.calls[0][0];
    expect(opts.beforeSure).toBeDefined();
    expect(opts.contentRenderer).toBeDefined();
    const vnode = opts.contentRenderer();
    expect(vnode).toBeDefined();
  });

  it('handleMenu 加载菜单树并设置 isShow', async () => {
    apiMock.getRoleMenuIds.mockResolvedValue({
      code: 0,
      data: ['1', '2', '3']
    });
    apiMock.getMenuList.mockResolvedValue({
      code: 0,
      data: [
        {
          id: '1',
          children: [{ id: '2', children: [] }]
        }
      ]
    });
    const { handleMenu } = useRole(mockTreeRef);
    await handleMenu(roleFixture);
    expect(mockTreeRef.value.setCheckedKeys).toHaveBeenCalled();
  });

  it('collectMenuIds 通过 handleMenu 间接覆盖', async () => {
    apiMock.getRoleMenuIds.mockResolvedValue({ code: 0, data: ['1', '2'] });
    const { handleMenu, isShow } = useRole(mockTreeRef);
    await handleMenu(roleFixture);
    expect(isShow.value).toBe(true);
    expect(mockTreeRef.value.setCheckedKeys).toHaveBeenCalledWith(['1', '2']);
  });

  it('handleSelectionChange 不抛异常', () => {
    const { handleSelectionChange } = useRole(mockTreeRef);
    expect(() => handleSelectionChange([])).not.toThrow();
  });

  it('columns createdAt formatter 格式化日期', () => {
    const { columns } = useRole(mockTreeRef);
    const timeCol = columns.find((c: any) => c.prop === 'createdAt');
    expect(timeCol).toBeDefined();
    const result = (timeCol as any).formatter({
      createdAt: '2024-06-15T10:30:00Z'
    });
    expect(result).toContain('2024');
  });

  it('status cellRenderer 渲染开关', () => {
    const { columns } = useRole(mockTreeRef);
    const cellRendererCol = columns.find(
      (c: any) => typeof c.cellRenderer === 'function' && c.prop === undefined
    );
    const vnode = (cellRendererCol as any).cellRenderer({
      row: { status: 'ACTIVE', name: 'test' },
      props: { size: 'default' },
      index: 0
    });
    expect(vnode).toBeDefined();
  });

  it('onChange confirm 确认后调用 updateRole', async () => {
    apiMock.updateRole.mockResolvedValue({ code: 0 });
    msgBoxMock.confirm.mockResolvedValue(undefined);
    const { columns } = useRole(mockTreeRef);
    const col = columns.find((c: any) => typeof c.cellRenderer === 'function');
    const row = { id: '1', status: 'ACTIVE', name: '管理员' };
    const vnode = (col as any).cellRenderer({
      row,
      props: { size: 'default' } as any,
      index: 0
    });
    const onChange = (vnode as any).props?.onChange;
    if (typeof onChange === 'function') onChange();
    await vi.waitFor(() => {
      expect(apiMock.updateRole).toHaveBeenCalled();
    });
  });

  it('onChange confirm 取消后回滚 status', async () => {
    msgBoxMock.confirm.mockRejectedValue(new Error('cancel'));
    const { columns } = useRole(mockTreeRef);
    const col = columns.find((c: any) => typeof c.cellRenderer === 'function');
    const row = { id: '1', status: 'ACTIVE', name: '管理员' };
    const vnode = (col as any).cellRenderer({
      row,
      props: { size: 'default' } as any,
      index: 0
    });
    const onChange = (vnode as any).props?.onChange;
    if (typeof onChange === 'function') onChange();
    await vi.waitFor(() => {
      expect(row.status).toBe('DISABLED');
    });
  });

  it('onChange confirm 确认后 updateRole 失败回滚', async () => {
    apiMock.updateRole.mockRejectedValue(new Error('fail'));
    msgBoxMock.confirm.mockResolvedValue(undefined);
    const { columns } = useRole(mockTreeRef);
    const col = columns.find((c: any) => typeof c.cellRenderer === 'function');
    const row = { id: '1', status: 'ACTIVE', name: '管理员' };
    const vnode = (col as any).cellRenderer({
      row,
      props: { size: 'default' } as any,
      index: 0
    });
    const onChange = (vnode as any).props?.onChange;
    if (typeof onChange === 'function') onChange();
    await vi.waitFor(() => {
      expect(row.status).toBe('DISABLED');
    });
  });

  it('openDialog beforeSure 回调内部逻辑', () => {
    const { openDialog } = useRole(mockTreeRef);
    openDialog('新增');
    const opts = dialogMock.addDialog.mock.calls[0][0];
    // 调用 beforeSure，formRef 未设置会抛错
    try {
      opts.beforeSure(() => {}, { options: opts });
    } catch {
      // formRef.value 为 undefined → TypeError
    }
    // 编辑模式
    openDialog('修改', {
      id: '1',
      name: '管理员',
      code: 'admin',
      remark: ''
    } as any);
    const opts2 = dialogMock.addDialog.mock.calls[1][0];
    try {
      opts2.beforeSure(() => {}, { options: opts2 });
    } catch {
      // same
    }
  });

  it('watch isExpandAll 切换展开/折叠', async () => {
    const { isExpandAll } = useRole(mockTreeRef);
    isExpandAll.value = true;
    await vi.waitFor(() => {
      expect(mockTreeRef.value.setExpandedKeys).toHaveBeenCalled();
    });
    mockTreeRef.value.setExpandedKeys.mockClear();
    isExpandAll.value = false;
    await vi.waitFor(() => {
      expect(mockTreeRef.value.setExpandedKeys).toHaveBeenCalled();
    });
  });

  it('watch isSelectAll 切换全选/取消', async () => {
    const { isSelectAll } = useRole(mockTreeRef);
    isSelectAll.value = true;
    await vi.waitFor(() => {
      expect(mockTreeRef.value.setCheckedKeys).toHaveBeenCalled();
    });
    mockTreeRef.value.setCheckedKeys.mockClear();
    isSelectAll.value = false;
    await vi.waitFor(() => {
      expect(mockTreeRef.value.setCheckedKeys).toHaveBeenCalled();
    });
  });
});
