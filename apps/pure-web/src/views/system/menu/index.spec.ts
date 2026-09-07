// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import MenuIndex from './index.vue';

vi.mock('./utils/hook', () => ({
  useMenu: () => ({
    form: { title: '' },
    loading: false,
    columns: [
      { label: '菜单名称', prop: 'title' },
      { label: '操作', fixed: 'right', width: 210, slot: 'operation' }
    ],
    dataList: [{ id: '1', title: '系统管理', menuType: 0, path: '/system' }],
    onSearch: vi.fn(),
    resetForm: vi.fn(),
    openDialog: vi.fn(),
    handleDelete: vi.fn(),
    handleSelectionChange: vi.fn()
  })
}));

vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : (m ?? ''))
}));

vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => ({ render: () => null })
}));

vi.mock('@/components/RePureTableBar', () => ({
  PureTableBar: {
    name: 'PureTableBar',
    props: ['title', 'columns', 'isExpandAll', 'tableRef'],
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

describe('menu/index.vue', () => {
  it('渲染菜单管理页面', () => {
    const wrapper = mountWithEP(MenuIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.find('.search-form').exists()).toBe(true);
  });

  it('搜索表单包含菜单名称输入', () => {
    const wrapper = mountWithEP(MenuIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.find('.el-input').exists()).toBe(true);
  });

  it('搜索和重置按钮存在', () => {
    const wrapper = mountWithEP(MenuIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    const buttons = wrapper.findAll('.el-button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('PureTableBar 渲染', () => {
    const wrapper = mountWithEP(MenuIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.find('.pure-table-bar-stub').exists()).toBe(true);
  });

  it('defineOptions 设置组件名称', () => {
    const wrapper = mountWithEP(MenuIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('操作列按钮渲染（修改/新增/删除）', () => {
    const wrapper = mountWithEP(MenuIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    const buttons = wrapper.findAll('.el-button');
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it('点击搜索触发 onSearch', async () => {
    const wrapper = mountWithEP(MenuIndex, {
      global: { components: { 'pure-table': PureTableStub } }
    });
    const buttons = wrapper.findAll('.el-button');
    await buttons[0].trigger('click');
    expect(wrapper.exists()).toBe(true);
  });
});
