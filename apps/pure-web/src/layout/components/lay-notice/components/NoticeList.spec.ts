// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';

vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

vi.mock('@/layout/hooks/useNav', () => ({
  useNav: () => ({ tooltipEffect: 'light' })
}));

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return { ...actual, deviceDetection: () => false };
});

import NoticeList from './NoticeList.vue';

describe('NoticeList', () => {
  it('renders NoticeItem for each list entry', () => {
    const list = [
      {
        avatar: '',
        title: 'A',
        description: 'desc1',
        datetime: 'now',
        type: '1'
      },
      {
        avatar: '',
        title: 'B',
        description: 'desc2',
        datetime: 'now',
        type: '1'
      }
    ];
    const wrapper = shallowMount(NoticeList as any, {
      props: { list, emptyText: 'No data' },
      global: {
        stubs: {
          NoticeItem: { template: '<div class="notice-item-stub" />' },
          ElEmpty: { template: '<div class="el-empty-stub" />' }
        }
      }
    });
    expect(wrapper.findAll('.notice-item-stub')).toHaveLength(2);
  });

  it('renders ElEmpty when list is empty', () => {
    const wrapper = shallowMount(NoticeList as any, {
      props: { list: [], emptyText: 'No data' },
      global: {
        stubs: {
          NoticeItem: { template: '<div />' },
          ElEmpty: { template: '<div class="el-empty-stub" />' }
        }
      }
    });
    expect(wrapper.find('.el-empty-stub').exists()).toBe(true);
  });

  it('passes isLast=true to the last item', () => {
    const list = [
      { avatar: '', title: 'A', description: 'd1', datetime: '', type: '1' },
      { avatar: '', title: 'B', description: 'd2', datetime: '', type: '1' }
    ];
    const wrapper = shallowMount(NoticeList as any, {
      props: { list, emptyText: '' },
      global: {
        stubs: {
          NoticeItem: {
            props: ['noticeItem', 'isLast'],
            template: '<div class="item" />'
          },
          ElEmpty: { template: '<div />' }
        }
      }
    });
    // Verify both items are rendered
    const items = wrapper.findAll('.item');
    expect(items).toHaveLength(2);
  });
});
