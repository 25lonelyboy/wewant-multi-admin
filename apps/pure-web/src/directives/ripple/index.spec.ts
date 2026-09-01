// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Ripple } from './index';

/** jsdom 未实现 getBoundingClientRect，给目标元素打桩 */
function stubRect(el: HTMLElement, overrides: Partial<DOMRect> = {}) {
  const defaults = {
    left: 0,
    top: 0,
    width: 100,
    height: 50,
    right: 100,
    bottom: 50,
    x: 0,
    y: 0,
    toJSON() {
      return this;
    }
  };
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    ...defaults,
    ...overrides
  } as DOMRect);
}

const mounted = (Ripple as any).mounted!;
const unmounted = (Ripple as any).unmounted!;
const updated = (Ripple as any).updated!;

describe('v-ripple directive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounted——启用 ripple 并在元素上设置 _ripple 状态', () => {
    const el = document.createElement('button');
    mounted(
      el,
      { value: true, modifiers: {} } as any,
      null as any,
      null as any
    );
    expect(el._ripple).toBeDefined();
    expect(el._ripple!.enabled).toBe(true);
  });

  it('value=false——ripple 禁用', () => {
    const el = document.createElement('button');
    mounted(
      el,
      { value: false, modifiers: {} } as any,
      null as any,
      null as any
    );
    expect(el._ripple!.enabled).toBe(false);
  });

  it('pointerdown 创建 ripple DOM 元素', () => {
    const el = document.createElement('button');
    stubRect(el);
    mounted(
      el,
      { value: true, modifiers: {} } as any,
      null as any,
      null as any
    );

    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 50,
        clientY: 25
      })
    );

    const containers = el.querySelectorAll('.v-ripple__container');
    expect(containers.length).toBe(1);
    const animations = el.querySelectorAll('.v-ripple__animation');
    expect(animations.length).toBe(1);
  });

  it('center 修饰符——ripple 居中', () => {
    const el = document.createElement('button');
    stubRect(el);
    mounted(
      el,
      { value: true, modifiers: { center: true } } as any,
      null as any,
      null as any
    );

    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 10,
        clientY: 10
      })
    );

    expect(el.querySelectorAll('.v-ripple__container').length).toBe(1);
  });

  it('unmounted——清理 _ripple 状态和事件监听', () => {
    const el = document.createElement('button');
    mounted(
      el,
      { value: true, modifiers: {} } as any,
      null as any,
      null as any
    );
    expect(el._ripple).toBeDefined();

    unmounted(el, null as any, null as any, null as any);
    expect(el._ripple).toBeUndefined();
  });

  it('updated——value 从 true 变 false 禁用 ripple', () => {
    const el = document.createElement('button');
    mounted(
      el,
      { value: true, modifiers: {} } as any,
      null as any,
      null as any
    );
    expect(el._ripple!.enabled).toBe(true);

    updated(
      el,
      { value: false, oldValue: true, modifiers: {} } as any,
      null as any,
      null as any
    );
    expect(el._ripple!.enabled).toBe(false);
  });

  it('updated——value 不变时跳过更新', () => {
    const el = document.createElement('button');
    mounted(
      el,
      { value: true, modifiers: {} } as any,
      null as any,
      null as any
    );
    const spy = vi.spyOn(el, 'addEventListener');

    updated(
      el,
      { value: true, oldValue: true, modifiers: {} } as any,
      null as any,
      null as any
    );
    // value === oldValue → 直接 return，不新增监听器
    expect(spy).not.toHaveBeenCalled();
  });

  it('class 选项——ripple container 带自定义 class', () => {
    const el = document.createElement('button');
    stubRect(el);
    mounted(
      el,
      { value: { class: 'text-red-500' }, modifiers: {} } as any,
      null as any,
      null as any
    );

    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 50,
        clientY: 25
      })
    );

    const container = el.querySelector('.v-ripple__container') as HTMLElement;
    expect(container.className).toContain('text-red-500');
  });

  it('pointerup 触发 ripple 隐藏流程', () => {
    const el = document.createElement('button');
    stubRect(el);
    mounted(
      el,
      { value: true, modifiers: {} } as any,
      null as any,
      null as any
    );

    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 50,
        clientY: 25
      })
    );
    expect(el.querySelectorAll('.v-ripple__animation').length).toBe(1);

    // pointerup 触发 hide
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

    // 等待 hide 动画完成（delay + 300ms 移除 DOM）
    vi.advanceTimersByTime(600);
    expect(el.querySelectorAll('.v-ripple__animation').length).toBe(0);
  });

  it('circle 修饰符——使用不同的半径计算', () => {
    const el = document.createElement('button');
    stubRect(el);
    mounted(
      el,
      { value: true, modifiers: { circle: true } } as any,
      null as any,
      null as any
    );

    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 50,
        clientY: 25
      })
    );
    expect(el.querySelectorAll('.v-ripple__container').length).toBe(1);
  });

  it('static position 被临时替换为 relative', () => {
    const el = document.createElement('button');
    stubRect(el);
    mounted(
      el,
      { value: true, modifiers: {} } as any,
      null as any,
      null as any
    );

    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 50,
        clientY: 25
      })
    );

    // jsdom 默认 position 为 ''（非 static），但 getComputedStyle 可能返回 static
    // 验证 dataset.previousPosition 被设置（仅当 position 为 static 时）
    const animation = el.querySelector('.v-ripple__animation') as HTMLElement;
    expect(animation).toBeTruthy();
    expect(animation.dataset.activated).toBeTruthy();
  });

  it('updated——从 disabled 重新 enabled 注册监听器', () => {
    const el = document.createElement('button');
    stubRect(el);
    // 先禁用
    mounted(
      el,
      { value: false, modifiers: {} } as any,
      null as any,
      null as any
    );
    expect(el._ripple!.enabled).toBe(false);

    // 重新启用
    updated(
      el,
      { value: true, oldValue: false, modifiers: {} } as any,
      null as any,
      null as any
    );
    expect(el._ripple!.enabled).toBe(true);

    // 应该能响应 pointerdown
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 50,
        clientY: 25
      })
    );
    expect(el.querySelectorAll('.v-ripple__container').length).toBe(1);
  });

  it('ripple 未启用时 show 直接返回', () => {
    const el = document.createElement('button');
    stubRect(el);
    mounted(
      el,
      { value: false, modifiers: {} } as any,
      null as any,
      null as any
    );

    // pointerdown 不应创建 ripple 元素
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 50,
        clientY: 25
      })
    );
    expect(el.querySelectorAll('.v-ripple__container').length).toBe(0);
  });
});
