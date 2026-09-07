// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';

vi.mock('@/layout/hooks/useBoolean', () => ({
  useBoolean: () => ({
    bool: { value: false },
    toggle: vi.fn()
  })
}));

vi.mock('@/plugins/i18n', () => ({
  $t: (k: string) => k,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

import LaySearch from './index.vue';

describe('LaySearch（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = shallowMount(LaySearch, {
      global: {
        stubs: {
          IconifyIconOffline: { template: '<span />' },
          SearchModal: { template: '<div />' }
        }
      }
    });
    expect(wrapper.find('.search-container').exists()).toBe(true);
  });
});
