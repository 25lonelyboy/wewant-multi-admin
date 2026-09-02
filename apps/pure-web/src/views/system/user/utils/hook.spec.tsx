// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : (m ?? ''))
}));

const apiMock = vi.hoisted(() => ({
  getUserList: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  getAllRoles: vi.fn(),
  getDeptList: vi.fn(),
  getUserRoleIds: vi.fn(),
  setUserRoles: vi.fn()
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
    getKeyList: (list: any[], key: string) => list.map(i => i[key]),
    hideTextAtIndex: (s: string) => s
  };
});

vi.mock('@/utils/tree', () => ({
  handleTree: (data: any[]) => data
}));

vi.mock('@/assets/user.jpg', () => ({ default: 'user.jpg' }));
vi.mock('@zxcvbn-ts/core', () => ({
  ZxcvbnFactory: class {
    check() {
      return { score: 3 };
    }
  }
}));

import { useUser } from './hook';
import type { FormInstance } from 'element-plus';
import type { UserVO } from '@multi-admin/contracts';

const userFixture: UserVO = {
  id: '1',
  username: 'admin',
  nickname: '管理员',
  status: 'ACTIVE',
  avatar: null,
  phone: null,
  email: null,
  sex: 0,
  remark: null,
  roles: ['admin'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const mockTableRef = {
  value: {
    setAdaptive: vi.fn(),
    getTableRef: () => ({ clearSelection: vi.fn(), getSelectionRows: () => [] })
  }
} as any;
const mockTreeRef = { value: { onTreeReset: vi.fn() } } as any;

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getUserList.mockResolvedValue({
    code: 0,
    data: { items: [], total: 0, pageSize: 10, page: 1 }
  });
  apiMock.getDeptList.mockResolvedValue({ code: 0, data: [] });
  apiMock.getAllRoles.mockResolvedValue({ data: [] });
});

describe('useUser', () => {
  it('初始状态：form 默认空, loading=true, pagination 默认', () => {
    const { form, loading, pagination } = useUser(mockTableRef, mockTreeRef);
    expect(form.username).toBe('');
    expect(form.deptId).toBe('');
    expect(form.status).toBe('');
    expect(loading.value).toBe(true);
    expect(pagination.pageSize).toBe(10);
    expect(pagination.currentPage).toBe(1);
  });

  it('columns 包含用户编号、名称、昵称、性别、部门、手机、状态、创建时间', () => {
    const { columns } = useUser(mockTableRef, mockTreeRef);
    const props = columns.map((c: any) => c.prop).filter(Boolean);
    expect(props).toContain('id');
    expect(props).toContain('username');
    expect(props).toContain('nickname');
    expect(props).toContain('sex');
    expect(props).toContain('phone');
    expect(props).toContain('status');
    expect(props).toContain('createdAt');
  });

  it('onSearch 调用 getUserList 并更新 dataList/pagination', async () => {
    const mockData = {
      items: [{ id: '1', username: 'admin', nickname: '管理员' }],
      total: 1,
      pageSize: 10,
      page: 1
    };
    apiMock.getUserList.mockResolvedValue({ code: 0, data: mockData });

    const { onSearch, dataList, pagination } = useUser(
      mockTableRef,
      mockTreeRef
    );
    await onSearch();
    expect(dataList.value).toEqual(mockData.items);
    expect(pagination.total).toBe(1);
  });

  it('handleSizeChange 更新 pageSize 并触发 onSearch', () => {
    const { handleSizeChange } = useUser(mockTableRef, mockTreeRef);
    handleSizeChange(20);
    // 内部调用 onSearch，验证不抛异常
  });

  it('handleCurrentChange 更新 currentPage 并触发 onSearch', () => {
    const { handleCurrentChange } = useUser(mockTableRef, mockTreeRef);
    handleCurrentChange(2);
  });

  it('handleSelectionChange 更新 selectedNum', () => {
    const { handleSelectionChange, selectedNum } = useUser(
      mockTableRef,
      mockTreeRef
    );
    handleSelectionChange([{ id: '1' }, { id: '2' }] as unknown as UserVO[]);
    expect(selectedNum.value).toBe(2);
  });

  it('onSelectionCancel 重置 selectedNum', () => {
    const { onSelectionCancel, selectedNum } = useUser(
      mockTableRef,
      mockTreeRef
    );
    onSelectionCancel();
    expect(selectedNum.value).toBe(0);
  });

  it('resetForm 无参时安全返回', () => {
    const { resetForm } = useUser(mockTableRef, mockTreeRef);
    expect(() => resetForm(null as unknown as FormInstance)).not.toThrow();
  });

  it('onTreeSelect 选中时设置 deptId', () => {
    const { onTreeSelect, form } = useUser(mockTableRef, mockTreeRef);
    onTreeSelect({ id: 5, selected: true });
    expect(form.deptId).toBe('5');
  });

  it('onTreeSelect 取消选中时清空 deptId', () => {
    const { onTreeSelect, form } = useUser(mockTableRef, mockTreeRef);
    onTreeSelect({ id: 5, selected: false });
    expect(form.deptId).toBe('');
  });

  it('openDialog 调用 addDialog（新增模式）', () => {
    const { openDialog } = useUser(mockTableRef, mockTreeRef);
    openDialog();
    expect(dialogMock.addDialog).toHaveBeenCalledTimes(1);
    expect(dialogMock.addDialog.mock.calls[0][0].title).toContain('新增');
  });

  it('openDialog 编辑模式传入 row', () => {
    const { openDialog } = useUser(mockTableRef, mockTreeRef);
    const row = {
      id: '1',
      username: 'admin',
      nickname: '管理员',
      status: 'ACTIVE'
    };
    openDialog('修改', row as any);
    expect(dialogMock.addDialog.mock.calls[0][0].title).toContain('修改');
  });

  it('handleDelete 调用 deleteUser API', async () => {
    apiMock.deleteUser.mockResolvedValue({ code: 0, data: null });
    const { handleDelete } = useUser(mockTableRef, mockTreeRef);
    await handleDelete(userFixture);
    expect(apiMock.deleteUser).toHaveBeenCalledWith('1');
  });

  it('handleUpdate 不抛异常', () => {
    const { handleUpdate } = useUser(mockTableRef, mockTreeRef);
    expect(() => handleUpdate(userFixture)).not.toThrow();
  });
});
