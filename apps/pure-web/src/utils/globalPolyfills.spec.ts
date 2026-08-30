// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import './globalPolyfills';

describe('globalPolyfills', () => {
  it('window.global 未定义时指向 window', async () => {
    vi.resetModules();
    (window as unknown as { global: unknown }).global = undefined;
    await import('./globalPolyfills');
    expect((window as unknown as { global: unknown }).global).toBe(window);
  });

  it('已有 window.global 时保持原值', async () => {
    vi.resetModules();
    const marker = { keep: true };
    (window as unknown as { global: unknown }).global = marker;
    await import('./globalPolyfills');
    expect((window as unknown as { global: unknown }).global).toBe(marker);
  });
});
