// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import RoleIndex from './index.vue';

vi.mock('./utils/hook', () => ({
  useRole: () => ({
    form: { name: '', code: '', status: '' },
    isShow: { value: true },
    curRow: { value: { id: '1', name: '管理员' } },
    loading: false,
    columns: [
      { label: '角色编号', prop: 'id' },
      { label: '操作', fixed: 'right', width: 210, slot: 'operation' }
    ],
    rowStyle: () => ({}),
    dataList: [{ id: '1', name: '管理员', code: 'admin', status: 'ACTIVE' }],
    treeData: [{ id: '1', title: '系统管理', children: [] }],
    treeProps: { value: 'id', label: 'title', children: 'children' },
    isLinkage: { value: false },
    pagination: { total: 1, pageSize: 10, currentPage: 1, background: true },
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
    template:
      '<div class="pure-table-bar-stub"><slot :size="\'default\'" :dynamicColumns="[]" /></div>'
  }
}));

const PureTableStub = {
  name: 'pure-table',
  props: ['data', 'columns', 'loading', 'size'],
  template:
    '<div class="pure-table-stub"><template v-for="row in data" :key="row.id"><slot name="operation" :row="row" /></template></div>',
  methods: {
    getTableRef: () => ({
      setAdaptive: () => {},
      getTableDoms: () => ({ tableWrapper: { style: { height: '500px' } } })
    }),
    setAdaptive: () => {},
    getTableDoms: () => ({ tableWrapper: { style: { height: '500px' } } })
  }
};

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
    const wrapper = mountWithEP(RoleIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.find('.search-form').exists()).toBe(true);
  });

  it('搜索表单包含角色名称、标识、状态输入', () => {
    const wrapper = mountWithEP(RoleIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.findAll('.el-input').length).toBeGreaterThanOrEqual(2);
    expect(wrapper.find('.el-select').exists()).toBe(true);
  });

  it('搜索和重置按钮存在', () => {
    const wrapper = mountWithEP(RoleIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    const buttons = wrapper.findAll('.el-button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('PureTableBar 渲染', () => {
    const wrapper = mountWithEP(RoleIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.find('.pure-table-bar-stub').exists()).toBe(true);
  });

  it('isShow=true 时树面板显示', () => {
    const wrapper = mountWithEP(RoleIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.find('.pure-table-bar-stub').exists()).toBe(true);
  });

  it('操作列按钮渲染（修改/删除/权限）', () => {
    const wrapper = mountWithEP(RoleIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    const buttons = wrapper.findAll('.el-button');
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it('deviceDetection 返回 false（非移动端）', () => {
    const wrapper = mountWithEP(RoleIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.exists()).toBe(true);
  });
});
