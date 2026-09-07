// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('@/layout/hooks/useNav', () => ({
  useNav: () => ({
    toggle: vi.fn(),
    isFullscreen: { value: false },
    Fullscreen: 'fullscreen-icon',
    ExitFullscreen: 'exit-fullscreen-icon'
  })
}));

import SidebarFullScreen from './SidebarFullScreen.vue';

describe('SidebarFullScreen（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(SidebarFullScreen, {
      global: {
        components: { IconifyIconOffline: { template: '<span />' } }
      }
    });
    expect(wrapper.find('.fullscreen-icon').exists()).toBe(true);
  });
});
