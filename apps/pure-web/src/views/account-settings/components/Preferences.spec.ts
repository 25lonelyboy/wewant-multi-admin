// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('@pureadmin/utils', () => ({
  deviceDetection: () => false
}));
vi.mock('@/utils/message', () => ({ message: vi.fn() }));

import Preferences from './Preferences.vue';

describe('Preferences.vue（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(Preferences, {
      global: {
        stubs: {
          IconifyIconOffline: { template: '<span />' },
          IconifyIconOnline: { template: '<span />' }
        }
      }
    });
    expect(wrapper.find('*').exists()).toBe(true);
  });
});
