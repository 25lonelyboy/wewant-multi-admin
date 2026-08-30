// @vitest-environment jsdom
// Canvas 豁免：jsdom 无 2d context，draw 主体不可达（`if (!ctx)` 早退）；
// 本 spec 只测验证码状态流（set/get/watch/expose），不登记覆盖率键。
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { useImageVerify } from './hooks';
import ReImageVerify from './index.vue';

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
  it('渲染 120x40 canvas；点击触发 getImgCode（jsdom 下 domRef 未绑定→早退，无 emit）', async () => {
    const wrapper = mount(ReImageVerify);
    const canvas = wrapper.find('canvas');
    expect(canvas.attributes('width')).toBe('120');
    expect(canvas.attributes('height')).toBe('40');
    await canvas.trigger('click');
    // domRef 未绑定 → draw 早退 → imgCode 不变 → 无 update:code
    expect(wrapper.emitted('update:code')).toBeFalsy();
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
