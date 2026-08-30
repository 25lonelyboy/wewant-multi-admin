// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('@iconify/vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Icon: defineComponent({
      name: 'OnlineIconStub',
      props: { icon: { type: String, default: '' } },
      render(this: { icon: string; $slots?: Record<string, Function> }) {
        return h('i', { class: 'online-stub' }, [
          this.icon,
          this.$slots?.default?.()
        ]);
      }
    })
  };
});

import IconifyIconOnline from './iconifyIconOnline';

describe('IconifyIconOnline', () => {
  it('icon 字符串化渲染并附 outline:none（无 attrs.style 分支）', () => {
    const wrapper = mount(IconifyIconOnline, {
      props: { icon: 'ri:search-line' }
    });
    const stub = wrapper.find('.online-stub');
    expect(stub.text()).toBe('ri:search-line');
    expect(wrapper.attributes('style') ?? stub.attributes('style')).toContain(
      'outline'
    );
  });

  it('attrs 携带 style 时合并 outline:none 与原样式', () => {
    const wrapper = mount(IconifyIconOnline, {
      props: { icon: 'ri:search-line' },
      attrs: { style: { fontSize: '20px' } }
    });
    expect(wrapper.html()).toContain('outline');
  });
});
