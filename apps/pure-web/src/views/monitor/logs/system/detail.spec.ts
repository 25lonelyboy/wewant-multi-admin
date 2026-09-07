// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-json-pretty', () => ({
  default: {
    name: 'VueJsonPretty',
    props: ['data'],
    template: '<div class="vue-json-pretty-stub" />'
  }
}));

import SystemLogDetail from './detail.vue';

describe('monitor/logs/system/detail.vue（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(SystemLogDetail, {
      props: {
        data: [
          {
            responseHeaders: {},
            responseBody: {},
            requestHeaders: {},
            requestBody: {}
          }
        ]
      },
      global: {
        stubs: {
          IconifyIconOffline: { template: '<span />' },
          IconifyIconOnline: { template: '<span />' },
          PureDescriptions: { template: '<div />' }
        }
      }
    });
    expect(wrapper.find('*').exists()).toBe(true);
  });
});
