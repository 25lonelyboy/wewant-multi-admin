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
    form: { username: '' },
    loading: { value: false },
    columns: [],
    dataList: [],
    pagination: { total: 0, pageSize: 10, currentPage: 1 },
    onSearch: vi.fn(),
    resetForm: vi.fn(),
    handleOffline: vi.fn(),
    handleSizeChange: vi.fn(),
    handleCurrentChange: vi.fn(),
    handleSelectionChange: vi.fn()
  })
}));
vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => () => null
}));

import OnlineUser from './index.vue';

describe('monitor/online/index.vue（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(OnlineUser, {
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
