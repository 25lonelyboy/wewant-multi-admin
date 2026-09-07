// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('./columns', () => ({
  useColumns: () => ({
    loading: { value: false },
    columns: [],
    dataList: [],
    pagination: { currentPage: 1, pageSize: 10, total: 0 },
    Empty: { template: '<div />' },
    onCurrentChange: vi.fn()
  })
}));

vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => () => null
}));

import WelcomeTable from './index.vue';

describe('WelcomeTable（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(WelcomeTable, {
      global: {
        stubs: {
          pureTable: {
            template:
              '<div class="pure-table-stub"><slot name="empty" /><slot name="operation" :row="{ id: 1 }" /></div>'
          }
        }
      }
    });
    expect(wrapper.find('*').exists()).toBe(true);
  });
});
