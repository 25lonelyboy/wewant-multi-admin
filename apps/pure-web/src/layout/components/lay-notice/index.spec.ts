// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

vi.mock('./data', () => ({
  noticesData: [
    { key: '1', name: 'Notify', list: [], emptyText: 'No notify' },
    {
      key: '2',
      name: 'Message',
      list: [
        {
          avatar: '',
          title: 'Msg1',
          description: 'd1',
          datetime: 'now',
          type: '2'
        }
      ],
      emptyText: 'No message'
    }
  ]
}));

vi.mock('@/layout/hooks/useNav', () => ({
  useNav: () => ({ tooltipEffect: 'light' })
}));

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return { ...actual, deviceDetection: () => false };
});

import LayNotice from './index.vue';

describe('LayNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dropdown badge', () => {
    const wrapper = shallowMount(LayNotice as any, {
      global: {
        stubs: {
          ElDropdown: {
            template:
              '<div class="el-dropdown"><slot /><slot name="dropdown" /></div>'
          },
          ElDropdownMenu: { template: '<div><slot /></div>' },
          ElTabs: { template: '<div class="el-tabs"><slot /></div>' },
          ElTabPane: { template: '<div><slot /></div>' },
          ElBadge: { template: '<div><slot /></div>' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElEmpty: { template: '<div />' },
          ElButton: { template: '<button><slot /></button>' },
          IconifyIconOffline: { template: '<span />' },
          NoticeList: { template: '<div />' }
        }
      }
    });
    expect(wrapper.find('.dropdown-badge').exists()).toBe(true);
  });

  it('computes hasAnyNoticeData true when notices have items', () => {
    const wrapper = shallowMount(LayNotice as any, {
      global: {
        stubs: {
          ElDropdown: {
            template: '<div><slot /><slot name="dropdown" /></div>'
          },
          ElDropdownMenu: { template: '<div><slot /></div>' },
          ElTabs: { template: '<div><slot /></div>' },
          ElTabPane: { template: '<div><slot /></div>' },
          ElBadge: { template: '<div><slot /></div>' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElEmpty: { template: '<div />' },
          ElButton: { template: '<button><slot /></button>' },
          IconifyIconOffline: { template: '<span />' },
          NoticeList: { template: '<div />' }
        }
      }
    });
    expect((wrapper.vm as any).hasAnyNoticeData).toBe(true);
  });

  it('onMarkAsRead clears current tab list', () => {
    const wrapper = shallowMount(LayNotice as any, {
      global: {
        stubs: {
          ElDropdown: {
            template: '<div><slot /><slot name="dropdown" /></div>'
          },
          ElDropdownMenu: { template: '<div><slot /></div>' },
          ElTabs: { template: '<div><slot /></div>' },
          ElTabPane: { template: '<div><slot /></div>' },
          ElBadge: { template: '<div><slot /></div>' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElEmpty: { template: '<div />' },
          ElButton: { template: '<button><slot /></button>' },
          IconifyIconOffline: { template: '<span />' },
          NoticeList: { template: '<div />' }
        }
      }
    });
    // activeKey defaults to '1' (first tab), which has empty list
    // Switch to tab '2' which has items
    (wrapper.vm as any).activeKey = '2';
    (wrapper.vm as any).onMarkAsRead();
    const notices = (wrapper.vm as any).notices;
    const msgTab = notices.find((n: any) => n.key === '2');
    expect(msgTab.list).toHaveLength(0);
  });

  it('currentNoticeHasData is false when active tab has empty list', () => {
    const wrapper = shallowMount(LayNotice as any, {
      global: {
        stubs: {
          ElDropdown: {
            template: '<div><slot /><slot name="dropdown" /></div>'
          },
          ElDropdownMenu: { template: '<div><slot /></div>' },
          ElTabs: { template: '<div><slot /></div>' },
          ElTabPane: { template: '<div><slot /></div>' },
          ElBadge: { template: '<div><slot /></div>' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElEmpty: { template: '<div />' },
          ElButton: { template: '<button><slot /></button>' },
          IconifyIconOffline: { template: '<span />' },
          NoticeList: { template: '<div />' }
        }
      }
    });
    // activeKey defaults to '1' which has empty list
    expect((wrapper.vm as any).currentNoticeHasData).toBeFalsy();
  });
});
