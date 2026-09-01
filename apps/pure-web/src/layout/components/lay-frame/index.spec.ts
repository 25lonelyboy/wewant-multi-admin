// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';

vi.mock('@/config', () => ({
  getConfig: () => ({ KeepAlive: true })
}));

const mapStore = vi.hoisted(() => new Map<string, any>());
vi.mock('@/layout/hooks/useMultiFrame', () => ({
  useMultiFrame: () => ({
    setMap: vi.fn((k: string, v: any) => mapStore.set(k, v)),
    getMap: () => [...mapStore.entries()],
    MAP: mapStore,
    delMap: vi.fn((k: string) => mapStore.delete(k))
  })
}));

const multiTagsValue = vi.hoisted(() => []);
vi.mock('@/store/modules/multiTags', () => ({
  useMultiTagsStoreHook: () => ({ multiTags: multiTagsValue })
}));

import LayFrame from './index.vue';

describe('LayFrame', () => {
  it('renders without crash', () => {
    const wrapper = shallowMount(LayFrame as any, {
      props: {
        currRoute: { fullPath: '/test', meta: {} },
        currComp: { template: '<div />' }
      }
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders slot for non-keep route', () => {
    const wrapper = shallowMount(LayFrame as any, {
      props: {
        currRoute: { fullPath: '/test', meta: {} },
        currComp: { template: '<div class="test-comp" />' }
      },
      slots: {
        default: '<div class="slot-content">content</div>'
      }
    });
    expect(wrapper.find('.slot-content').exists()).toBe(true);
  });

  it('keep computed is falsy when no frameSrc', () => {
    const wrapper = shallowMount(LayFrame as any, {
      props: {
        currRoute: { fullPath: '/test', meta: {} },
        currComp: { template: '<div />' }
      }
    });
    expect((wrapper.vm as any).keep).toBeFalsy();
  });

  it('normalComp returns currComp when keep is false', () => {
    const comp = { template: '<div />' };
    const wrapper = shallowMount(LayFrame as any, {
      props: {
        currRoute: { fullPath: '/test', meta: {} },
        currComp: comp
      }
    });
    expect((wrapper.vm as any).normalComp).toBeTruthy();
  });
});
