// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import RoleForm from './form.vue';

describe('role/form.vue', () => {
  it('渲染角色表单（新增模式）', () => {
    const wrapper = mountWithEP(RoleForm);
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('getRef 通过 expose 暴露', () => {
    const wrapper = mountWithEP(RoleForm);
    expect((wrapper.vm as any).getRef).toBeDefined();
  });

  it('编辑模式传入 formInline', () => {
    const wrapper = mountWithEP(RoleForm, {
      props: {
        formInline: {
          title: '修改',
          name: '超级管理员',
          code: 'admin',
          remark: '拥有所有权限'
        }
      }
    });
    expect(wrapper.find('form').exists()).toBe(true);
  });
});
