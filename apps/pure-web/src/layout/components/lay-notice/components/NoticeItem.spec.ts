// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';

vi.mock('@/layout/hooks/useNav', () => ({
  useNav: () => ({ tooltipEffect: 'light' })
}));

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return { ...actual, deviceDetection: () => false };
});

import NoticeItem from './NoticeItem.vue';

const defaultItem = {
  avatar: 'https://example.com/avatar.svg',
  title: 'Test Title',
  description: 'Test description',
  datetime: '2024-01-01',
  type: '1'
};

describe('NoticeItem', () => {
  it('renders notice container', () => {
    const wrapper = shallowMount(NoticeItem as any, {
      props: { noticeItem: defaultItem, isLast: false },
      global: {
        stubs: {
          ElAvatar: { template: '<div class="el-avatar" />' },
          ElTooltip: { template: '<div><slot /></div>' },
          ElTag: { template: '<span class="el-tag"><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.notice-container').exists()).toBe(true);
  });

  it('renders avatar when provided', () => {
    const wrapper = shallowMount(NoticeItem as any, {
      props: { noticeItem: defaultItem, isLast: false },
      global: {
        stubs: {
          ElAvatar: { template: '<div class="el-avatar" />' },
          ElTooltip: { template: '<div><slot /></div>' },
          ElTag: { template: '<span class="el-tag"><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.el-avatar').exists()).toBe(true);
  });

  it('does not render avatar when empty', () => {
    const noAvatarItem = { ...defaultItem, avatar: '' };
    const wrapper = shallowMount(NoticeItem as any, {
      props: { noticeItem: noAvatarItem, isLast: false },
      global: {
        stubs: {
          ElAvatar: { template: '<div class="el-avatar" />' },
          ElTooltip: { template: '<div><slot /></div>' },
          ElTag: { template: '<span class="el-tag"><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.el-avatar').exists()).toBe(false);
  });

  it('renders title text', () => {
    const wrapper = shallowMount(NoticeItem as any, {
      props: { noticeItem: defaultItem, isLast: false },
      global: {
        stubs: {
          ElAvatar: { template: '<div />' },
          ElTooltip: { template: '<div><slot /></div>' },
          ElTag: { template: '<span><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.notice-title-content').text()).toBe('Test Title');
  });

  it('renders description text', () => {
    const wrapper = shallowMount(NoticeItem as any, {
      props: { noticeItem: defaultItem, isLast: false },
      global: {
        stubs: {
          ElAvatar: { template: '<div />' },
          ElTooltip: { template: '<div><slot /></div>' },
          ElTag: { template: '<span><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.notice-text-description').text()).toBe(
      'Test description'
    );
  });

  it('renders datetime', () => {
    const wrapper = shallowMount(NoticeItem as any, {
      props: { noticeItem: defaultItem, isLast: false },
      global: {
        stubs: {
          ElAvatar: { template: '<div />' },
          ElTooltip: { template: '<div><slot /></div>' },
          ElTag: { template: '<span><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.notice-text-datetime').text()).toBe('2024-01-01');
  });

  it('renders extra tag when present', () => {
    const itemWithExtra = {
      ...defaultItem,
      extra: 'Urgent',
      status: 'danger' as const
    };
    const wrapper = shallowMount(NoticeItem as any, {
      props: { noticeItem: itemWithExtra, isLast: false },
      global: {
        stubs: {
          ElAvatar: { template: '<div />' },
          ElTooltip: { template: '<div><slot /></div>' },
          ElTag: { template: '<span class="el-tag"><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.notice-title-extra').exists()).toBe(true);
    expect(wrapper.find('.el-tag').text()).toBe('Urgent');
  });

  it('does not render extra tag when no extra field', () => {
    const wrapper = shallowMount(NoticeItem as any, {
      props: { noticeItem: defaultItem, isLast: false },
      global: {
        stubs: {
          ElAvatar: { template: '<div />' },
          ElTooltip: { template: '<div><slot /></div>' },
          ElTag: { template: '<span class="el-tag"><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.notice-title-extra').exists()).toBe(false);
  });

  it('adds border-bottom class when not last', () => {
    const wrapper = shallowMount(NoticeItem as any, {
      props: { noticeItem: defaultItem, isLast: false },
      global: {
        stubs: {
          ElAvatar: { template: '<div />' },
          ElTooltip: { template: '<div><slot /></div>' },
          ElTag: { template: '<span><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.notice-container').classes()).toContain('border-b');
  });

  it('no border-bottom class when isLast', () => {
    const wrapper = shallowMount(NoticeItem as any, {
      props: { noticeItem: defaultItem, isLast: true },
      global: {
        stubs: {
          ElAvatar: { template: '<div />' },
          ElTooltip: { template: '<div><slot /></div>' },
          ElTag: { template: '<span><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.notice-container').classes()).not.toContain(
      'border-b'
    );
  });
});
