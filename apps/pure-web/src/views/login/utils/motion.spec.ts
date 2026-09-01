// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Motion from './motion';

describe('login/utils/motion', () => {
  it('导出 defineComponent，name 为 Motion', () => {
    expect(Motion.name).toBe('Motion');
  });

  it('delay prop 默认值 50', () => {
    expect(Motion.props!.delay.default).toBe(50);
  });

  it('render 生成 div 包裹的插槽内容', () => {
    const wrapper = mount(Motion, {
      props: { delay: 100 },
      slots: { default: '<span class="child">hello</span>' },
      global: {
        directives: {
          motion: { mounted: () => {} }
        }
      }
    });
    expect(wrapper.find('.child').exists()).toBe(true);
    expect(wrapper.find('.child').text()).toBe('hello');
  });

  it('delay 使用默认值 50 渲染不抛异常', () => {
    const wrapper = mount(Motion, {
      slots: { default: '<em>ok</em>' },
      global: {
        directives: {
          motion: { mounted: () => {} }
        }
      }
    });
    expect(wrapper.find('em').text()).toBe('ok');
  });
});
