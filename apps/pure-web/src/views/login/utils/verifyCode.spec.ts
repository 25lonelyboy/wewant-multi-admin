// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useVerifyCode } from './verifyCode';

describe('login/utils/verifyCode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    const { end } = useVerifyCode();
    end();
    vi.useRealTimers();
  });

  it('初始状态：isDisabled=false, text 为空', () => {
    const { isDisabled, text } = useVerifyCode();
    expect(isDisabled.value).toBe(false);
    expect(text.value).toBe('');
  });

  it('end() 重置状态', () => {
    const { isDisabled, text, end } = useVerifyCode();
    end();
    expect(isDisabled.value).toBe(false);
    expect(text.value).toBe('');
  });

  it('start() 无 formEl 时安全返回', async () => {
    const { start, isDisabled } = useVerifyCode();
    await start(undefined, 'phone');
    expect(isDisabled.value).toBe(false);
  });

  it('start() 有 formEl 时启动倒计时', async () => {
    const mockFormEl = {
      validateField: vi.fn((_prop: any, cb: (valid: boolean) => void) => {
        cb(true);
        return Promise.resolve();
      })
    } as any;
    const { start, isDisabled, text } = useVerifyCode();
    await start(mockFormEl, 'phone', 5);
    expect(isDisabled.value).toBe(true);
    expect(text.value).toBe('5');

    vi.advanceTimersByTime(1000);
    expect(text.value).toBe('4');

    vi.advanceTimersByTime(4000);
    expect(text.value).toBe('0');
    expect(isDisabled.value).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(text.value).toBe('');
    expect(isDisabled.value).toBe(false);
  });

  it('start() 验证失败不启动倒计时', async () => {
    const mockFormEl = {
      validateField: vi.fn((_prop: any, cb: (valid: boolean) => void) => {
        cb(false);
        return Promise.resolve();
      })
    } as any;
    const { start, isDisabled } = useVerifyCode();
    await start(mockFormEl, 'phone');
    expect(isDisabled.value).toBe(false);
  });

  it('timer 返回对象包含所有属性', () => {
    const { timer } = useVerifyCode();
    expect(timer).toBeDefined();
  });
});
