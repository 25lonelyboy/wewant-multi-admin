// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import DeptIndex from './index.vue';

vi.mock('./utils/hook', () => ({
  useDept: () => ({
    form: { name: '', status: null },
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

vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => ({ render: () => null })
}));

vi.mock('@/components/RePureTableBar', () => ({
  PureTableBar: {
    name: 'PureTableBar',
    props: ['title', 'columns', 'tableRef'],
    template: '<div class="pure-table-bar-stub" />'
  }
}));

describe('dept/index.vue', () => {
  it('渲染部门管理页面', () => {
    const wrapper = mountWithEP(DeptIndex);
    expect(wrapper.find('.search-form').exists()).toBe(true);
  });
});
