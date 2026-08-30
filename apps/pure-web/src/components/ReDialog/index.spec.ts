// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';

vi.mock('element-plus', async () => {
  const { defineComponent: dc, h: vh } = await import('vue');
  return {
    ElDialog: dc({
      props: ['modelValue', 'fullscreen'],
      emits: ['closed', 'opened', 'openAutoFocus', 'closeAutoFocus'],
      setup(props: any, { slots }: any) {
        return () =>
          !props.modelValue
            ? null
            : vh(
                'div',
                {
                  class: 'ep-dialog',
                  'data-fullscreen': props.fullscreen ? '1' : '0'
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
  ReDialog,
  dialogStore,
  addDialog,
  closeDialog,
  updateDialog,
  closeAllDialog,
  type DialogOptions
} from './index';
import SvgIconStub from '@/test-utils/svg-component-stub';
import * as EP from 'element-plus';

const contentRenderer = () => h('div', { class: 'dlg-content' }, 'body');

function mountDialog(options: Partial<DialogOptions>) {
  addDialog({ contentRenderer, ...options } as DialogOptions);
  return mount(ReDialog, {
    global: {
      components: {
        IconifyIconOffline: SvgIconStub,
        IconifyIconOnline: SvgIconStub,
        ElDialog: EP.ElDialog as any,
        ElButton: EP.ElButton as any,
        ElPopconfirm: EP.ElPopconfirm as any
      }
    }
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  closeAllDialog();
});

afterEach(() => {
  closeAllDialog();
  vi.useRealTimers();
});

describe('dialogStore 状态机（index.ts）', () => {
  it('addDialog 立即入栈且 visible 为 true', () => {
    addDialog({ title: 't', contentRenderer });
    expect(dialogStore.value).toHaveLength(1);
    expect(dialogStore.value[0].visible).toBe(true);
  });

  it('openDelay：到时后才入栈', () => {
    addDialog({ title: 't', contentRenderer, openDelay: 300 });
    expect(dialogStore.value).toHaveLength(0);
    vi.advanceTimersByTime(350);
    expect(dialogStore.value).toHaveLength(1);
  });

  it('closeDialog：visible 置假 + closeCallBack + 默认 200ms 后移除', () => {
    const closeCallBack = vi.fn();
    addDialog({ title: 't', contentRenderer, closeCallBack });
    const options = dialogStore.value[0];
    closeDialog(options, 0, { command: 'sure' });
    expect(options.visible).toBe(false);
    expect(closeCallBack).toHaveBeenCalledWith({
      options,
      index: 0,
      args: { command: 'sure' }
    });
    expect(dialogStore.value).toHaveLength(1);
    vi.advanceTimersByTime(250);
    expect(dialogStore.value).toHaveLength(0);
  });

  it('updateDialog：默认改 title，可指定键与索引', () => {
    addDialog({ title: 'a', contentRenderer });
    addDialog({ title: 'b', contentRenderer });
    updateDialog('新标题');
    updateDialog(9, 'customKey' as never, 1);
    expect(dialogStore.value[0].title).toBe('新标题');
    expect((dialogStore.value[1] as Recordable).customKey).toBe(9);
  });

  it('closeAllDialog 清空注册表', () => {
    addDialog({ contentRenderer });
    closeAllDialog();
    expect(dialogStore.value).toHaveLength(0);
  });
});

describe('ReDialog 渲染与页脚交互（index.vue）', () => {
  it('内容渲染 + 默认页脚取消/确定；点确定关闭并到时移除', () => {
    const wrapper = mountDialog({ title: 't1' });
    expect(wrapper.find('.dlg-content').text()).toBe('body');
    const buttons = wrapper.findAll('.ep-button');
    expect(buttons.map(b => b.text())).toEqual(['取消', '确定']);
    buttons[1].trigger('click');
    expect(dialogStore.value[0].visible).toBe(false);
    vi.advanceTimersByTime(250);
    expect(dialogStore.value).toHaveLength(0);
  });

  it('beforeSure 拦截：不调 done 不关；beforeCancel 同理', () => {
    let sureDone: (() => void) | undefined;
    const wrapper = mountDialog({
      beforeSure: (done: Function) => {
        sureDone = done as () => void;
      }
    });
    wrapper.findAll('.ep-button')[1].trigger('click');
    expect(dialogStore.value[0].visible).toBe(true);
    sureDone?.();
    expect(dialogStore.value[0].visible).toBe(false);
    closeAllDialog();

    let cancelDone: (() => void) | undefined;
    const wrapper2 = mountDialog({
      beforeCancel: (done: Function) => {
        cancelDone = done as () => void;
      }
    });
    wrapper2.findAll('.ep-button')[0].trigger('click');
    expect(dialogStore.value[0].visible).toBe(true);
    cancelDone?.();
    expect(dialogStore.value[0].visible).toBe(false);
  });

  it('sureBtnLoading：点确定后按钮转 loading，closeLoading 可关', () => {
    const wrapper = mountDialog({
      sureBtnLoading: true,
      beforeSure: (
        _done: Function,
        {
          closeLoading
        }: { options: DialogOptions; index: number; closeLoading: Function }
      ) => {
        (closeLoading as Function)();
      }
    });
    const sure = wrapper.findAll('.ep-button')[1];
    sure.trigger('click');
    // closeLoading 同步执行后回到非 loading（loading 置位→关闭两分支均命中）
    expect(wrapper.findAll('.ep-button')[1].attributes('data-loading')).toBe(
      '0'
    );
  });

  it('自定义 footerButtons：渲染自定按钮并回传 dialog/button 参数', () => {
    const btnClick = vi.fn();
    const wrapper = mountDialog({
      footerButtons: [{ label: '自定', btnClick } as never]
    });
    const buttons = wrapper.findAll('.ep-button');
    expect(buttons).toHaveLength(1);
    buttons[0].trigger('click');
    expect(btnClick).toHaveBeenCalledWith(
      expect.objectContaining({
        dialog: expect.objectContaining({ index: 0 }),
        button: expect.objectContaining({ index: 0 })
      })
    );
  });

  it('popconfirm 按钮：confirm 后才执行 btnClick', () => {
    const btnClick = vi.fn();
    const wrapper = mountDialog({
      footerButtons: [{ label: '危险', popconfirm: {}, btnClick } as never]
    });
    expect(wrapper.find('.ep-popconfirm').exists()).toBe(true);
    wrapper.find('.ep-popconfirm-ok').trigger('click');
    expect(btnClick).toHaveBeenCalledTimes(1);
  });

  it('hideFooter 无页脚；footerRenderer 自定页脚', () => {
    expect(mountDialog({ hideFooter: true }).find('.ep-button').exists()).toBe(
      false
    );
    closeAllDialog();
    const wrapper = mountDialog({
      footerRenderer: () => h('div', { class: 'custom-footer' }, 'ft')
    });
    expect(wrapper.find('.custom-footer').text()).toBe('ft');
  });

  it('fullscreenIcon：标题栏含切换钮，点击翻转 fullscreen 并回调', async () => {
    const fullscreenCallBack = vi.fn();
    const wrapper = mountDialog({ fullscreenIcon: true, fullscreenCallBack });
    expect(wrapper.text()).toContain(wrapper.find('.flex-bc').text());
    wrapper.find('.pure-dialog-svg').element.parentElement?.click();
    await nextTick();
    expect(fullscreenCallBack).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ fullscreen: true }),
        index: 0
      })
    );
    expect(wrapper.find('.ep-dialog').attributes('data-fullscreen')).toBe('1');
  });

  it('headerRenderer 分支（无 fullscreenIcon 时）', () => {
    const wrapper = mountDialog({
      headerRenderer: () => h('div', { class: 'custom-header' }, 'hd')
    });
    expect(wrapper.find('.custom-header').text()).toBe('hd');
  });

  it('生命周期回调：opened→open、closed→close、双 AutoFocus 透传', () => {
    const open = vi.fn();
    const close = vi.fn();
    const openAutoFocus = vi.fn();
    const closeAutoFocus = vi.fn();
    const wrapper = mountDialog({ open, close, openAutoFocus, closeAutoFocus });
    const dialog = wrapper.findComponent({ name: 'ElDialog' });
    dialog.vm.$emit('opened');
    dialog.vm.$emit('openAutoFocus');
    dialog.vm.$emit('closeAutoFocus');
    dialog.vm.$emit('closed');
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }));
    expect(openAutoFocus).toHaveBeenCalledTimes(1);
    expect(closeAutoFocus).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);
  });
});
