// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k })
}));

vi.mock('@/layout/hooks/useNav', () => ({
  useNav: () => ({ tooltipEffect: 'light' })
}));

vi.mock('@pureadmin/utils', () => ({
  useGlobal: () => ({ $storage: { layout: { themeColor: 'light' } } })
}));

import SidebarLeftCollapse from './SidebarLeftCollapse.vue';

describe('SidebarLeftCollapse（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(SidebarLeftCollapse, {
      global: {
        directives: { tippy: () => {} },
        components: { IconifyIconOffline: { template: '<span />' } }
      }
    });
    expect(wrapper.find('.left-collapse').exists()).toBe(true);
  });

  it('点击图标触发 toggleClick 事件', async () => {
    const wrapper = mount(SidebarLeftCollapse, {
      global: {
        directives: { tippy: () => {} },
        components: { IconifyIconOffline: { template: '<span />' } }
      }
    });
    // @click 在 IconifyIconOffline 组件上（.left-collapse 内部的 span）
    await wrapper.find('.left-collapse span').trigger('click');
    expect(wrapper.emitted('toggleClick')).toHaveLength(1);
  });
});
