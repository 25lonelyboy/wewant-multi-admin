// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import TagChrome from './TagChrome.vue';

describe('TagChrome', () => {
  it('renders svg element', () => {
    const wrapper = shallowMount(TagChrome);
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('contains defs with symbol geometry', () => {
    const wrapper = shallowMount(TagChrome);
    const symbols = wrapper.findAll('symbol');
    expect(symbols.length).toBeGreaterThanOrEqual(2);
  });

  it('has full-size class on root svg', () => {
    const wrapper = shallowMount(TagChrome);
    const svg = wrapper.find('svg');
    expect(svg.classes()).toContain('size-full');
  });
});
