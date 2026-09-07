// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

let darkValue = false;
vi.mock('@pureadmin/utils', async () => {
  const actual = await vi.importActual<Record<string, any>>('@pureadmin/utils');
  return {
    ...actual,
    useDark: () => ({
      isDark: {
        get value() {
          return darkValue;
        }
      }
    })
  };
});

import { usePublicHooks } from './hooks';

describe('usePublicHooks', () => {
  it('switchStyle 返回含 on/off 颜色变量的对象', () => {
    const { switchStyle } = usePublicHooks();
    expect(switchStyle.value).toHaveProperty('--el-switch-on-color', '#6abe39');
    expect(switchStyle.value).toHaveProperty(
      '--el-switch-off-color',
      '#e84749'
    );
  });

  it('tagStyle(1) light 返回绿色系', () => {
    darkValue = false;
    const { tagStyle } = usePublicHooks();
    const style = tagStyle.value(1);
    expect(style).toHaveProperty('--el-tag-text-color', '#389e0d');
    expect(style).toHaveProperty('--el-tag-bg-color', '#f6ffed');
    expect(style).toHaveProperty('--el-tag-border-color', '#b7eb8f');
  });

  it('tagStyle(0) light 返回红色系', () => {
    darkValue = false;
    const { tagStyle } = usePublicHooks();
    const style = tagStyle.value(0);
    expect(style).toHaveProperty('--el-tag-text-color', '#cf1322');
    expect(style).toHaveProperty('--el-tag-bg-color', '#fff1f0');
    expect(style).toHaveProperty('--el-tag-border-color', '#ffa39e');
  });

  it('tagStyle(1) dark 返回暗色绿色系', () => {
    darkValue = true;
    const { tagStyle } = usePublicHooks();
    const style = tagStyle.value(1);
    expect(style).toHaveProperty('--el-tag-text-color', '#6abe39');
    expect(style).toHaveProperty('--el-tag-bg-color', '#172412');
    expect(style).toHaveProperty('--el-tag-border-color', '#274a17');
  });

  it('tagStyle(0) dark 返回暗色红色系', () => {
    darkValue = true;
    const { tagStyle } = usePublicHooks();
    const style = tagStyle.value(0);
    expect(style).toHaveProperty('--el-tag-text-color', '#e84749');
    expect(style).toHaveProperty('--el-tag-bg-color', '#2b1316');
    expect(style).toHaveProperty('--el-tag-border-color', '#58191c');
  });

  it('isDark 为 Ref<boolean>', () => {
    const { isDark } = usePublicHooks();
    expect(typeof isDark.value).toBe('boolean');
  });
});
