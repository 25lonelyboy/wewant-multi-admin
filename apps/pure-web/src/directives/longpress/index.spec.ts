// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { longpress } from './index';

const mounted = (longpress as any).mounted!;

describe('v-longpress directive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('非函数 value 抛出错误', () => {
    const el = document.createElement('button');
    expect(() =>
      mounted(el, { value: undefined } as any, null as any, null as any)
    ).toThrow('[Directive: longpress]: need callback');
    expect(() =>
      mounted(el, { value: 'not-a-fn' } as any, null as any, null as any)
    ).toThrow('callback must be a function');
  });

  it('默认 500ms 后触发回调', () => {
    const cb = vi.fn();
    const el = document.createElement('button');
    mounted(el, { value: cb } as any, null as any, null as any);

    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('自定义延迟时间（arg=1000）', () => {
    const cb = vi.fn();
    const el = document.createElement('button');
    mounted(el, { value: cb, arg: '1000' } as any, null as any, null as any);

    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(999);
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('pointerup 取消定时器', () => {
    const cb = vi.fn();
    const el = document.createElement('button');
    mounted(el, { value: cb } as any, null as any, null as any);

    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(300);
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
  });

  it('pointerleave 取消定时器', () => {
    const cb = vi.fn();
    const el = document.createElement('button');
    mounted(el, { value: cb } as any, null as any, null as any);

    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(300);
    el.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
  });

  it('间隔模式（arg=500:200）——首次延迟后重复触发', () => {
    const cb = vi.fn();
    const el = document.createElement('button');
    mounted(el, { value: cb, arg: '500:200' } as any, null as any, null as any);

    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(200);
    expect(cb).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(200);
    expect(cb).toHaveBeenCalledTimes(3);

    // pointerup 停止间隔
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    vi.advanceTimersByTime(600);
    expect(cb).toHaveBeenCalledTimes(3);
  });
});
