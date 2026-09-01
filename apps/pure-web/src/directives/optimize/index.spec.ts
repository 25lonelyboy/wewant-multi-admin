// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { optimize, type OptimizeOptions } from './index';

const mounted = (optimize as any).mounted!;

describe('v-optimize directive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('无效 arg 抛出错误（仅支持 debounce/throttle）', () => {
    const el = document.createElement('button');
    expect(() =>
      mounted(
        el,
        { value: { event: 'click', fn: () => {} }, arg: 'invalid' } as any,
        null as any,
        null as any
      )
    ).toThrow('only `debounce` and `throttle`');
  });

  it('缺少 event/fn 抛出错误', () => {
    const el = document.createElement('button');
    expect(() =>
      mounted(
        el,
        { value: { event: '', fn: () => {} } as any, arg: undefined } as any,
        null as any,
        null as any
      )
    ).toThrow('`event` and `fn` are required');

    expect(() =>
      mounted(
        el,
        {
          value: { event: 'click', fn: 'not-fn' } as any,
          arg: undefined
        } as any,
        null as any,
        null as any
      )
    ).toThrow('`fn` must be a function');
  });

  it('params 非数组/对象抛出错误', () => {
    const el = document.createElement('button');
    expect(() =>
      mounted(
        el,
        {
          value: { event: 'click', fn: () => {}, params: 42 } as any,
          arg: undefined
        } as any,
        null as any,
        null as any
      )
    ).toThrow('`params` must be an array or object');
  });

  it('debounce 模式（默认）——快速连续触发只执行一次', () => {
    const fn = vi.fn();
    const el = document.createElement('button');
    mounted(
      el,
      { value: { event: 'click', fn } as OptimizeOptions } as any,
      null as any,
      null as any
    );

    el.dispatchEvent(new Event('click'));
    el.dispatchEvent(new Event('click'));
    el.dispatchEvent(new Event('click'));
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throttle 模式——在节流间隔后执行', () => {
    const fn = vi.fn();
    const el = document.createElement('button');
    mounted(
      el,
      {
        value: { event: 'click', fn } as OptimizeOptions,
        arg: 'throttle'
      } as any,
      null as any,
      null as any
    );

    el.dispatchEvent(new Event('click'));
    el.dispatchEvent(new Event('click'));
    el.dispatchEvent(new Event('click'));

    // 节流间隔结束后执行
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalled();
  });

  it('自定义 timeout', () => {
    const fn = vi.fn();
    const el = document.createElement('button');
    mounted(
      el,
      {
        value: { event: 'click', fn, timeout: 500 } as OptimizeOptions,
        arg: undefined
      } as any,
      null as any,
      null as any
    );

    el.dispatchEvent(new Event('click'));
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('带 params——以展开参数调用 fn', () => {
    const fn = vi.fn();
    const el = document.createElement('button');
    mounted(
      el,
      {
        value: {
          event: 'click',
          fn,
          params: ['a', 'b']
        } as OptimizeOptions,
        arg: undefined
      } as any,
      null as any,
      null as any
    );

    el.dispatchEvent(new Event('click'));
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledWith('a', 'b');
  });

  it('对象 params 自动包装为数组', () => {
    const fn = vi.fn();
    const el = document.createElement('button');
    mounted(
      el,
      {
        value: {
          event: 'click',
          fn,
          params: { key: 'val' }
        } as OptimizeOptions,
        arg: undefined
      } as any,
      null as any,
      null as any
    );

    el.dispatchEvent(new Event('click'));
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledWith({ key: 'val' });
  });
});
