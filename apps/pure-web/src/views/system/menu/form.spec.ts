// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import MenuForm from './form.vue';

vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : (m ?? ''))
}));

vi.mock('@/components/ReIcon', () => ({
  IconSelect: {
    name: 'IconSelect',
    props: ['modelValue'],
    template: '<div class="icon-select-stub" />'
  }
}));

vi.mock('@/components/ReAnimateSelector', () => ({
  default: {
    name: 'ReAnimateSelector',
    props: ['modelValue'],
    template: '<div class="animate-selector-stub" />'
  }
}));

vi.mock('@/components/ReSegmented', () => ({
  default: {
    name: 'Segmented',
    props: ['modelValue', 'options'],
    template: '<div class="segmented-stub" />'
  }
}));

const baseFormInline = {
  menuType: 0,
  higherMenuOptions: [],
  parentId: '',
  title: '',
  name: '',
  path: '',
  component: '',
  sort: 99,
  redirect: '',
  icon: '',
  extraIcon: '',
  enterTransition: '',
  leaveTransition: '',
  activePath: '',
  auths: '',
  frameSrc: '',
  frameLoading: true,
  keepAlive: false,
  hiddenTag: false,
  fixedTag: false,
  showLink: true,
  showParent: false
};

describe('menu/form.vue', () => {
  it('渲染菜单表单（新增模式 menuType=0）', () => {
    const wrapper = mountWithEP(MenuForm);
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('getRef 通过 expose 暴露', () => {
    const wrapper = mountWithEP(MenuForm);
    expect((wrapper.vm as any).getRef).toBeDefined();
  });

  it('编辑模式传入 formInline (menuType=0 菜单)', () => {
    const wrapper = mountWithEP(MenuForm, {
      props: {
        formInline: {
          ...baseFormInline,
          title: '系统管理',
          name: 'system',
          path: '/system',
          component: 'layout'
        }
      }
    });
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('menuType=1 iframe 模式渲染', () => {
    const wrapper = mountWithEP(MenuForm, {
      props: {
        formInline: {
          ...baseFormInline,
          menuType: 1,
          title: '外部页面',
          frameSrc: 'https://example.com'
        }
      }
    });
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('menuType=2 外链模式渲染', () => {
    const wrapper = mountWithEP(MenuForm, {
      props: {
        formInline: {
          ...baseFormInline,
          menuType: 2,
          title: '外部链接',
          path: 'https://example.com'
        }
      }
    });
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('menuType=3 按钮模式渲染', () => {
    const wrapper = mountWithEP(MenuForm, {
      props: {
        formInline: {
          ...baseFormInline,
          menuType: 3,
          title: '新增按钮',
          auths: 'system:add'
        }
      }
    });
    expect(wrapper.find('form').exists()).toBe(true);
  });
});
