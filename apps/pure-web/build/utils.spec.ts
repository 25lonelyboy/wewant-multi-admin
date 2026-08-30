// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import { root, pathResolve, alias, __APP_INFO__, wrapperEnv } from './utils';

vi.mock('node:fs', () => ({
  readdir: vi.fn(),
  stat: vi.fn()
}));

import { readdir, stat } from 'node:fs';
import { getPackageSize } from './utils';

describe('wrapperEnv', () => {
  afterEach(() => {
    delete process.env.VITE_PORT;
    delete process.env.VITE_MOCK;
    delete process.env.VITE_CDN;
    delete process.env.VITE_PUBLIC_PATH;
    delete process.env.VITE_HIDE_HOME;
    delete process.env.VITE_ROUTER_HISTORY;
    delete process.env.VITE_COMPRESSION;
  });

  it('空输入返回全部默认值', () => {
    const env = wrapperEnv({});
    expect(env.VITE_PORT).toBe(8848);
    expect(env.VITE_PUBLIC_PATH).toBe('');
    expect(env.VITE_ROUTER_HISTORY).toBe('');
    expect(env.VITE_CDN).toBe(false);
    expect(env.VITE_HIDE_HOME).toBe('false');
    expect(env.VITE_COMPRESSION).toBe('none');
    expect(env.VITE_MOCK).toBe(false);
  });

  it('"true"/"false" 字符串转布尔', () => {
    const env = wrapperEnv({ VITE_MOCK: 'true', VITE_CDN: 'false' });
    expect(env.VITE_MOCK).toBe(true);
    expect(env.VITE_CDN).toBe(false);
  });

  it('\\n 字面量转换为真实换行', () => {
    const env = wrapperEnv({ VITE_ROUTER_HISTORY: 'a\\nb' });
    expect(env.VITE_ROUTER_HISTORY).toBe('a\nb');
  });

  it('VITE_PORT 转数字', () => {
    const env = wrapperEnv({ VITE_PORT: '9000' });
    expect(env.VITE_PORT).toBe(9000);
  });

  it('字符串值同步写入 process.env', () => {
    wrapperEnv({ VITE_PUBLIC_PATH: '/admin/' });
    expect(process.env.VITE_PUBLIC_PATH).toBe('/admin/');
  });

  it('布尔与数字值不写入 process.env（仅字符串与对象写入）', () => {
    wrapperEnv({ VITE_MOCK: 'true', VITE_PORT: '9000' });
    expect(process.env.VITE_MOCK).toBeUndefined();
    expect(process.env.VITE_PORT).toBeUndefined();
  });
});

describe('root / pathResolve / alias / __APP_INFO__', () => {
  it('root 即 process.cwd()', () => {
    expect(root).toBe(process.cwd());
  });

  it('pathResolve 默认解析 build 目录绝对路径', () => {
    expect(pathResolve()).toMatch(/[\\/]build$/);
  });

  it('pathResolve 目录片段在 build 外时返回拼接绝对路径', () => {
    expect(pathResolve('../src')).toMatch(/[\\/]src$/);
  });

  it('pathResolve 目录片段在 build 内时短路返回调用者自身路径', () => {
    expect(pathResolve('build')).toMatch(/[\\/]build[\\/]utils\.ts$/);
  });

  it('alias 映射 @ 到 src、@build 到 build', () => {
    expect(alias['@']).toMatch(/[\\/]src$/);
    expect(alias['@build']).toMatch(/[\\/]build$/);
  });

  it('__APP_INFO__ 携带包信息与构建时间格式', () => {
    expect(__APP_INFO__.pkg.name).toBe('@multi-admin/pure-web');
    expect(__APP_INFO__.lastBuildTime).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
    );
  });
});

describe('getPackageSize', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('单层目录：文件大小求和后回调格式化结果', () => {
    const callback = vi.fn();
    vi.mocked(readdir).mockImplementation(((_p: any, cb: any) =>
      cb(null, ['a.js'])) as any);
    vi.mocked(stat).mockImplementation(((_p: any, cb: any) =>
      cb(null, {
        isFile: () => true,
        isDirectory: () => false,
        size: 10
      })) as any);
    getPackageSize({ folder: 'dist', callback });
    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0]).toContain('B');
  });

  it('目录递归：子目录文件计入总和', () => {
    const callback = vi.fn();
    vi.mocked(readdir).mockImplementation(((p: any, cb: any) =>
      p.includes('sub')
        ? cb(null, ['b.js'])
        : cb(null, ['a.js', 'sub/'])) as any);
    vi.mocked(stat).mockImplementation(((p: any, cb: any) =>
      cb(null, {
        isFile: () => !p.endsWith('/'),
        isDirectory: () => p.endsWith('/'),
        size: 5
      })) as any);
    getPackageSize({ folder: 'dist', callback });
    expect(callback).toHaveBeenCalledOnce();
  });

  it('空目录：回调格式化后的 0 Bytes', () => {
    const callback = vi.fn();
    vi.mocked(readdir).mockImplementation(((_p: any, cb: any) =>
      cb(null, [])) as any);
    getPackageSize({ folder: 'dist', callback });
    expect(callback).toHaveBeenCalledWith('0 Bytes');
  });

  it('空目录 + format: false：回调原始 0', () => {
    const callback = vi.fn();
    vi.mocked(readdir).mockImplementation(((_p: any, cb: any) =>
      cb(null, [])) as any);
    getPackageSize({ folder: 'dist', callback, format: false });
    expect(callback).toHaveBeenCalledWith(0);
  });

  it('format: false 时回调原始字节数', () => {
    const callback = vi.fn();
    vi.mocked(readdir).mockImplementation(((_p: any, cb: any) =>
      cb(null, ['a.js'])) as any);
    vi.mocked(stat).mockImplementation(((_p: any, cb: any) =>
      cb(null, {
        isFile: () => true,
        isDirectory: () => false,
        size: 10
      })) as any);
    getPackageSize({ folder: 'dist', callback, format: false });
    expect(callback).toHaveBeenCalledWith(10);
  });

  it('readdir 出错：抛出原错误', () => {
    vi.mocked(readdir).mockImplementation(((_p: any, cb: any) =>
      cb(new Error('boom'))) as any);
    expect(() => getPackageSize({ folder: 'dist', callback: vi.fn() })).toThrow(
      'boom'
    );
  });
});
