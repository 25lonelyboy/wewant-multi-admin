// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FontIcon from './iconfont';

describe('FontIcon', () => {
  it('unicode 模式（uni 属性或 iconType=uni）：i.iconfont 内容为图标码', () => {
    const wrapper = mount(FontIcon, {
      props: { icon: '&#xe600;' },
      attrs: { iconType: 'uni' }
    });
    const i = wrapper.find('i.iconfont');
    expect(i.exists()).toBe(true);
    expect(i.text()).toContain('&#xe600;');
    expect(
      mount(FontIcon, { props: { icon: 'x' }, attrs: { uni: true } })
        .find('i.iconfont')
        .exists()
    ).toBe(true);
  });

  it('svg 模式：svg.icon-svg 内 use 指向 #图标名', () => {
    const wrapper = mount(FontIcon, {
      props: { icon: 'team-icon' },
      attrs: { iconType: 'svg' }
    });
    const use = wrapper.find('svg.icon-svg use');
    expect(use.exists()).toBe(true);
    expect(use.attributes('href')).toBe('#team-icon');
  });

  it('默认 font-class 模式：i 携带 iconfont + 图标名类', () => {
    const wrapper = mount(FontIcon, { props: { icon: 'team-a' } });
    const i = wrapper.find('i');
    expect(i.classes()).toEqual(expect.arrayContaining(['iconfont', 'team-a']));
  });
});
