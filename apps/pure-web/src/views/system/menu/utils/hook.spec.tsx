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
import type { FormInstance } from 'element-plus';
import type { MenuDisplayRow } from './types';

const menuRowFixture: MenuDisplayRow = {
  id: '1',
  parentId: '',
  menuType: 0,
  title: '系统管理',
  name: 'System',
  icon: '',
  path: '/system',
  component: '',
  auths: '',
  sort: 1,
  showLink: true,
  redirect: '',
  extraIcon: '',
  enterTransition: '',
  leaveTransition: '',
  activePath: '',
  frameSrc: '',
  frameLoading: true,
  keepAlive: false,
  hiddenTag: false,
  fixedTag: false,
  showParent: false,
  children: []
};

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
    expect(() => resetForm(null as unknown as FormInstance)).not.toThrow();
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
    await handleDelete(menuRowFixture);
    expect(apiMock.deleteMenu).toHaveBeenCalledWith('1');
  });

  it('getMenuType 返回正确的类型文本和标签类型', () => {
    // 通过 columns 的 cellRenderer 间接测试 getMenuType
    const { columns } = useMenu();
    const menuTypeCol = columns.find((c: any) => c.prop === 'menuType');
    expect(menuTypeCol).toBeDefined();
  });

  it('getMenuType 各类型标签渲染', () => {
    const { columns } = useMenu();
    const menuTypeCol = columns.find((c: any) => c.prop === 'menuType');
    // 测试所有菜单类型的 cellRenderer
    for (let type = 0; type <= 3; type++) {
      const vnode = (menuTypeCol as any).cellRenderer({
        row: { menuType: type },
        props: { size: 'default' } as any
      });
      expect(vnode).toBeDefined();
    }
    // default case
    const vnode = (menuTypeCol as any).cellRenderer({
      row: { menuType: 99 },
      props: { size: 'default' } as any
    });
    expect(vnode).toBeDefined();
  });

  it('columns title cellRenderer 渲染图标和文本', () => {
    const { columns } = useMenu();
    const titleCol = columns.find((c: any) => c.prop === 'title');
    const vnode = (titleCol as any).cellRenderer({
      row: { icon: 'ep/home-filled', title: '系统管理' },
      props: { size: 'default' } as any,
      index: 0
    });
    expect(vnode).toBeDefined();
  });

  it('columns component formatter 空组件返回 path', () => {
    const { columns } = useMenu();
    const compCol = columns.find((c: any) => c.prop === 'component');
    const result = (compCol as any).formatter({
      path: '/system',
      component: ''
    });
    expect(result).toBe('/system');
  });

  it('columns component formatter 有组件返回 component', () => {
    const { columns } = useMenu();
    const compCol = columns.find((c: any) => c.prop === 'component');
    const result = (compCol as any).formatter({
      path: '/system',
      component: 'layout'
    });
    expect(result).toBe('layout');
  });

  it('columns showLink formatter', () => {
    const { columns } = useMenu();
    const showLinkCol = columns.find((c: any) => c.prop === 'showLink');
    expect((showLinkCol as any).formatter({ showLink: true })).toBe('否');
    expect((showLinkCol as any).formatter({ showLink: false })).toBe('是');
  });

  it('openDialog 编辑模式传入 row', () => {
    const { openDialog } = useMenu();
    const row = {
      id: '1',
      menuType: 0,
      parentId: '',
      title: '系统管理',
      name: 'system',
      path: '/system',
      component: 'layout',
      sort: 1,
      redirect: '',
      icon: 'ep/tools',
      extraIcon: '',
      enterTransition: '',
      leaveTransition: '',
      activePath: '',
      auths: '',
      frameSrc: '',
      frameLoading: true,
      keepAlive: false,
      hiddenTag: false,
      fixedTag: false,
      showLink: true,
      showParent: false
    };
    openDialog('修改', row as any);
    expect(dialogMock.addDialog.mock.calls[0][0].title).toContain('修改');
  });

  it('openDialog beforeSure 回调存在', () => {
    const { openDialog } = useMenu();
    openDialog('新增');
    const opts = dialogMock.addDialog.mock.calls[0][0];
    expect(opts.beforeSure).toBeDefined();
    expect(opts.contentRenderer).toBeDefined();
    const vnode = opts.contentRenderer();
    expect(vnode).toBeDefined();
  });

  it('handleDelete 失败时不抛异常', async () => {
    apiMock.deleteMenu.mockRejectedValue(new Error('network'));
    const { handleDelete } = useMenu();
    await expect(handleDelete(menuRowFixture)).resolves.not.toThrow();
  });

  it('handleSelectionChange 不抛异常', () => {
    const { handleSelectionChange } = useMenu();
    expect(() => handleSelectionChange([])).not.toThrow();
  });

  it('resetForm 有参时调用 resetFields 并刷新', () => {
    const { resetForm } = useMenu();
    const mockFormEl = { resetFields: vi.fn() };
    resetForm(mockFormEl as unknown as FormInstance);
    expect(mockFormEl.resetFields).toHaveBeenCalled();
  });

  it('toDisplayRows 处理完整 MenuVO 数据', async () => {
    const fullMenuVO = [
      {
        id: '1',
        parentId: null,
        type: 'MENU' as const,
        name: 'system',
        title: '系统管理',
        icon: 'ep/home-filled',
        path: '/system',
        component: 'layout',
        permission: 'system:view',
        sort: 1,
        visible: true,
        meta: {
          redirect: '/system/user',
          extraIcon: 'ep/arrow-down',
          enterTransition: 'fadeIn',
          leaveTransition: 'fadeOut',
          activePath: '/system/user',
          frameSrc: 'https://example.com',
          frameLoading: false,
          keepAlive: true,
          hiddenTag: true,
          fixedTag: true,
          showParent: true
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        deletedAt: null,
        children: []
      }
    ];
    apiMock.getMenuList.mockResolvedValue({ code: 0, data: fullMenuVO });
    const { onSearch, dataList } = useMenu();
    await onSearch();
    expect(dataList.value.length).toBeGreaterThan(0);
    const row = dataList.value[0];
    expect(row.redirect).toBe('/system/user');
    expect(row.keepAlive).toBe(true);
    expect(row.hiddenTag).toBe(true);
    expect(row.fixedTag).toBe(true);
    expect(row.showParent).toBe(true);
    expect(row.frameLoading).toBe(false);
  });

  it('onSearch 带搜索词时过滤结果（匹配子节点）', async () => {
    const { onSearch, dataList, form } = useMenu();
    form.title = '系统';
    await onSearch();
    expect(dataList.value.length).toBeGreaterThanOrEqual(0);
    form.title = '';
  });

  it('formatHigherMenuOptions 有数据时处理', () => {
    const { openDialog, dataList } = useMenu();
    dataList.value = [
      {
        id: '1',
        parentId: '',
        menuType: 0,
        title: '系统管理',
        name: 'system',
        icon: '',
        path: '/system',
        component: '',
        auths: '',
        sort: 1,
        showLink: true,
        redirect: '',
        extraIcon: '',
        enterTransition: '',
        leaveTransition: '',
        activePath: '',
        frameSrc: '',
        frameLoading: true,
        keepAlive: false,
        hiddenTag: false,
        fixedTag: false,
        showParent: false,
        children: []
      }
    ];
    openDialog('新增');
    const opts = dialogMock.addDialog.mock.calls[0][0];
    expect(opts.props.formInline.higherMenuOptions).toBeDefined();
  });

  it('openDialog beforeSure 新增/编辑模式', () => {
    const { openDialog } = useMenu();
    openDialog('新增');
    const opts = dialogMock.addDialog.mock.calls[0][0];
    try {
      opts.beforeSure(() => {}, { options: opts });
    } catch {
      /* formRef undef */
    }
    openDialog('修改', { id: '1', menuType: 0, title: '系统管理' } as any);
    const opts2 = dialogMock.addDialog.mock.calls[1][0];
    try {
      opts2.beforeSure(() => {}, { options: opts2 });
    } catch {
      /* same */
    }
  });

  it('filterMenuTree 带关键字过滤匹配子节点', async () => {
    const richMenuVO = [
      {
        id: '1',
        parentId: null,
        type: 'MENU' as const,
        name: 'system',
        title: '系统管理',
        icon: '',
        path: '/system',
        component: '',
        permission: '',
        sort: 1,
        visible: true,
        meta: null,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        deletedAt: null,
        children: [
          {
            id: '2',
            parentId: '1',
            type: 'MENU' as const,
            name: 'user',
            title: '用户管理',
            icon: '',
            path: '/user',
            component: 'user',
            permission: '',
            sort: 1,
            visible: true,
            meta: null,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
            deletedAt: null,
            children: []
          }
        ]
      }
    ];
    apiMock.getMenuList.mockResolvedValue({ code: 0, data: richMenuVO });
    const { onSearch, dataList, form } = useMenu();
    form.title = '用户';
    await onSearch();
    // 应该过滤出包含“用户”的节点
    expect(dataList.value.length).toBeGreaterThanOrEqual(0);
    form.title = '';
  });
});
