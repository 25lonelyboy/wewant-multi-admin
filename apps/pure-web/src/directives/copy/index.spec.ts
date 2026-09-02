// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@pureadmin/utils', async () => {
  const actual =
    (await vi.importActual<typeof import('@pureadmin/utils')>(
      '@pureadmin/utils'
    )) ?? {};
  return {
    ...actual,
    copyTextToClipboard: vi.fn(() => true)
  };
});
vi.mock('@/utils/message', () => ({
  message: vi.fn(),
  closeAllMessage: vi.fn()
}));

import { copy, type CopyEl } from './index';
import { copyTextToClipboard } from '@pureadmin/utils';
import { message } from '@/utils/message';

const mockCopy = vi.mocked(copyTextToClipboard);
const mockMsg = vi.mocked(message);

const mounted = (copy as any).mounted!;
const updated = (copy as any).updated!;

beforeEach(() => {
  vi.clearAllMocks();
  mockCopy.mockReturnValue(true);
});

describe('v-copy directive', () => {
  it('无 value 抛出错误', () => {
    const el = document.createElement('button');
    expect(() =>
      mounted(el, { value: undefined } as any, null as any, null as any)
    ).toThrow('[Directive: copy]: need value!');
  });

  it('mounted 设置 copyValue 并注册默认 dblclick 事件', () => {
    const el = document.createElement('button');
    mounted(el, { value: 'hello' } as any, null as any, null as any);
    expect((el as unknown as CopyEl).copyValue).toBe('hello');

    el.dispatchEvent(new Event('dblclick'));
    expect(mockCopy).toHaveBeenCalledWith('hello');
    expect(mockMsg).toHaveBeenCalledWith('复制成功', { type: 'success' });
  });

  it('复制失败时显示错误消息', () => {
    mockCopy.mockReturnValue(false);
    const el = document.createElement('button');
    mounted(el, { value: 'text' } as any, null as any, null as any);
    el.dispatchEvent(new Event('dblclick'));
    expect(mockMsg).toHaveBeenCalledWith('复制失败', { type: 'error' });
  });

  it('自定义事件参数（arg=click）', () => {
    const el = document.createElement('button');
    mounted(
      el,
      { value: 'world', arg: 'click' } as any,
      null as any,
      null as any
    );

    el.dispatchEvent(new Event('click'));
    expect(mockCopy).toHaveBeenCalledWith('world');

    mockCopy.mockClear();
    el.dispatchEvent(new Event('dblclick'));
    expect(mockCopy).not.toHaveBeenCalled();
  });

  it('updated 钩子更新 copyValue', () => {
    const el = document.createElement('button') as unknown as CopyEl;
    mounted(el, { value: 'initial' } as any, null as any, null as any);
    expect(el.copyValue).toBe('initial');

    updated(el, { value: 'changed' } as any, null as any, null as any);
    expect(el.copyValue).toBe('changed');
  });
});
