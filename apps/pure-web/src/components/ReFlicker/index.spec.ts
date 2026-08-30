// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { useRenderFlicker } from './index';

describe('useRenderFlicker', () => {
  it('无 attrs 时渲染圆点并落 5 个默认 CSS 变量', () => {
    const wrapper = mount(useRenderFlicker());
    const point = wrapper.find('.point-flicker');
    expect(point.exists()).toBe(true);
    const style = (point.element as HTMLElement).style;
    expect(style.getPropertyValue('--point-width')).toBe('12px');
    expect(style.getPropertyValue('--point-height')).toBe('12px');
    expect(style.getPropertyValue('--point-background')).toBe(
      'var(--el-color-primary)'
    );
    expect(style.getPropertyValue('--point-border-radius')).toBe('50%');
    expect(style.getPropertyValue('--point-scale')).toBe('2');
  });

  it('attrs 全量覆盖 5 个 CSS 变量', () => {
    const wrapper = mount(
      useRenderFlicker({
        width: '20px',
        height: '8px',
        borderRadius: 0,
        background: 'red',
        scale: 3
      })
    );
    const style = (wrapper.find('.point-flicker').element as HTMLElement).style;
    expect(style.getPropertyValue('--point-width')).toBe('20px');
    expect(style.getPropertyValue('--point-height')).toBe('8px');
    // borderRadius 为 0 时走 ?? 左侧（0 非 nullish），验证空值合并语义
    expect(style.getPropertyValue('--point-border-radius')).toBe('0');
    expect(style.getPropertyValue('--point-background')).toBe('red');
    expect(style.getPropertyValue('--point-scale')).toBe('3');
  });
});
