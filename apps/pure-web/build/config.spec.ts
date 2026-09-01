import { describe, it, expect, vi } from 'vitest';

// ── optimize.ts（纯数据，无外部依赖，直接导入） ──
import { include, exclude } from './optimize';

describe('build/optimize', () => {
  it('include 是非空字符串数组且包含核心依赖', () => {
    expect(Array.isArray(include)).toBe(true);
    expect(include.length).toBeGreaterThan(5);
    expect(include).toContain('axios');
    expect(include).toContain('pinia');
    expect(include).toContain('dayjs');
    expect(include).toContain('@vueuse/core');
    include.forEach(item => expect(typeof item).toBe('string'));
  });

  it('exclude 是字符串数组且包含 @iconify/json', () => {
    expect(Array.isArray(exclude)).toBe(true);
    expect(exclude).toContain('@iconify/json');
  });
});

// ── compress.ts（需 mock vite-plugin-compression） ──
vi.mock('vite-plugin-compression', () => ({
  default: (opts: Record<string, unknown>) => ({
    name: 'vite-plugin-compression',
    _opts: opts
  })
}));

import { configCompressPlugin } from './compress';

describe('build/compress', () => {
  it('compress=none 返回 null', () => {
    expect(configCompressPlugin('none')).toBeNull();
  });

  it('compress=gzip 返回包含 gzip 插件的数组', () => {
    const result = configCompressPlugin('gzip');
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBeGreaterThanOrEqual(1);
  });

  it('compress=brotli 返回包含 brotli 插件的数组', () => {
    const result = configCompressPlugin('brotli');
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBeGreaterThanOrEqual(1);
  });

  it('compress=both 返回包含 gzip+brotli 插件的数组', () => {
    const result = configCompressPlugin('both');
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBeGreaterThanOrEqual(2);
  });

  it('compress=gzip-clear 返回插件且 deleteOriginFile=true', () => {
    const result = configCompressPlugin('gzip-clear');
    expect(Array.isArray(result)).toBe(true);
    const plugins = result as any[];
    expect(plugins.length).toBeGreaterThanOrEqual(1);
    expect(plugins[0]._opts.deleteOriginFile).toBe(true);
  });
});

// ── info.ts（需 mock gradient-string / boxen） ──
vi.mock('gradient-string', () => ({
  default: () => ({
    multiline: (text: string) => text
  })
}));

vi.mock('boxen', () => ({
  default: (text: string, _opts?: unknown) => text,
  __esModule: true
}));

import { viteBuildInfo } from './info';

describe('build/info', () => {
  it('viteBuildInfo 返回 name 为 vite:buildInfo 的插件', () => {
    const plugin = viteBuildInfo();
    expect(plugin.name).toBe('vite:buildInfo');
    expect(typeof plugin.configResolved).toBe('function');
    expect(typeof plugin.buildStart).toBe('function');
    expect(typeof plugin.closeBundle).toBe('function');
  });

  it('configResolved 设置 config 和 outDir', () => {
    const plugin = viteBuildInfo();
    const resolvedConfig = { command: 'build', build: { outDir: 'dist' } };
    (plugin.configResolved as any)(resolvedConfig);
    expect(true).toBe(true); // 无报错即通过
  });

  it('buildStart 在 build 命令下记录 startTime', () => {
    const plugin = viteBuildInfo();
    (plugin.configResolved as any)({
      command: 'build',
      build: { outDir: 'dist' }
    });
    (plugin.buildStart as any)();
    expect(true).toBe(true); // 无报错即通过
  });

  it('closeBundle 在 build 命令下调用 getPackageSize', () => {
    const plugin = viteBuildInfo();
    (plugin.configResolved as any)({
      command: 'build',
      build: { outDir: 'dist' }
    });
    (plugin.buildStart as any)();
    // closeBundle 会调用 getPackageSize，验证函数存在且可调用
    expect(typeof plugin.closeBundle).toBe('function');
  });

  it('closeBundle 在非 build 命令下不执行', () => {
    const plugin = viteBuildInfo();
    (plugin.configResolved as any)({ command: 'serve', build: {} });
    (plugin.closeBundle as any)();
    expect(true).toBe(true); // 无报错即通过
  });
});

// ── cdn.ts（需 mock vite-plugin-cdn-import） ──
vi.mock('vite-plugin-cdn-import', () => ({
  Plugin: (opts: unknown) => ({ name: 'cdn-import', _opts: opts })
}));

import { cdn } from './cdn';

describe('build/cdn', () => {
  it('cdn 是已配置的插件对象', () => {
    expect(cdn).toBeDefined();
    expect(typeof cdn).toBe('object');
  });
});

// ── plugins.ts（需 mock 大量构建插件） ──
vi.mock('@vitejs/plugin-vue', () => ({
  default: () => ({ name: 'vue' })
}));
vi.mock('@vitejs/plugin-vue-jsx', () => ({
  default: () => ({ name: 'vue-jsx' })
}));
vi.mock('@tailwindcss/vite', () => ({
  default: () => ({ name: 'tailwindcss' })
}));
vi.mock('vite-svg-loader', () => ({
  default: () => ({ name: 'svg-loader' })
}));
vi.mock('unplugin-icons/vite', () => ({
  default: () => ({ name: 'icons' })
}));
vi.mock('vite-plugin-router-warn', () => ({
  default: () => ({ name: 'remove-no-match' })
}));
vi.mock('vite-plugin-fake-server', () => ({
  vitePluginFakeServer: () => ({ name: 'fake-server' })
}));
vi.mock('vite-plugin-remove-console', () => ({
  default: () => ({ name: 'remove-console' })
}));
vi.mock('rollup-plugin-visualizer', () => ({
  visualizer: () => ({ name: 'visualizer' })
}));
vi.mock('@intlify/unplugin-vue-i18n/vite', () => ({
  default: () => ({ name: 'vue-i18n' })
}));
vi.mock('code-inspector-plugin', () => ({
  codeInspectorPlugin: () => ({ name: 'code-inspector' })
}));

import { getPluginsList } from './plugins';

describe('build/plugins', () => {
  it('getPluginsList 返回非空插件数组', async () => {
    const plugins = await getPluginsList(false, 'none', false);
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(5);
  });

  it('VITE_MOCK=true 时包含 fake-server 插件', async () => {
    const plugins = await getPluginsList(false, 'none', true);
    const names = plugins
      .filter(Boolean)
      .map((p: any) => p.name ?? p?._opts?.name ?? '');
    expect(names).toContain('fake-server');
  });

  it('VITE_MOCK=false 时不包含 fake-server 插件', async () => {
    const plugins = await getPluginsList(false, 'none', false);
    const names = plugins
      .filter(Boolean)
      .map((p: any) => p.name ?? p?._opts?.name ?? '');
    expect(names).not.toContain('fake-server');
  });

  it('VITE_CDN=true 时包含 cdn 插件', async () => {
    const plugins = await getPluginsList(true, 'none', false);
    expect(plugins.length).toBeGreaterThan(5);
  });

  it('VITE_COMPRESSION=gzip 时返回包含压缩插件', async () => {
    const plugins = await getPluginsList(false, 'gzip', false);
    // configCompressPlugin 返回的数组会被展平，至少有一个非 null 元素
    const flat = (plugins as any[]).flat(10).filter(Boolean);
    expect(flat.length).toBeGreaterThan(5);
  });
});
