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

import SidebarCenterCollapse from './SidebarCenterCollapse.vue';

describe('SidebarCenterCollapse（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(SidebarCenterCollapse, {
      global: {
        directives: { tippy: () => {} },
        components: { IconifyIconOffline: { template: '<span />' } }
      }
    });
    expect(wrapper.find('.center-collapse').exists()).toBe(true);
  });

  it('点击触发 toggleClick 事件', async () => {
    const wrapper = mount(SidebarCenterCollapse, {
      global: {
        directives: { tippy: () => {} },
        components: { IconifyIconOffline: { template: '<span />' } }
      }
    });
    await wrapper.find('.center-collapse').trigger('click');
    expect(wrapper.emitted('toggleClick')).toHaveLength(1);
  });
});
