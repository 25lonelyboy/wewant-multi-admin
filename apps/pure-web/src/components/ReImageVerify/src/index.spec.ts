// @vitest-environment jsdom
// Canvas 豁免：jsdom 无 2d context，draw 绘制主体不可测；本 spec 以 getContext 桩
// 测验证码接线（模板 ref 绑定 → 绘制 → watch → expose），不登记覆盖率键。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { useImageVerify } from './hooks';
import ReImageVerify from './index.vue';

// 最小 2d context 桩：draw 仅消费下列成员（属性赋值 + 路径/文本方法）
const ctx2dStub = {
  fillStyle: '',
  font: '',
  textBaseline: '',
  strokeStyle: '',
  fillRect: vi.fn(),
  save: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  fillText: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn()
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useImageVerify', () => {
  it('domRef 未绑定：getImgCode 早退，setImgCode 可写', () => {
    const host = defineComponent({
      setup() {
        const { imgCode, setImgCode, getImgCode } = useImageVerify();
        getImgCode();
        setImgCode('1234');
        return () => h('i', imgCode.value);
      }
    });
    expect(mount(host).text()).toBe('1234');
  });

  it('domRef 已绑定但无 2d context：onMounted 后 imgCode 为空串', () => {
    const host = defineComponent({
      setup() {
        const { domRef, imgCode } = useImageVerify();
        return () => h('canvas', { ref: domRef, 'data-code': imgCode.value });
      }
    });
    expect(mount(host).find('canvas').attributes('data-code')).toBe('');
  });
});

describe('ReImageVerify', () => {
  it('挂载即绘制并发射 4 位码；点击刷新再发射（2d context 桩）', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx2dStub as unknown as CanvasRenderingContext2D
    );
    const wrapper = mount(ReImageVerify);
    const canvas = wrapper.find('canvas');
    expect(canvas.attributes('width')).toBe('120');
    expect(canvas.attributes('height')).toBe('40');
    // onMounted → getImgCode → draw → watch(imgCode) → update:code
    await nextTick();
    expect(wrapper.emitted('update:code')?.at(-1)?.[0]).toMatch(/^\d{4}$/);
    // 点击刷新：重新绘制并再发射一次新码
    await canvas.trigger('click');
    const codes = wrapper.emitted('update:code') ?? [];
    expect(codes.length).toBe(2);
    expect(codes.at(-1)?.[0]).toMatch(/^\d{4}$/);
  });

  it('props.code 写入：watch → setImgCode → 回吐 update:code', async () => {
    const wrapper = mount(ReImageVerify, { props: { code: '' } });
    await wrapper.setProps({ code: '9527' });
    expect(wrapper.emitted('update:code')?.at(-1)).toEqual(['9527']);
  });

  it('expose getImgCode 可调用', () => {
    const wrapper = mount(ReImageVerify);
    expect(() =>
      (wrapper.vm as { getImgCode: () => void }).getImgCode()
    ).not.toThrow();
  });
});
