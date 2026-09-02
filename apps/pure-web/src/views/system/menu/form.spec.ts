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

describe('menu/form.vue', () => {
  it('渲染菜单表单（新增模式）', () => {
    const wrapper = mountWithEP(MenuForm);
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('getRef 通过 expose 暴露', () => {
    const wrapper = mountWithEP(MenuForm);
    expect((wrapper.vm as any).getRef).toBeDefined();
  });

  it('编辑模式传入 formInline', () => {
    const wrapper = mountWithEP(MenuForm, {
      props: {
        formInline: {
          menuType: 0,
          higherMenuOptions: [],
          parentId: '',
          title: '系统管理',
          name: 'system',
          path: '/system',
          component: 'layout',
          sort: 1,
          redirect: '',
          icon: 'ep/tools',
          extraIcon: '',
          enterTransition: '',
          leaveTransition: '',
          activePath: '',
          auths: '',
          frameSrc: '',
          frameLoading: 1,
          keepAlive: 0,
          hiddenTag: 0,
          fixedTag: 0,
          showLink: 1,
          showParent: 0
        }
      }
    });
    expect(wrapper.find('form').exists()).toBe(true);
  });
});
