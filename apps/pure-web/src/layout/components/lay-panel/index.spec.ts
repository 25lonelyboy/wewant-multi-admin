// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { emitter } from '@/utils/mitt';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

vi.mock('@/layout/hooks/useDataThemeChange', () => ({
  useDataThemeChange: () => ({ onReset: vi.fn() })
}));

vi.mock('@vueuse/core', () => ({
  onClickOutside: vi.fn()
}));

import LayPanel from './index.vue';

describe('LayPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders panel container', () => {
    const wrapper = shallowMount(LayPanel as any, {
      global: {
        stubs: {
          IconifyIconOffline: { template: '<span />' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElButton: { template: '<button><slot /></button>' }
        },
        directives: { tippy: () => {} }
      }
    });
    expect(wrapper.find('.right-panel').exists()).toBe(true);
  });

  it('panel hidden by default (show=false)', () => {
    const wrapper = shallowMount(LayPanel as any, {
      global: {
        stubs: {
          IconifyIconOffline: { template: '<span />' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElButton: { template: '<button><slot /></button>' }
        },
        directives: { tippy: () => {} }
      }
    });
    expect(wrapper.classes()).not.toContain('show');
  });

  it('show class applied when openPanel event emitted', async () => {
    const wrapper = shallowMount(LayPanel as any, {
      global: {
        stubs: {
          IconifyIconOffline: { template: '<span />' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElButton: { template: '<button><slot /></button>' }
        },
        directives: { tippy: () => {} }
      }
    });
    (emitter as any).emit('openPanel');
    await wrapper.vm.$nextTick();
    expect(wrapper.classes()).toContain('show');
  });

  it('renders slot content', () => {
    const wrapper = shallowMount(LayPanel as any, {
      slots: { default: '<div class="test-slot">content</div>' },
      global: {
        stubs: {
          IconifyIconOffline: { template: '<span />' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElButton: { template: '<button><slot /></button>' }
        },
        directives: { tippy: () => {} }
      }
    });
    expect(wrapper.find('.test-slot').exists()).toBe(true);
  });

  it('unsubscribes openPanel on unmount', () => {
    const offSpy = vi.spyOn(emitter, 'off');
    const wrapper = shallowMount(LayPanel as any, {
      global: {
        stubs: {
          IconifyIconOffline: { template: '<span />' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElButton: { template: '<button><slot /></button>' }
        },
        directives: { tippy: () => {} }
      }
    });
    wrapper.unmount();
    expect(offSpy).toHaveBeenCalledWith('openPanel');
    offSpy.mockRestore();
  });
});
