// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import RoleIndex from './index.vue';

vi.mock('./utils/hook', () => ({
  useRole: () => ({
    form: { name: '', code: '', status: '' },
    isShow: { value: false },
    curRow: { value: null },
    loading: false,
    columns: [],
    rowStyle: () => ({}),
    dataList: [],
    treeData: [],
    treeProps: {},
    isLinkage: { value: false },
    pagination: { total: 0, pageSize: 10, currentPage: 1, background: true },
    isExpandAll: { value: false },
    isSelectAll: { value: false },
    treeSearchValue: { value: '' },
    onSearch: vi.fn(),
    resetForm: vi.fn(),
    openDialog: vi.fn(),
    handleMenu: vi.fn(),
    handleSave: vi.fn(),
    handleDelete: vi.fn(),
    filterMethod: vi.fn(),
    transformI18n: (m: any) => m,
    onQueryChanged: vi.fn(),
    handleSizeChange: vi.fn(),
    handleCurrentChange: vi.fn(),
    handleSelectionChange: vi.fn()
  })
}));

vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => ({ render: () => null })
}));

vi.mock('@/components/RePureTableBar', () => ({
  PureTableBar: {
    name: 'PureTableBar',
    props: ['title', 'columns'],
    template: '<div class="pure-table-bar-stub" />'
  }
}));

vi.mock('@pureadmin/utils', async () => {
  const actual = await vi.importActual<Record<string, any>>('@pureadmin/utils');
  return {
    ...actual,
    delay: (ms: number) => new Promise(r => setTimeout(r, ms)),
    subBefore: (s: string, _c: string) => s,
    deviceDetection: () => false,
    useResizeObserver: vi.fn()
  };
});

describe('role/index.vue', () => {
  it('渲染角色管理页面', () => {
    const wrapper = mountWithEP(RoleIndex);
    expect(wrapper.find('.search-form').exists()).toBe(true);
  });
});
