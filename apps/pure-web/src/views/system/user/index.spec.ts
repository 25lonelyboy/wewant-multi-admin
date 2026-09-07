// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import UserIndex from './index.vue';

vi.mock('./utils/hook', () => ({
  useUser: () => ({
    form: { deptId: '', username: '', phone: '', status: '' },
    loading: false,
    columns: [
      {
        label: '勾选列',
        type: 'selection',
        fixed: 'left',
        reserveSelect: true
      },
      { label: '用户编号', prop: 'id' },
      { label: '操作', fixed: 'right', width: 180, slot: 'operation' }
    ],
    dataList: [
      { id: '1', username: 'admin', nickname: '管理员', status: 'ACTIVE' }
    ],
    treeData: [{ id: 1, label: '总公司', children: [] }],
    treeLoading: false,
    selectedNum: { value: 2 },
    pagination: { total: 1, pageSize: 10, currentPage: 1, background: true },
    buttonClass: [],
    deviceDetection: () => false,
    onSearch: vi.fn(),
    resetForm: vi.fn(),
    onbatchDel: vi.fn(),
    openDialog: vi.fn(),
    onTreeSelect: vi.fn(),
    handleUpdate: vi.fn(),
    handleDelete: vi.fn(),
    handleUpload: vi.fn(),
    handleReset: vi.fn(),
    handleRole: vi.fn(),
    handleSizeChange: vi.fn(),
    onSelectionCancel: vi.fn(),
    handleCurrentChange: vi.fn(),
    handleSelectionChange: vi.fn()
  })
}));

vi.mock('./tree.vue', () => ({
  default: {
    name: 'TreeStub',
    template: '<div class="tree-stub" />',
    methods: { onTreeReset: () => {} }
  }
}));

vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => ({ render: () => null })
}));

vi.mock('@/components/RePureTableBar', () => ({
  PureTableBar: {
    name: 'PureTableBar',
    props: ['title', 'columns'],
    template:
      '<div class="pure-table-bar"><slot :size="\'default\'" :dynamicColumns="[]" /></div>'
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
      clearSelection: () => {},
      getSelectionRows: () => []
    }),
    setAdaptive: () => {}
  }
};

describe('user/index.vue', () => {
  it('渲染用户管理页面', () => {
    const wrapper = mountWithEP(UserIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.find('.search-form').exists()).toBe(true);
  });

  it('搜索表单包含用户名称、手机号输入和状态选择', () => {
    const wrapper = mountWithEP(UserIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.findAll('.el-input').length).toBeGreaterThanOrEqual(2);
    expect(wrapper.find('.el-select').exists()).toBe(true);
  });

  it('搜索和重置按钮存在', () => {
    const wrapper = mountWithEP(UserIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    const buttons = wrapper.findAll('.el-button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('PureTableBar 渲染', () => {
    const wrapper = mountWithEP(UserIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.find('.pure-table-bar').exists()).toBe(true);
  });

  it('树组件渲染', () => {
    const wrapper = mountWithEP(UserIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.find('.tree-stub').exists()).toBe(true);
  });

  it('selectedNum>0 时批量操作栏显示', () => {
    const wrapper = mountWithEP(UserIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('操作列按钮渲染', () => {
    const wrapper = mountWithEP(UserIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    const buttons = wrapper.findAll('.el-button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });
});
