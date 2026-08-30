// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { inject, provide, ref } from 'vue';

vi.mock('element-plus', async () => {
  const { defineComponent: dc, h: vh } = await import('vue');
  return {
    ElInput: dc({
      props: ['modelValue', 'disabled', 'placeholder'],
      emits: ['update:modelValue'],
      setup(props: any, { slots, emit }: any) {
        return () =>
          vh('div', { class: 'ep-input' }, [
            vh('input', {
              value: props.modelValue ?? '',
              disabled: props.disabled,
              placeholder: props.placeholder,
              onInput: (e: Event) =>
                emit('update:modelValue', (e.target as HTMLInputElement).value)
            }),
            slots.append?.()
          ]);
      }
    }),
    ElPopover: dc({
      emits: ['before-enter', 'after-leave'],
      setup(_props: unknown, { slots, emit }: any) {
        return () =>
          vh('div', { class: 'ep-popover' }, [
            vh(
              'div',
              {
                class: 'ep-popover-ref',
                onClick: () => emit('before-enter')
              },
              slots.reference?.()
            ),
            slots.default?.(),
            vh(
              'button',
              {
                class: 'ep-popover-leave',
                onClick: () => emit('after-leave')
              },
              'leave'
            )
          ]);
      }
    }),
    ElTabs: dc({
      props: ['modelValue'],
      emits: ['update:modelValue', 'tab-click'],
      setup(_props: any, { slots, emit }: any) {
        const activeName = ref(_props.modelValue ?? '');
        provide('epActiveTab', activeName);
        return () =>
          vh('div', { class: 'ep-tabs' }, [
            vh(
              'button',
              {
                class: 'ep-tabs-switch-ri',
                onClick: () => {
                  activeName.value = 'ri:';
                  emit('update:modelValue', 'ri:');
                  emit('tab-click', { props: { name: 'ri:' } });
                }
              },
              'switch-ri'
            ),
            slots.default?.()
          ]);
      }
    }),
    ElTabPane: dc({
      props: ['label', 'name'],
      setup(props: any, { slots }: any) {
        const activeName = inject('epActiveTab', ref(''));
        return () => {
          const isActive = activeName.value === props.name;
          return vh(
            'div',
            { class: 'ep-tab-pane' },
            isActive ? slots.default?.() : []
          );
        };
      }
    }),
    ElScrollbar: dc({
      setup(_props: any, { slots }: any) {
        return () => vh('div', slots.default?.());
      }
    }),
    ElEmpty: dc({
      props: ['description'],
      setup(props: any) {
        return () => vh('div', { class: 'ep-empty' }, props.description);
      }
    }),
    ElPagination: dc({
      props: ['total', 'currentPage', 'pageSize'],
      emits: ['current-change'],
      setup(props: any, { emit }: any) {
        return () =>
          vh(
            'button',
            {
              class: 'ep-pagination-next',
              'data-current': props.currentPage,
              'data-total': props.total,
              onClick: () => emit('current-change', props.currentPage + 1)
            },
            'next'
          );
      }
    }),
    ElButton: dc({
      setup(_props: any, { slots }: any) {
        return () => vh('button', { class: 'ep-button' }, slots.default?.());
      }
    })
  };
});

import IconSelect from './Select.vue';
import { IconJson } from '../data';
import SvgIconStub from '@/test-utils/svg-component-stub';
// vi.mock 已把 element-plus 替换为 mock 模块，此处拿到的是 mock 组件定义
import * as EP from 'element-plus';

let wrapper: VueWrapper;

function mountSelect(initial = ''): VueWrapper {
  const onUpdate = (v: string | undefined) =>
    wrapper?.setProps({ modelValue: v });
  wrapper = mount(IconSelect, {
    props: {
      modelValue: initial,
      'onUpdate:modelValue': onUpdate
    },
    global: {
      components: {
        IconifyIconOffline: SvgIconStub,
        IconifyIconOnline: SvgIconStub,
        // SFC 模板以 kebab-case 使用 el-* 组件，需在此注册 mock 组件
        ElInput: EP.ElInput as any,
        ElPopover: EP.ElPopover as any,
        ElTabs: EP.ElTabs as any,
        ElTabPane: EP.ElTabPane as any,
        ElScrollbar: EP.ElScrollbar as any,
        ElEmpty: EP.ElEmpty as any,
        ElPagination: EP.ElPagination as any,
        ElButton: EP.ElButton as any
      }
    }
  });
  return wrapper;
}

describe('IconSelect', () => {
  it('默认 ep: 集每页 35 个图标，分页 total 为全量', () => {
    const wrapper = mountSelect();
    expect(wrapper.findAll('li.icon-item').length).toBe(35);
    const pager = wrapper.find('.ep-pagination-next');
    expect(pager.attributes('data-total')).toBe(String(IconJson['ep:'].length));
    expect(pager.attributes('data-current')).toBe('1');
  });

  it('点击图标：modelValue 更新为 前缀+图标名', async () => {
    const wrapper = mountSelect();
    await wrapper.find('li.icon-item').trigger('click');
    expect((wrapper.props() as any).modelValue.startsWith('ep:')).toBe(true);
    expect((wrapper.props() as any).modelValue).toBe(
      `ep:${IconJson['ep:'][0]}`
    );
  });

  it('筛选：命中项收窄、页码重置，无命中时空态文案带搜索词', async () => {
    const wrapper = mountSelect();
    const search = wrapper.find('input[placeholder="搜索图标"]');
    await search.setValue('alarm-clock');
    const items = wrapper.findAll('li.icon-item');
    expect(items.length).toBe(1);
    expect(items[0].attributes('title')).toBe('alarm-clock');
    await search.setValue('no-such-icon-xyz');
    expect(wrapper.findAll('li.icon-item').length).toBe(0);
    expect(wrapper.find('.ep-empty').text()).toContain('no-such-icon-xyz');
  });

  it('分页：current-change 后渲染第二页首个图标', async () => {
    const wrapper = mountSelect();
    await wrapper.find('.ep-pagination-next').trigger('click');
    expect(wrapper.find('li.icon-item').attributes('title')).toBe(
      IconJson['ep:'][35]
    );
  });

  it('初始 modelValue 定位页：打开弹层时跳到目标图标所在页', async () => {
    const target = IconJson['ep:'][40];
    const wrapper = mountSelect(`ep:${target}`);
    await wrapper.find('.ep-popover-ref').trigger('click'); // before-enter
    expect(wrapper.find('.ep-pagination-next').attributes('data-current')).toBe(
      '2'
    );
    expect(
      wrapper
        .findAll('li.icon-item')
        .some(li => li.attributes('title') === target)
    ).toBe(true);
  });

  it('初始 modelValue 为空：打开弹层早退不抛错', async () => {
    const wrapper = mountSelect('');
    await wrapper.find('.ep-popover-ref').trigger('click');
    expect(wrapper.find('.ep-pagination-next').attributes('data-current')).toBe(
      '1'
    );
  });

  it('tab 切换到 ri: 集后渲染 ri 图标；离开弹层清空筛选', async () => {
    const wrapper = mountSelect();
    await wrapper.find('.ep-tabs-switch-ri').trigger('click');
    expect(wrapper.find('li.icon-item').attributes('title')).toBe(
      IconJson['ri:'][0]
    );
    const search = wrapper.find('input[placeholder="搜索图标"]');
    await search.setValue('admin');
    await wrapper.find('.ep-popover-leave').trigger('click'); // after-leave
    expect((search.element as HTMLInputElement).value).toBe('');
  });

  it('清空：icon 与 modelValue 双双置空', async () => {
    const wrapper = mountSelect();
    await wrapper.find('li.icon-item').trigger('click');
    await wrapper.find('.ep-button').trigger('click');
    expect((wrapper.props() as any).modelValue).toBe('');
  });
});
