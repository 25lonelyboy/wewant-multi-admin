// @vitest-environment jsdom
// Canvas 豁免口径：裁剪绘制主体依赖 cropperjs + canvas 2d，jsdom 不可达；
// 本 spec 只覆盖事件接线与展示逻辑，绘制行不入覆盖率门禁（无 thresholds 键）。
// 双向登记：docs/governance/backlog.md「B3 Canvas 绘制豁免回补」。
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';

/* ── mock: @/components/ReCropper（裁剪组件，必须隔离） ── */
const ReCropperStub = vi.hoisted(() => ({
  name: 'ReCropperStub',
  props: ['src', 'circled'],
  emits: ['cropper', 'readied'],
  render: () => h('div', { class: 're-cropper-stub' })
}));
vi.mock('@/components/ReCropper', () => ({ default: ReCropperStub }));

/* ── mock: element-plus（ElPopover / ElImage 透传） ── */
const epMocks = vi.hoisted(() => ({
  ElPopover: {
    props: ['visible'],
    setup(props: any, { slots }: any) {
      return () =>
        h(
          'div',
          { class: 'ep-popover', 'data-visible': props.visible ? '1' : '0' },
          [slots.reference?.(), slots.default?.()]
        );
    }
  },
  ElImage: {
    props: ['src'],
    render(this: any) {
      return h('img', { class: 'ep-image', src: this.src });
    }
  }
}));
vi.mock('element-plus', () => epMocks);

// kebab-case EP 标签（el-popover / el-image）依赖 Vue 运行时 resolveComponent，
// 使用 app.mixin beforeCreate 将 EP mock 组件直接注入共享 appContext.components。
const epMixin = {
  beforeCreate(this: any) {
    const ctx = this?.$?.appContext ?? this?.$.appContext;
    if (ctx?.components) {
      Object.assign(ctx.components, epMocks);
    }
  }
};

import ReCropperPreview from './index.vue';

function mountPreview() {
  return mount(ReCropperPreview, {
    props: { imgSrc: 'a.png' },
    global: {
      directives: { loading: () => {} },
      mixins: [epMixin]
    }
  });
}

describe('ReCropperPreview', () => {
  it('初始：popover 隐藏 + readied 后展示提示文案', async () => {
    const wrapper = mountPreview();
    expect(wrapper.find('.ep-popover').attributes('data-visible')).toBe('0');
    // v-show 保留元素在 DOM 中但隐藏（display: none）
    const tipP = wrapper.find('p.mt-1');
    expect(tipP.exists()).toBe(true);
    expect((tipP.element as HTMLElement).style.display).toBe('none');

    await wrapper.findComponent(ReCropperStub as any).vm.$emit('readied');
    expect(wrapper.find('.ep-popover').attributes('data-visible')).toBe('1');
    expect((tipP.element as HTMLElement).style.display).not.toBe('none');
    expect(wrapper.text()).toContain('温馨提示');
  });

  it('cropper 事件：更新预览图与尺寸信息，并向上透传', async () => {
    const wrapper = mountPreview();
    const payload = {
      base64: 'data:image/png;base64,AAA',
      blob: new Blob(['x']),
      info: { width: '120.6', height: '80.4', size: 2048 }
    };
    await wrapper
      .findComponent(ReCropperStub as any)
      .vm.$emit('cropper', payload);
    expect(wrapper.emitted('cropper')?.[0]).toEqual([payload]);
    expect(wrapper.find('.ep-image').attributes('src')).toBe(payload.base64);
    // parseInt 截断断言真实取整行为
    expect(wrapper.text()).toContain('120 × 80像素');
    // formatBytes 真实计算（2048 字节）
    expect(wrapper.text()).toContain('2 KB');
  });

  it('expose hidePopover：委托 popoverRef.hide', () => {
    const wrapper = mountPreview();
    const hide = vi.fn();
    // 直接写入 ref 的 value（闭包持有同一 ref 对象）
    (wrapper.vm as any).popoverRef = { hide };
    (wrapper.vm as any).hidePopover();
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
