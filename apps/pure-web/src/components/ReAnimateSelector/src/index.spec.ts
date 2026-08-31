// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';

vi.mock('element-plus', async () => {
  const { defineComponent: dc, h: vh } = await import('vue');
  return {
    ElSelect: dc({
      props: ['modelValue', 'placeholder', 'filterMethod'],
      emits: ['clear'],
      setup(props: any, { slots, emit }: any) {
        return () =>
          vh('div', { class: 'ep-select' }, [
            vh('input', {
              class: 'ep-select-filter',
              onInput: (e: Event) =>
                (props.filterMethod as (v: string) => void)(
                  (e.target as HTMLInputElement).value
                )
            }),
            vh(
              'button',
              { class: 'ep-select-clear', onClick: () => emit('clear') },
              'clear'
            ),
            slots.empty?.()
          ]);
      }
    }),
    ElScrollbar: dc({
      setup(_p: any, { slots }: any) {
        return () => vh('div', slots.default?.());
      }
    }),
    ElEmpty: dc({
      props: ['description'],
      setup(props: any) {
        return () => vh('div', { class: 'ep-empty' }, props.description);
      }
    })
  };
});

import ReAnimateSelector from './index.vue';
import { animates } from './animate';
// vi.mock 已把 element-plus 替换为 mock 模块，此处拿到的是 mock 组件定义
import * as EP from 'element-plus';

function mountSelector(initial = ''): VueWrapper {
  const wrapper: VueWrapper = mount(ReAnimateSelector, {
    props: {
      modelValue: initial,
      'onUpdate:modelValue': (v: string | undefined) =>
        wrapper.setProps({ modelValue: v })
    },
    global: {
      components: {
        // SFC 模板以 kebab-case 使用 el-* 组件，需在此注册 mock 组件
        ElSelect: EP.ElSelect as any,
        ElScrollbar: EP.ElScrollbar as any,
        ElEmpty: EP.ElEmpty as any
      }
    }
  });
  return wrapper;
}

describe('ReAnimateSelector', () => {
  it('渲染全量动画列表', () => {
    const wrapper = mountSelector();
    expect(wrapper.findAll('li').length).toBe(animates.length);
  });

  it('点击选中：modelValue 更新为动画名，选中项带主色内联样式', async () => {
    const wrapper = mountSelector();
    await wrapper.find('li').trigger('click');
    expect((wrapper.props() as Record<string, unknown>).modelValue).toBe(
      animates[0]
    );
    expect(wrapper.find('li').attributes('style')).toContain(
      'var(--el-color-primary)'
    );
  });

  it('筛选收窄列表；无命中时空态文案带搜索词', async () => {
    const wrapper = mountSelector();
    await wrapper.find('.ep-select-filter').setValue('rubberBand');
    const items = wrapper.findAll('li');
    expect(items.length).toBe(1);
    expect(items[0].find('h4').text()).toBe('rubberBand');
    await wrapper.find('.ep-select-filter').setValue('no-such-animate');
    expect(wrapper.findAll('li').length).toBe(0);
    expect(wrapper.find('.ep-empty').text()).toContain('no-such-animate');
  });

  it('清空：modelValue 置空', async () => {
    const wrapper = mountSelector(animates[0]);
    await wrapper.find('.ep-select-clear').trigger('click');
    expect((wrapper.props() as Record<string, unknown>).modelValue).toBe('');
  });

  it('mouseenter 翻转预览动画类；再进关闭；mouseleave 复位', async () => {
    const wrapper = mountSelector();
    const li = wrapper.find('li');
    await li.trigger('mouseenter');
    expect(li.find('h4').classes().join(' ')).toContain(
      `animate__${animates[0]} animate__infinite`
    );
    await li.trigger('mouseenter'); // loading→false 分支
    expect(li.find('h4').classes().join(' ')).not.toContain(
      'animate__infinite'
    );
    await li.trigger('mouseleave');
    expect(li.find('h4').classes().join(' ')).not.toContain(
      `animate__${animates[0]}`
    );
  });
});
