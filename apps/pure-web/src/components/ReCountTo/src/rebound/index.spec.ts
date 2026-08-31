// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ReboundCountTo from './index';

const UA_KEY = 'userAgent';
const originalUA = navigator.userAgent;

function setUA(ua: string) {
  Object.defineProperty(navigator, UA_KEY, { value: ua, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  setUA(originalUA);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ReboundCountTo', () => {
  it('渲染 0~9 滚轮（11 个 li）与模糊滤镜，CSS 变量落位', () => {
    const wrapper = mount(ReboundCountTo, {
      props: { i: 5, delay: 1, blur: 3 }
    });
    expect(wrapper.findAll('li').length).toBe(11);
    expect(wrapper.find('feGaussianBlur').attributes('stdDeviation')).toBe(
      '0 3'
    );
    const scrollNum = wrapper.find('.scroll-num').element as HTMLElement;
    expect(scrollNum.style.getPropertyValue('--i')).toBe('5');
    expect(scrollNum.style.getPropertyValue('--delay')).toBe('1');
  });

  it('非 Safari：不注册延时补帧定时器', () => {
    setUA('Mozilla/5.0 (X11; Linux x86_64) jsdom');
    const wrapper = mount(ReboundCountTo, { props: { i: 1 } });
    vi.advanceTimersByTime(2000);
    expect((wrapper.find('ul').element as HTMLElement).style.animation).toBe(
      ''
    );
  });

  it('Safari：onBeforeMount 注册 setTimeout 兼容回调', () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1'
    );
    // 拦截 setTimeout 以捕获回调（string ref 在 JSX 中不绑定，ulRef.value 为 null，回调无法安全执行）
    const spy = vi.spyOn(globalThis, 'setTimeout').mockReturnValue(0 as any);
    mount(ReboundCountTo, { props: { i: 2, delay: 1 } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('Safari：卸载清理定时器不抛错', () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1'
    );
    // 拦截 setTimeout 防止创建真实定时器（timer.value 始终为 null，clearTimeout(null) 为 no-op）
    globalThis.setTimeout = vi.fn(() => 0) as unknown as typeof setTimeout;
    const wrapper = mount(ReboundCountTo, { props: { i: 3, delay: 2 } });
    expect(() => {
      wrapper.unmount();
      vi.advanceTimersByTime(3000);
    }).not.toThrow();
  });
});
