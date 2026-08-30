// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';

vi.mock('element-plus', async () => {
  const { defineComponent: dc, h: vh } = await import('vue');
  return {
    ElDrawer: dc({
      props: [
        'modelValue',
        'appendToBody',
        'appendTo',
        'destroyOnClose',
        'lockScroll'
      ],
      emits: ['closed', 'opened', 'openAutoFocus', 'closeAutoFocus'],
      setup(props: any, { slots }: any) {
        return () =>
          !props.modelValue
            ? null
            : vh(
                'div',
                {
                  class: 'ep-drawer',
                  'data-append-to': props.appendTo,
                  'data-destroy': props.destroyOnClose ? '1' : '0',
                  'data-lock': props.lockScroll ? '1' : '0'
                },
                [
                  slots.header?.({
                    close: () => {},
                    titleId: 'tid',
                    titleClass: 'tc'
                  }),
                  slots.default?.(),
                  slots.footer?.()
                ]
              );
      }
    }),
    ElButton: dc({
      props: ['loading'],
      setup(props: any, { slots }: any) {
        return () =>
          vh(
            'button',
            {
              class: 'ep-button',
              'data-loading': props.loading ? '1' : '0'
            },
            slots.default?.()
          );
      }
    }),
    ElPopconfirm: dc({
      emits: ['confirm'],
      setup(_p: any, { slots, emit }: any) {
        return () =>
          vh('div', { class: 'ep-popconfirm' }, [
            slots.reference?.(),
            vh(
              'button',
              { class: 'ep-popconfirm-ok', onClick: () => emit('confirm') },
              'confirm'
            )
          ]);
      }
    })
  };
});

import {
  ReDrawer,
  drawerStore,
  addDrawer,
  closeDrawer,
  updateDrawer,
  closeAllDrawer,
  type DrawerOptions
} from './index';
import * as EP from 'element-plus';

const contentRenderer = () => h('div', { class: 'drawer-content' }, 'body');

function mountDrawer(options: Partial<DrawerOptions>) {
  addDrawer({ contentRenderer, ...options } as DrawerOptions);
  return mount(ReDrawer, {
    global: {
      components: {
        ElDrawer: EP.ElDrawer as any,
        ElButton: EP.ElButton as any,
        ElPopconfirm: EP.ElPopconfirm as any
      }
    }
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  closeAllDrawer();
});

afterEach(() => {
  closeAllDrawer();
  vi.useRealTimers();
});

describe('drawerStore 状态机（index.ts）', () => {
  it('addDrawer 立即入栈且 visible 为 true', () => {
    addDrawer({ title: 't', contentRenderer });
    expect(drawerStore.value).toHaveLength(1);
    expect(drawerStore.value[0].visible).toBe(true);
  });

  it('openDelay：到时后才入栈', () => {
    addDrawer({ title: 't', contentRenderer, openDelay: 300 });
    expect(drawerStore.value).toHaveLength(0);
    vi.advanceTimersByTime(350);
    expect(drawerStore.value).toHaveLength(1);
  });

  it('closeDrawer：visible 置假 + closeCallBack + 默认 200ms 后移除', () => {
    const closeCallBack = vi.fn();
    addDrawer({ title: 't', contentRenderer, closeCallBack });
    const options = drawerStore.value[0];
    closeDrawer(options, 0, { command: 'sure' });
    expect(options.visible).toBe(false);
    expect(closeCallBack).toHaveBeenCalledWith({
      options,
      index: 0,
      args: { command: 'sure' }
    });
    expect(drawerStore.value).toHaveLength(1);
    vi.advanceTimersByTime(250);
    expect(drawerStore.value).toHaveLength(0);
  });

  it('updateDrawer：默认改 title，可指定键与索引', () => {
    addDrawer({ title: 'a', contentRenderer });
    addDrawer({ title: 'b', contentRenderer });
    updateDrawer('新标题');
    updateDrawer(9, 'customKey' as never, 1);
    expect(drawerStore.value[0].title).toBe('新标题');
    expect((drawerStore.value[1] as Recordable).customKey).toBe(9);
  });

  it('closeAllDrawer 清空注册表', () => {
    addDrawer({ contentRenderer });
    closeAllDrawer();
    expect(drawerStore.value).toHaveLength(0);
  });
});

describe('ReDrawer 渲染与页脚交互（index.vue）', () => {
  it('内容渲染 + 默认页脚取消/确定；点确定关闭并到时移除', () => {
    const wrapper = mountDrawer({ title: 't1' });
    expect(wrapper.find('.drawer-content').text()).toBe('body');
    const buttons = wrapper.findAll('.ep-button');
    expect(buttons.map(b => b.text())).toEqual(['取消', '确定']);
    buttons[1].trigger('click');
    expect(drawerStore.value[0].visible).toBe(false);
    vi.advanceTimersByTime(250);
    expect(drawerStore.value).toHaveLength(0);
  });

  it('布尔透传：appendTo/destroyOnClose/lockScroll 落到 el-drawer', () => {
    const wrapper = mountDrawer({
      appendTo: '#app',
      destroyOnClose: true,
      lockScroll: true
    });
    const drawer = wrapper.find('.ep-drawer');
    expect(drawer.attributes('data-append-to')).toBe('#app');
    expect(drawer.attributes('data-destroy')).toBe('1');
    expect(drawer.attributes('data-lock')).toBe('1');
  });

  it('beforeSure 拦截：不调 done 不关；beforeCancel 同理', () => {
    let sureDone: (() => void) | undefined;
    const wrapper = mountDrawer({
      beforeSure: (done: Function) => {
        sureDone = done as () => void;
      }
    });
    wrapper.findAll('.ep-button')[1].trigger('click');
    expect(drawerStore.value[0].visible).toBe(true);
    sureDone?.();
    expect(drawerStore.value[0].visible).toBe(false);
    closeAllDrawer();

    let cancelDone: (() => void) | undefined;
    const wrapper2 = mountDrawer({
      beforeCancel: (done: Function) => {
        cancelDone = done as () => void;
      }
    });
    wrapper2.findAll('.ep-button')[0].trigger('click');
    expect(drawerStore.value[0].visible).toBe(true);
    cancelDone?.();
    expect(drawerStore.value[0].visible).toBe(false);
  });

  it('sureBtnLoading：点确定后按钮转 loading，closeLoading 可关', () => {
    const wrapper = mountDrawer({
      sureBtnLoading: true,
      beforeSure: (_done: Function, { closeLoading }: Recordable) => {
        closeLoading();
      }
    });
    wrapper.findAll('.ep-button')[1].trigger('click');
    expect(wrapper.findAll('.ep-button')[1].attributes('data-loading')).toBe(
      '0'
    );
  });

  it('自定义 footerButtons：回传 drawer/button 参数（drawer 键）', () => {
    const btnClick = vi.fn();
    const wrapper = mountDrawer({
      footerButtons: [{ label: '自定', btnClick } as never]
    });
    const buttons = wrapper.findAll('.ep-button');
    expect(buttons).toHaveLength(1);
    buttons[0].trigger('click');
    expect(btnClick).toHaveBeenCalledWith(
      expect.objectContaining({
        drawer: expect.objectContaining({ index: 0 }),
        button: expect.objectContaining({ index: 0 })
      })
    );
  });

  it('popConfirm（驼峰）：默认确定钮带 popConfirm 时 confirm 后才执行', () => {
    const beforeSure = vi.fn();
    const wrapper = mountDrawer({ popConfirm: { title: '确认?' }, beforeSure });
    expect(wrapper.find('.ep-popconfirm').exists()).toBe(true);
    wrapper.find('.ep-popconfirm-ok').trigger('click');
    expect(beforeSure).toHaveBeenCalledTimes(1);
  });

  it('hideFooter 无页脚；footerRenderer 自定页脚；headerRenderer 自定头部', () => {
    expect(mountDrawer({ hideFooter: true }).find('.ep-button').exists()).toBe(
      false
    );
    closeAllDrawer();
    const wrapper = mountDrawer({
      headerRenderer: () => h('div', { class: 'custom-header' }, 'hd'),
      footerRenderer: () => h('div', { class: 'custom-footer' }, 'ft')
    });
    expect(wrapper.find('.custom-header').text()).toBe('hd');
    expect(wrapper.find('.custom-footer').text()).toBe('ft');
  });

  it('生命周期回调：opened→open、closed→close、双 AutoFocus 透传', () => {
    const open = vi.fn();
    const close = vi.fn();
    const openAutoFocus = vi.fn();
    const closeAutoFocus = vi.fn();
    const wrapper = mountDrawer({ open, close, openAutoFocus, closeAutoFocus });
    const drawer = wrapper.findComponent({ name: 'ElDrawer' });
    drawer.vm.$emit('opened');
    drawer.vm.$emit('openAutoFocus');
    drawer.vm.$emit('closeAutoFocus');
    drawer.vm.$emit('closed');
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }));
    expect(openAutoFocus).toHaveBeenCalledTimes(1);
    expect(closeAutoFocus).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);
  });
});
