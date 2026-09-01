// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { ref } from 'vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

const storageData: Record<string, any> = {
  configure: {
    hideTabs: false,
    hideFooter: false,
    stretch: false
  },
  layout: { layout: 'vertical' }
};

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return {
    ...actual,
    useGlobal: () => ({
      $storage: storageData,
      $config: { KeepAlive: true }
    }),
    isNumber: (v: any) => typeof v === 'number'
  };
});

vi.mock('@/layout/hooks/useTag', () => ({
  useTags: () => ({
    tagsStyle: ref('chrome')
  })
}));

vi.mock('@/store/modules/permission', () => ({
  usePermissionStoreHook: () => ({ cachePageList: ['*'] })
}));

import LayContent from './index.vue';

describe('LayContent', () => {
  it('renders section element', () => {
    const wrapper = shallowMount(LayContent as any, {
      props: { fixedHeader: true },
      global: {
        stubs: {
          LayFrame: {
            template:
              '<div><slot :Comp="{}" :fullPath="/" :frameInfo="{}" /></div>'
          },
          LayFooter: { template: '<div class="lay-footer" />' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElBacktop: { template: '<div />' },
          'router-view': { template: '<div />' },
          transitionMain: { template: '<div><slot /></div>' }
        }
      }
    });
    expect(wrapper.find('section').exists()).toBe(true);
  });

  it('applies app-main class when fixedHeader is true', () => {
    const wrapper = shallowMount(LayContent as any, {
      props: { fixedHeader: true },
      global: {
        stubs: {
          LayFrame: {
            template:
              '<div><slot :Comp="{}" :fullPath="/" :frameInfo="{}" /></div>'
          },
          LayFooter: { template: '<div />' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElBacktop: { template: '<div />' },
          'router-view': { template: '<div />' },
          transitionMain: { template: '<div />' }
        }
      }
    });
    expect(wrapper.find('section').classes()).toContain('app-main');
  });

  it('applies app-main-nofixed-header class when fixedHeader is false', () => {
    const wrapper = shallowMount(LayContent as any, {
      props: { fixedHeader: false },
      global: {
        stubs: {
          LayFrame: {
            template:
              '<div><slot :Comp="{}" :fullPath="/" :frameInfo="{}" /></div>'
          },
          LayFooter: { template: '<div />' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElBacktop: { template: '<div />' },
          'router-view': { template: '<div />' },
          transitionMain: { template: '<div />' }
        }
      }
    });
    expect(wrapper.find('section').classes()).toContain(
      'app-main-nofixed-header'
    );
  });

  it('getMainWidth returns 100% when stretch is false', () => {
    storageData.configure.stretch = false;
    const wrapper = shallowMount(LayContent as any, {
      props: { fixedHeader: true },
      global: {
        stubs: {
          LayFrame: { template: '<div />' },
          LayFooter: { template: '<div />' },
          ElScrollbar: { template: '<div />' },
          ElBacktop: { template: '<div />' },
          'router-view': { template: '<div />' },
          transitionMain: { template: '<div />' }
        }
      }
    });
    expect((wrapper.vm as any).getMainWidth).toBe('100%');
  });

  it('getMainWidth returns px value when stretch is number', () => {
    storageData.configure.stretch = 1440;
    const wrapper = shallowMount(LayContent as any, {
      props: { fixedHeader: true },
      global: {
        stubs: {
          LayFrame: { template: '<div />' },
          LayFooter: { template: '<div />' },
          ElScrollbar: { template: '<div />' },
          ElBacktop: { template: '<div />' },
          'router-view': { template: '<div />' },
          transitionMain: { template: '<div />' }
        }
      }
    });
    expect((wrapper.vm as any).getMainWidth).toBe('1440px');
  });

  it('isKeepAlive reads from $config', () => {
    const wrapper = shallowMount(LayContent as any, {
      props: { fixedHeader: true },
      global: {
        stubs: {
          LayFrame: { template: '<div />' },
          LayFooter: { template: '<div />' },
          ElScrollbar: { template: '<div />' },
          ElBacktop: { template: '<div />' },
          'router-view': { template: '<div />' },
          transitionMain: { template: '<div />' }
        }
      }
    });
    expect((wrapper.vm as any).isKeepAlive).toBe(true);
  });

  it('hideFooter computed reads from storage', () => {
    storageData.configure.hideFooter = true;
    const wrapper = shallowMount(LayContent as any, {
      props: { fixedHeader: true },
      global: {
        stubs: {
          LayFrame: { template: '<div />' },
          LayFooter: { template: '<div />' },
          ElScrollbar: { template: '<div />' },
          ElBacktop: { template: '<div />' },
          'router-view': { template: '<div />' },
          transitionMain: { template: '<div />' }
        }
      }
    });
    expect((wrapper.vm as any).hideFooter).toBe(true);
  });
});
