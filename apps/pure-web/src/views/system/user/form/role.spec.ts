// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import RoleForm from './role.vue';

describe('user/form/role.vue', () => {
  it('渲染角色分配表单', () => {
    const wrapper = mountWithEP(RoleForm);
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('传入角色列表和选中项', () => {
    const wrapper = mountWithEP(RoleForm, {
      props: {
        formInline: {
          username: 'admin',
          nickname: '管理员',
          roleOptions: [
            { id: '1', name: '超级管理员', code: 'admin' },
            { id: '2', name: '普通用户', code: 'user' }
          ],
          ids: ['1']
        }
      }
    });
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('el-select 多选渲染角色选项', () => {
    const wrapper = mountWithEP(RoleForm, {
      props: {
        formInline: {
          username: 'admin',
          nickname: '管理员',
          roleOptions: [
            { id: '1', name: '超级管理员', code: 'admin' },
            { id: '2', name: '普通用户', code: 'user' }
          ],
          ids: ['1', '2']
        }
      }
    });
    expect(wrapper.find('.el-select').exists()).toBe(true);
  });

  it('空角色列表渲染', () => {
    const wrapper = mountWithEP(RoleForm, {
      props: {
        formInline: {
          username: '',
          nickname: '',
          roleOptions: [],
          ids: []
        }
      }
    });
    expect(wrapper.find('.el-select').exists()).toBe(true);
  });

  it('用户昵称输入框禁用', () => {
    const wrapper = mountWithEP(RoleForm, {
      props: {
        formInline: {
          username: 'admin',
          nickname: '管理员',
          roleOptions: [],
          ids: []
        }
      }
    });
    const input = wrapper.find('.el-input');
    expect(input.classes()).toContain('is-disabled');
  });
});
