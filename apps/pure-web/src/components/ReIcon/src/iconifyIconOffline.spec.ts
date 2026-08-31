// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

const addIconMock = vi.hoisted(() => vi.fn());
vi.mock('@iconify/vue/dist/offline', async () => {
  const { defineComponent: dc, h: vh } = await import('vue');
  return {
    addIcon: addIconMock,
    Icon: dc({
      name: 'IconifyIconStub',
      props: { icon: { type: String, default: '' } },
      render(this: {
        icon: string;
        $slots?: Record<string, Function>;
        $attrs: { style?: string };
      }) {
        return vh('i', { class: 'iconify-stub', style: this.$attrs?.style }, [
          this.icon,
          this.$slots?.default?.()
        ]);
      }
    })
  };
});

import IconifyIconOffline from './iconifyIconOffline';

describe('IconifyIconOffline', () => {
  it('字符串图标：渲染 iconify Icon 并附 outline:none', () => {
    const wrapper = mount(IconifyIconOffline, {
      props: { icon: 'ep:menu' } as any
    });
    const stub = wrapper.find('.iconify-stub');
    expect(stub.exists()).toBe(true);
    expect(stub.text()).toBe('ep:menu');
    expect(stub.attributes('style')).toContain('outline');
  });

  it('attrs 携带 style 时合并 outline:none 与原样式', () => {
    const wrapper = mount(IconifyIconOffline, {
      props: { icon: 'ep:menu' } as any,
      attrs: { style: { color: 'red' } }
    });
    const style = wrapper.find('.iconify-stub').attributes('style');
    expect(style).toContain('color');
    expect(style).toContain('outline');
  });

  it('对象图标：addIcon(icon, icon) 登记后直接渲染该组件', () => {
    const Inner = defineComponent({
      render: () => h('b', { class: 'obj-icon' }, 'obj')
    });
    const wrapper = mount(IconifyIconOffline, {
      props: { icon: Inner } as any
    });
    expect(addIconMock).toHaveBeenCalledWith(Inner, Inner);
    expect(wrapper.find('.obj-icon').exists()).toBe(true);
  });
});
