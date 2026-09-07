// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k })
}));

import SidebarTopCollapse from './SidebarTopCollapse.vue';

describe('SidebarTopCollapse（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(SidebarTopCollapse, {
      global: {
        components: { IconifyIconOffline: { template: '<span />' } }
      }
    });
    expect(wrapper.find('*').exists()).toBe(true);
  });

  it('点击触发 toggleClick 事件', async () => {
    const wrapper = mount(SidebarTopCollapse, {
      global: {
        components: { IconifyIconOffline: { template: '<span />' } }
      }
    });
    await wrapper.trigger('click');
    expect(wrapper.emitted('toggleClick')).toHaveLength(1);
  });
});
