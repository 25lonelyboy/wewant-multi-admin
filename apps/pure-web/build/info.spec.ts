// build/info.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { viteBuildInfo } from './info';
import type { ResolvedConfig } from 'vite';

// Mock ./utils：让 getPackageSize 同步调用 callback，避免真实 fs 读取不存在的 dist
vi.mock('./utils', async () => {
  const actual = await vi.importActual<typeof import('./utils')>('./utils');
  return {
    ...actual,
    getPackageSize: vi.fn(
      (opts: { callback: (size: string | number) => void }) => {
        opts.callback('1.00 KB');
      }
    )
  };
});

const makeConfig = (command: 'build' | 'serve', outDir?: string) =>
  ({ command, build: { outDir } }) as unknown as ResolvedConfig;

describe('viteBuildInfo', () => {
  it('返回名为 vite:buildInfo 的插件', () => {
    const plugin = viteBuildInfo();
    expect(plugin.name).toBe('vite:buildInfo');
  });

  it('configResolved 记录 config 与 outDir（缺省 dist）', () => {
    const plugin = viteBuildInfo();
    expect(() =>
      plugin.configResolved(makeConfig('build', undefined))
    ).not.toThrow();
  });

  it('configResolved 记录自定义 outDir', () => {
    const plugin = viteBuildInfo();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    plugin.configResolved(makeConfig('build', 'custom-dist'));
    plugin.closeBundle();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('serve 命令 buildStart 不记录 startTime（不抛异常即通过）', () => {
    const plugin = viteBuildInfo();
    plugin.configResolved(makeConfig('serve'));
    expect(() => plugin.buildStart()).not.toThrow();
  });

  it('build 命令 closeBundle 走耗时输出分支（console.log 被调用）', () => {
    const plugin = viteBuildInfo();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    plugin.configResolved(makeConfig('build', 'dist'));
    plugin.buildStart();
    plugin.closeBundle();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('serve 命令 closeBundle 早退（不调用 console.log）', () => {
    const plugin = viteBuildInfo();
    plugin.configResolved(makeConfig('serve'));
    plugin.buildStart();
    // spy 必须在 buildStart 之后设置——buildStart 无条件输出 welcomeMessage
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    plugin.closeBundle();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
