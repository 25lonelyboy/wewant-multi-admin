// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

const mockRoute = vi.hoisted(() => ({
  name: 'FramePage',
  path: '/frame',
  fullPath: '/frame',
  meta: { frameSrc: 'https://example.com' },
  params: {}
}));

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute
}));

import FramePage from './frame.vue';

describe('FramePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.meta = { frameSrc: 'https://example.com' };
    mockRoute.fullPath = '/frame';
    mockRoute.name = 'FramePage';
  });

  it('renders frame container', () => {
    const wrapper = shallowMount(FramePage as any, {
      props: {
        frameInfo: { frameSrc: 'https://example.com', fullPath: '/frame' }
      },
      global: {
        stubs: {
          'v-loading': true
        },
        directives: { loading: () => {} }
      }
    });
    expect(wrapper.find('.frame').exists()).toBe(true);
  });

  it('renders iframe element', () => {
    const wrapper = shallowMount(FramePage as any, {
      props: {
        frameInfo: { frameSrc: 'https://example.com', fullPath: '/frame' }
      },
      global: {
        directives: { loading: () => {} }
      }
    });
    const iframe = wrapper.find('iframe');
    expect(iframe.exists()).toBe(true);
  });

  it('sets iframe src from route meta', () => {
    const wrapper = shallowMount(FramePage as any, {
      props: {
        frameInfo: { frameSrc: 'https://example.com', fullPath: '/frame' }
      },
      global: {
        directives: { loading: () => {} }
      }
    });
    const iframe = wrapper.find('iframe');
    expect(iframe.attributes('src')).toBe('https://example.com');
  });

  it('loading is true initially', () => {
    const wrapper = shallowMount(FramePage as any, {
      props: {
        frameInfo: { frameSrc: 'https://example.com', fullPath: '/frame' }
      },
      global: {
        directives: { loading: () => {} }
      }
    });
    expect((wrapper.vm as any).loading).toBe(true);
  });

  it('frameSrc is empty when no meta.frameSrc', () => {
    mockRoute.meta = {} as any;
    const wrapper = shallowMount(FramePage as any, {
      props: { frameInfo: {} as any },
      global: {
        directives: { loading: () => {} }
      }
    });
    expect((wrapper.vm as any).frameSrc).toBe('');
  });
});
