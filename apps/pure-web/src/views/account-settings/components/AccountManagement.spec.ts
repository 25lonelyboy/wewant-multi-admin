// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('@pureadmin/utils', () => ({
  deviceDetection: () => false
}));
vi.mock('@/utils/message', () => ({ message: vi.fn() }));

import AccountManagement from './AccountManagement.vue';

describe('AccountManagement.vue（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(AccountManagement, {
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
