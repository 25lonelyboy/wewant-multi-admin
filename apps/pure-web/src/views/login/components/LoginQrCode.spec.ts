// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k })
}));

vi.mock('@/components/ReQrcode', () => ({
  default: {
    name: 'ReQrcode',
    props: ['text'],
    template: '<div class="qrcode-stub" />'
  }
}));

vi.mock('@/store/modules/user', () => ({
  useUserStoreHook: () => ({ SET_CURRENTPAGE: vi.fn() })
}));

import LoginQrCode from './LoginQrCode.vue';

describe('LoginQrCode（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(LoginQrCode, {
      global: {
        stubs: {
          Motion: { template: '<div><slot /></div>' }
        }
      }
    });
    expect(wrapper.find('*').exists()).toBe(true);
  });
});
