// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';

vi.mock('@/config', () => ({
  getConfig: (key?: string) => {
    if (key === 'Title') return 'TestApp';
    return {};
  }
}));

import LayFooter from './index.vue';

describe('LayFooter', () => {
  it('renders footer element', () => {
    const wrapper = shallowMount(LayFooter);
    expect(wrapper.find('footer').exists()).toBe(true);
  });

  it('renders app title from config', () => {
    const wrapper = shallowMount(LayFooter);
    expect(wrapper.find('a').text()).toContain('TestApp');
  });

  it('has correct copyright text', () => {
    const wrapper = shallowMount(LayFooter);
    expect(wrapper.find('footer').text()).toContain('Copyright');
  });

  it('link opens external url', () => {
    const wrapper = shallowMount(LayFooter);
    const link = wrapper.find('a');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('href')).toBe('https://github.com/pure-admin');
  });
});
