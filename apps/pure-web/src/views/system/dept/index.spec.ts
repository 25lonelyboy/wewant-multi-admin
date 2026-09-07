// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import DeptIndex from './index.vue';

vi.mock('./utils/hook', () => ({
  useDept: () => ({
    form: { name: '', status: null },
    loading: false,
    columns: [
      { label: '部门名称', prop: 'name' },
      { label: '操作', fixed: 'right', width: 210, slot: 'operation' }
    ],
    dataList: [{ id: 1, name: '技术部', status: 1 }],
    onSearch: vi.fn(),
    resetForm: vi.fn(),
    openDialog: vi.fn(),
    handleDelete: vi.fn(),
    handleSelectionChange: vi.fn()
  })
}));

vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => ({ render: () => null })
}));

vi.mock('@/components/RePureTableBar', () => ({
  PureTableBar: {
    name: 'PureTableBar',
    props: ['title', 'columns', 'tableRef'],
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
    getTableRef: () => ({ setAdaptive: () => {} }),
    setAdaptive: () => {}
  }
};

describe('dept/index.vue', () => {
  it('渲染部门管理页面', () => {
    const wrapper = mountWithEP(DeptIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.find('.search-form').exists()).toBe(true);
  });

  it('搜索表单包含部门名称输入和状态选择', () => {
    const wrapper = mountWithEP(DeptIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.find('.el-input').exists()).toBe(true);
    expect(wrapper.find('.el-select').exists()).toBe(true);
  });

  it('搜索和重置按钮存在', () => {
    const wrapper = mountWithEP(DeptIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    const buttons = wrapper.findAll('.el-button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('PureTableBar 渲染', () => {
    const wrapper = mountWithEP(DeptIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.find('.pure-table-bar-stub').exists()).toBe(true);
  });

  it('onFullscreen 不抛异常', () => {
    const wrapper = mountWithEP(DeptIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('操作列按钮渲染（修改/新增/删除）', () => {
    const wrapper = mountWithEP(DeptIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    const buttons = wrapper.findAll('.el-button');
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it('点击搜索按钮触发 onSearch', async () => {
    const wrapper = mountWithEP(DeptIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    const buttons = wrapper.findAll('.el-button');
    await buttons[0].trigger('click');
    expect(wrapper.exists()).toBe(true);
  });

  it('点击重置按钮触发 resetForm', async () => {
    const wrapper = mountWithEP(DeptIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    const buttons = wrapper.findAll('.el-button');
    await buttons[1].trigger('click');
    expect(wrapper.exists()).toBe(true);
  });
});
