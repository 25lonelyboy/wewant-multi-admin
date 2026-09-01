// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import MenuIndex from './index.vue';

vi.mock('./utils/hook', () => ({
  useMenu: () => ({
    form: { title: '' },
    loading: false,
    columns: [],
    dataList: [],
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
    template: '<div class="pure-table-bar-stub" />'
  }
}));

describe('menu/index.vue', () => {
  it('渲染菜单管理页面', () => {
    const wrapper = mountWithEP(MenuIndex);
    expect(wrapper.find('.search-form').exists()).toBe(true);
  });
});
