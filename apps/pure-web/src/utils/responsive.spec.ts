import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { App } from 'vue';

const storageMocks = vi.hoisted(() => ({ getData: vi.fn(), install: vi.fn() }));
vi.mock('responsive-storage', () => ({ default: storageMocks }));

import { injectResponsiveStorage } from './responsive';
import { setConfig } from '@/config';

const makeApp = (): App => ({ use: vi.fn() }) as unknown as App;

beforeEach(() => {
  vi.clearAllMocks();
  setConfig({});
});

describe('injectResponsiveStorage', () => {
  it('Storage 未命中时以 config 缺省值合并', () => {
    storageMocks.getData.mockReturnValue(undefined);
    const app = makeApp();
    injectResponsiveStorage(app, {
      Locale: 'en',
      Theme: 'dark'
    } as PlatformConfigs);
    const [, options] = vi.mocked(app.use).mock.calls[0];
    const memory = (
      options as {
        memory: { locale: { locale: string }; layout: { theme: string } };
      }
    ).memory;
    expect(memory.locale.locale).toBe('en');
    expect(memory.layout.theme).toBe('dark');
    expect(storageMocks.install).toBeDefined();
  });

  it('Storage 命中时优先缓存值', () => {
    storageMocks.getData.mockImplementation((key: string) =>
      key === 'layout' ? { layout: 'horizontal', theme: 'dark' } : undefined
    );
    const app = makeApp();
    injectResponsiveStorage(app, { Locale: 'zh' } as PlatformConfigs);
    const [, options] = vi.mocked(app.use).mock.calls[0];
    const memory = (options as { memory: { layout: { layout: string } } })
      .memory;
    expect(memory.layout.layout).toBe('horizontal');
  });

  it('MultiTagsCache=true 时并入 tags 键', () => {
    storageMocks.getData.mockReturnValue(undefined);
    const app = makeApp();
    injectResponsiveStorage(app, { MultiTagsCache: true } as PlatformConfigs);
    const [, options] = vi.mocked(app.use).mock.calls[0];
    expect(
      (options as { memory: Record<string, unknown> }).memory
    ).toHaveProperty('tags');
  });
});
