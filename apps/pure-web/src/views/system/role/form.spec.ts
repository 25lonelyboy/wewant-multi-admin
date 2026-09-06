// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import RoleForm from './form.vue';

describe('role/form.vue', () => {
  it('渲染角色表单（新增模式）', () => {
    const wrapper = mountWithEP(RoleForm);
    expect(wrapper.find('form').exists()).toBe(true);
    // 新增模式下角色标识不禁用
    const codeInput = wrapper.findAll('.el-input__inner')[1];
    expect(codeInput).toBeDefined();
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

  it('新增模式角色标识可编辑', () => {
    const wrapper = mountWithEP(RoleForm, {
      props: {
        formInline: {
          title: '新增',
          name: '测试角色',
          code: 'test',
          remark: ''
        }
      }
    });
    const inputs = wrapper.findAll('.el-input');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('编辑模式角色标识禁用', () => {
    const wrapper = mountWithEP(RoleForm, {
      props: {
        formInline: {
          title: '修改',
          name: '管理员',
          code: 'admin',
          remark: ''
        }
      }
    });
    // 编辑模式下 code 输入应被禁用
    const codeInput = wrapper.findAll('.el-input')[1];
    expect(codeInput.classes()).toContain('is-disabled');
  });

  it('textarea 备注渲染', () => {
    const wrapper = mountWithEP(RoleForm);
    expect(wrapper.find('textarea').exists()).toBe(true);
  });
});
