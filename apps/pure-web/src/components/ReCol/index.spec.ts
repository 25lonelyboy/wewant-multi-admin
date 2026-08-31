// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { ElCol } from 'element-plus';
import ReCol from './index';

describe('ReCol', () => {
  it('默认 value=24 渲染 ElCol 五断点同值，槽内容与透传属性落位', () => {
    const wrapper = mount(ReCol, {
      attrs: { class: 'custom-col' },
      slots: { default: '<span>col-content</span>' }
    });
    const elCol = wrapper.findComponent(ElCol);
    expect(elCol.exists()).toBe(true);
    expect(elCol.props()).toMatchObject({
      xs: 24,
      sm: 24,
      md: 24,
      lg: 24,
      xl: 24
    });
    expect(wrapper.text()).toContain('col-content');
    expect(wrapper.classes()).toContain('custom-col');
  });

  it('value prop 覆盖五断点；无默认槽时渲染不抛错（可选链护栏）', () => {
    const wrapper = mount(ReCol, { props: { value: 12 } });
    expect(wrapper.findComponent(ElCol).props()).toMatchObject({
      xs: 12,
      md: 12,
      xl: 12
    });
  });
});
