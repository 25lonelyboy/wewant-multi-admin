// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';

const addIconMock = vi.hoisted(() => vi.fn());
vi.mock('@iconify/vue/dist/offline', async () => {
  const { defineComponent, h: vh } = await import('vue');
  return {
    addIcon: addIconMock,
    Icon: defineComponent({
      name: 'IconifyIconStub',
      props: { icon: { type: String, default: '' } },
      render(this: { icon: string }) {
        return vh('i', { class: 'iconify-stub' }, this.icon);
      }
    })
  };
});

import { useRenderIcon } from './hooks';

describe('useRenderIcon', () => {
  it('SVG 字符串：剥离 width/height 后原样渲染，二次调用命中缓存', () => {
    const svg =
      '<svg width="10" height="10" viewBox="0 0 24 24"><path d="M1 1"/></svg>';
    const wrapper = mount(useRenderIcon(svg));
    const span = wrapper.find('.svg-raw-icon');
    expect(span.exists()).toBe(true);
    expect(span.html()).not.toContain('width="10"');
    expect(span.html()).toContain('viewBox="0 0 24 24"');
    // 缓存命中路径：同 key 二次取组件渲染结果一致
    const wrapper2 = mount(useRenderIcon(svg));
    expect(wrapper2.find('.svg-raw-icon').html()).toContain('<path d="M1 1"');
  });

  it('缓存超过 200 条时清空重建（容量护栏分支）', () => {
    for (let i = 0; i < 205; i++) {
      useRenderIcon(`<svg data-i="${i}"><path/></svg>`);
    }
    const wrapper = mount(useRenderIcon('<svg width="1"><i/></svg>'));
    expect(wrapper.find('.svg-raw-icon').exists()).toBe(true);
    expect(wrapper.find('.svg-raw-icon').html()).not.toContain('width="1"');
  });

  it('图片 URL（https 与 data:image）渲染固定尺寸 img', () => {
    const wrapper = mount(useRenderIcon('https://cdn.example.com/a.png'));
    const img = wrapper.find('img');
    expect(img.attributes('src')).toBe('https://cdn.example.com/a.png');
    expect(img.attributes('style')).toContain('18px');
    expect(
      mount(useRenderIcon('data:image/png;base64,AAA')).find('img').exists()
    ).toBe(true);
  });

  it('IF- iconfont：空格切分图标名与类型，落 FontIcon 默认分支', () => {
    const wrapper = mount(useRenderIcon('IF-team mytype'));
    const i = wrapper.find('i');
    expect(i.classes()).toEqual(expect.arrayContaining(['iconfont', 'team']));
  });

  it('函数组件 / 含 render 对象：无 attrs 返回原组件；有 attrs 返回带属性 vnode，fallthrough 至根', () => {
    const Fn = () => h('em', { class: 'fn-icon' });
    expect(useRenderIcon(Fn)).toBe(Fn);
    // 含 render 对象（与 vite-svg-loader `day.svg?component` 产物同形态）：
    // 有 attrs 时返回携带属性的 vnode，渲染时属性 fallthrough 至根元素，
    // 主题面板图标靠该链路动态填色（如 fill）
    const SvgLike = { render: () => h('em', { class: 'fn-icon' }) };
    const withAttrsWrapper = mount(
      useRenderIcon(SvgLike, { color: 'red' }) as never
    );
    expect(withAttrsWrapper.find('.fn-icon').exists()).toBe(true);
    expect(withAttrsWrapper.attributes('color')).toBe('red');
    const renderObj = { render: () => h('u', { class: 'render-obj' }) };
    expect(
      mount(useRenderIcon(renderObj) as never)
        .find('.render-obj')
        .exists()
    ).toBe(true);
  });

  it('对象分支：addIcon(icon, icon) 登记后交给 IconifyIconOffline 渲染', () => {
    const iconData = { body: '<path d="M0 0"/>' };
    const wrapper = mount(useRenderIcon(iconData));
    expect(addIconMock).toHaveBeenCalledWith(iconData, iconData);
    expect(wrapper.exists()).toBe(true);
  });

  it('字符串分支：含冒号走在线、不含走离线；空值早退不渲染', () => {
    expect((useRenderIcon('ep:add-location') as { name: string }).name).toBe(
      'Icon'
    );
    const offline = mount(useRenderIcon('local-icon'));
    expect(offline.find('.iconify-stub').text()).toBe('local-icon');
    const empty = mount(useRenderIcon(''));
    expect(empty.find('.iconify-stub').exists()).toBe(false);
    expect(empty.find('.svg-raw-icon').exists()).toBe(false);
  });
});
