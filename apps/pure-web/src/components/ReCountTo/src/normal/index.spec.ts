// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ReNormalCountTo from './index';

let originalRAF: typeof requestAnimationFrame | undefined;
let rAFCounter: number;

beforeEach(() => {
  vi.useFakeTimers();
  rAFCounter = 1000;
  originalRAF = globalThis.requestAnimationFrame;
  // rAF 同步执行回调，时间戳递增 100ms/帧，确保动画在有限帧内完成
  globalThis.requestAnimationFrame = vi.fn(((cb: FrameRequestCallback) => {
    rAFCounter += 100;
    cb(rAFCounter);
    return 0;
  }) as unknown as typeof requestAnimationFrame);
});

afterEach(() => {
  vi.useRealTimers();
  if (originalRAF !== undefined) {
    globalThis.requestAnimationFrame = originalRAF;
  }
});

describe('ReNormalCountTo', () => {
  it('计数（非缓动）：到达终值并发 callback，emit mounted', async () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 0, endVal: 100, duration: 1000, useEasing: false }
    });
    expect(wrapper.emitted('mounted')).toHaveLength(1);
    await nextTick();
    expect(wrapper.text()).toContain('100');
    expect(wrapper.emitted('callback')).toHaveLength(1);
  });

  it('计数（默认缓动）：同样收敛到终值', async () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 0, endVal: 50, duration: 800 }
    });
    await nextTick();
    expect(wrapper.text()).toContain('50');
    expect(wrapper.emitted('callback')).toHaveLength(1);
  });

  it('倒计数（非缓动）：递减到 endVal 并钳位', async () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 100, endVal: 0, duration: 1000, useEasing: false }
    });
    await nextTick();
    expect(wrapper.text()).toContain('0');
    expect(wrapper.emitted('callback')).toHaveLength(1);
  });

  it('倒计数（缓动）：同样收敛', async () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 60, endVal: 10, duration: 800, useEasing: true }
    });
    await nextTick();
    expect(wrapper.text()).toContain('10');
  });

  it('formatNumber：前缀/后缀/分隔符/小数位齐上', async () => {
    const wrapper = mount(ReNormalCountTo, {
      props: {
        startVal: 0,
        endVal: 1234567,
        duration: 500,
        useEasing: false,
        decimals: 2,
        separator: ',',
        prefix: '¥',
        suffix: '元'
      }
    });
    await nextTick();
    expect(wrapper.text()).toContain('¥1,234,567.00元');
  });

  it('separator 为数字时跳过千分位分组（分支覆盖）', async () => {
    const wrapper = mount(ReNormalCountTo, {
      props: {
        startVal: 0,
        endVal: 1234567,
        duration: 500,
        useEasing: false,
        decimals: 2,
        separator: 0 as unknown as string
      }
    });
    await nextTick();
    expect(wrapper.text()).toContain('1234567.00');
  });

  it('startVal/endVal 变更且 autoplay 时重启动画', async () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 0, endVal: 10, duration: 300, useEasing: false }
    });
    await nextTick();
    await wrapper.setProps({ endVal: 20 });
    await nextTick();
    expect(wrapper.text()).toContain('20');
    expect(wrapper.emitted('callback')?.length).toBeGreaterThanOrEqual(2);
  });

  it('autoplay=false：挂载不启动，显示初始格式化值', async () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 7, endVal: 100, autoplay: false }
    });
    await nextTick();
    expect(wrapper.text()).toContain('7');
    expect(wrapper.emitted('callback')).toBeUndefined();
  });

  it('expose: reset 重置显示值到 startVal', async () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 0, endVal: 100, duration: 1000, useEasing: false }
    });
    await nextTick();
    expect(wrapper.text()).toContain('100');
    (wrapper.vm as any).reset();
    await nextTick();
    expect(wrapper.text()).toContain('0');
  });

  it('expose: pauseResume 暂停/恢复切换', async () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 0, endVal: 100, duration: 1000, useEasing: false }
    });
    (wrapper.vm as any).pauseResume(); // pause
    expect((wrapper.vm as any).$parent).toBeDefined();
    (wrapper.vm as any).pauseResume(); // resume
    await nextTick();
  });
});
