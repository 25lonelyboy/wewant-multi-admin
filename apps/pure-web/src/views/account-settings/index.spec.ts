// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('@/api/user', () => ({
  getMine: vi
    .fn()
    .mockResolvedValue({
      code: 0,
      data: { avatar: '', username: '', nickname: '' }
    })
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ go: vi.fn() })
}));
vi.mock('@/layout/hooks/useDataThemeChange', () => ({
  useDataThemeChange: () => ({ dataThemeChange: vi.fn() })
}));
vi.mock('@pureadmin/utils', () => ({
  useGlobal: () => ({ $storage: { layout: { themeMode: 'light' } } }),
  deviceDetection: () => false
}));
vi.mock('./components/Profile.vue', () => ({
  default: { template: '<div>Profile</div>' }
}));
vi.mock('./components/Preferences.vue', () => ({
  default: { template: '<div>Preferences</div>' }
}));
vi.mock('./components/SecurityLog.vue', () => ({
  default: { template: '<div>SecurityLog</div>' }
}));
vi.mock('./components/AccountManagement.vue', () => ({
  default: { template: '<div>AccountManagement</div>' }
}));
vi.mock('@/components/ReText', () => ({
  ReText: { template: '<span><slot /></span>' }
}));
vi.mock(
  '@/layout/components/lay-sidebar/components/SidebarTopCollapse.vue',
  () => ({
    default: { template: '<div />' }
  })
);

import AccountSettings from './index.vue';

describe('account-settings/index.vue（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(AccountSettings, {
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
