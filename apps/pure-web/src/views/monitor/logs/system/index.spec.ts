// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// 阻断 i18n → import.meta.glob('*.yaml') 的 YAML 解析链
vi.mock('@/plugins/i18n', () => ({
  $t: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : (m ?? '')),
  transformI18n: (m: any) =>
    typeof m === 'object' ? (m?.zh ?? '') : (m ?? ''),
  i18n: { global: { t: (k: string) => k, locale: { value: 'zh' } } },
  localesConfigs: { zh: {}, en: {} },
  useI18n: vi.fn()
}));

vi.mock('./hook', () => ({
  useRole: () => ({
    form: { module: '', requestTime: '' },
    loading: { value: false },
    columns: [],
    dataList: [],
    pagination: { total: 0, pageSize: 10, currentPage: 1 },
    selectedNum: { value: 0 },
    onSearch: vi.fn(),
    onDetail: vi.fn(),
    clearAll: vi.fn(),
    resetForm: vi.fn(),
    onbatchDel: vi.fn(),
    handleSizeChange: vi.fn(),
    onSelectionCancel: vi.fn(),
    handleCellDblclick: vi.fn(),
    handleCurrentChange: vi.fn(),
    handleSelectionChange: vi.fn()
  })
}));
vi.mock('../../utils', () => ({
  getPickerShortcuts: () => []
}));
vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => () => null
}));

import SystemLog from './index.vue';

describe('monitor/logs/system/index.vue（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(SystemLog, {
      global: {
        stubs: {
          IconifyIconOffline: { template: '<span />' },
          IconifyIconOnline: { template: '<span />' },
          PureTableBar: {
            template: '<div><slot size="default" :dynamicColumns="[]" /></div>'
          },
          pureTable: { template: '<div />' }
        }
      }
    });
    expect(wrapper.find('*').exists()).toBe(true);
  });
});
