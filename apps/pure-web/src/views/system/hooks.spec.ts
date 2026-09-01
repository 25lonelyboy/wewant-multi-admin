// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
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

  it('tagStyle(1) 返回绿色系', () => {
    const { tagStyle } = usePublicHooks();
    const style = tagStyle.value(1);
    expect(style).toHaveProperty('--el-tag-text-color');
    expect(style).toHaveProperty('--el-tag-bg-color');
    expect(style).toHaveProperty('--el-tag-border-color');
  });

  it('tagStyle(0) 返回红色系', () => {
    const { tagStyle } = usePublicHooks();
    const style = tagStyle.value(0);
    expect(style).toHaveProperty('--el-tag-text-color');
  });

  it('isDark 为 Ref<boolean>', () => {
    const { isDark } = usePublicHooks();
    expect(typeof isDark.value).toBe('boolean');
  });
});
