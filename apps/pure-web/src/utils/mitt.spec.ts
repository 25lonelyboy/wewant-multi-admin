import { describe, it, expect, vi } from 'vitest';
import { emitter } from './mitt';

describe('emitter', () => {
  it('订阅后广播触发处理器并传递载荷', () => {
    const handler = vi.fn();
    emitter.on('openPanel', handler);
    emitter.emit('openPanel', 'panel-x');
    expect(handler).toHaveBeenCalledWith('panel-x');
    emitter.off('openPanel', handler);
  });

  it('解绑后不再触发', () => {
    const handler = vi.fn();
    emitter.on('tagOnClick', handler);
    emitter.off('tagOnClick', handler);
    emitter.emit('tagOnClick', 't');
    expect(handler).not.toHaveBeenCalled();
  });

  it('多处理器各自接收；未知主题无人接收不抛错', () => {
    const a = vi.fn();
    const b = vi.fn();
    emitter.on('logoChange', a);
    emitter.on('logoChange', b);
    emitter.emit('logoChange', true);
    expect(a).toHaveBeenCalledWith(true);
    expect(b).toHaveBeenCalledWith(true);
    expect(() => emitter.emit('tagViewsChange', 'x')).not.toThrow();
    emitter.off('logoChange', a);
    emitter.off('logoChange', b);
  });
});
