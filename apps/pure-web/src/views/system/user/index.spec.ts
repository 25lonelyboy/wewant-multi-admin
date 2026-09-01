// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import UserIndex from './index.vue';

vi.mock('./utils/hook', () => ({
  useUser: () => ({
    form: { deptId: '', username: '', phone: '', status: '' },
    loading: false,
    columns: [],
    dataList: [],
    treeData: [],
    treeLoading: false,
    selectedNum: 0,
    pagination: { total: 0, pageSize: 10, currentPage: 1, background: true },
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

describe('user/index.vue', () => {
  it('渲染用户管理页面', () => {
    const wrapper = mountWithEP(UserIndex);
    expect(wrapper.find('.search-form').exists()).toBe(true);
  });
});
