// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listeners: Array<(ev: unknown) => void> = [];
vi.mock('@vueuse/core', () => ({
  useEventListener: vi.fn(
    (_t: unknown, _e: string, cb: (ev: unknown) => void) => {
      listeners.push(cb);
    }
  )
}));

import { addPreventDefault } from './preventDefault';

const makeEvent = (props: Record<string, unknown>) =>
  ({ preventDefault: vi.fn(), ...props }) as unknown as KeyboardEvent;

beforeEach(() => {
  listeners.length = 0;
});

describe('addPreventDefault', () => {
  it('注册 keydown/contextmenu/selectstart/dragstart 四个监听', () => {
    addPreventDefault();
    expect(listeners).toHaveLength(4);
  });

  it('F12 触发 preventDefault', () => {
    addPreventDefault();
    const ev = makeEvent({ key: 'F12' });
    listeners[0](ev);
    expect(vi.mocked(ev.preventDefault)).toHaveBeenCalledTimes(1);
  });

  it('非 F12 按键不阻止', () => {
    addPreventDefault();
    const ev = makeEvent({ key: 'Enter' });
    listeners[0](ev);
    expect(vi.mocked(ev.preventDefault)).not.toHaveBeenCalled();
  });

  it('contextmenu/selectstart 无条件阻止', () => {
    addPreventDefault();
    const ev = makeEvent({});
    listeners[1](ev);
    listeners[2](ev);
    expect(vi.mocked(ev.preventDefault)).toHaveBeenCalledTimes(2);
  });

  it('dragstart 仅 img 元素阻止', () => {
    addPreventDefault();
    const img = new Image();
    const divEv = makeEvent({});
    listeners[3](divEv);
    expect(vi.mocked(divEv.preventDefault)).not.toHaveBeenCalled();
    const imgEv = makeEvent({ target: img });
    listeners[3](imgEv);
    expect(vi.mocked(imgEv.preventDefault)).toHaveBeenCalledTimes(1);
  });
});
