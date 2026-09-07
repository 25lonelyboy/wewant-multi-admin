// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('../utils', () => ({
  useDark: () => ({ isDark: { value: false } }),
  randomGradient: () => 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
}));

vi.mock('./components/charts', () => ({
  ChartBar: {
    name: 'ChartBar',
    props: ['requireData', 'questionData'],
    template: '<div class="chart-bar-stub" />'
  },
  ChartLine: {
    name: 'ChartLine',
    props: ['color', 'data'],
    template: '<div class="chart-line-stub" />'
  },
  ChartRound: {
    name: 'ChartRound',
    template: '<div class="chart-round-stub" />'
  }
}));

vi.mock('./components/table/index.vue', () => ({
  default: {
    name: 'WelcomeTable',
    template: '<div class="welcome-table-stub" />'
  }
}));

vi.mock('@/components/ReCountTo', () => ({
  ReNormalCountTo: {
    name: 'ReNormalCountTo',
    props: ['duration', 'fontSize', 'startVal', 'endVal'],
    template: '<span />'
  }
}));

vi.mock('@/components/ReFlicker', () => ({
  useRenderFlicker: () => ({})
}));

vi.mock('@/components/ReSegmented', () => ({
  default: {
    name: 'Segmented',
    props: ['modelValue', 'options'],
    template: '<div class="segmented-stub" />'
  }
}));

import WelcomeIndex from './index.vue';

describe('WelcomeIndex（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(WelcomeIndex, {
      global: {
        stubs: {
          ReCol: { template: '<div><slot /></div>' },
          IconifyIconOffline: { template: '<span />' }
        }
      }
    });
    expect(wrapper.find('*').exists()).toBe(true);
  });
});
