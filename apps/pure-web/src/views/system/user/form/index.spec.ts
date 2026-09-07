// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import UserForm from './index.vue';

vi.mock('../../hooks', () => ({
  usePublicHooks: () => ({
    switchStyle: { value: {} },
    isDark: { value: false },
    tagStyle: { value: () => ({}) }
  })
}));

describe('user/form/index.vue', () => {
  it('渲染用户表单（新增模式）', () => {
    const wrapper = mountWithEP(UserForm);
    expect(wrapper.find('form').exists()).toBe(true);
    // 新增模式应包含密码字段和状态开关
    expect(wrapper.find('.el-switch').exists()).toBe(true);
  });

  it('getRef 通过 expose 暴露', () => {
    const wrapper = mountWithEP(UserForm);
    expect((wrapper.vm as any).getRef).toBeDefined();
  });

  it('编辑模式传入 formInline', () => {
    const wrapper = mountWithEP(UserForm, {
      props: {
        formInline: {
          title: '修改',
          id: '1',
          higherDeptOptions: [],
          parentId: 0,
          nickname: '管理员',
          username: 'admin',
          password: '',
          phone: '13800138000',
          email: 'admin@test.com',
          sex: 0,
          status: 'ACTIVE',
          remark: ''
        }
      }
    });
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('新增模式显示密码和状态字段', () => {
    const wrapper = mountWithEP(UserForm, {
      props: {
        formInline: {
          title: '新增',
          higherDeptOptions: [],
          parentId: 0,
          nickname: '',
          username: '',
          password: '',
          phone: '',
          email: '',
          sex: '',
          status: 'ACTIVE',
          remark: ''
        }
      }
    });
    expect(wrapper.find('.el-switch').exists()).toBe(true);
  });

  it('编辑模式不显示密码和状态字段', () => {
    const wrapper = mountWithEP(UserForm, {
      props: {
        formInline: {
          title: '修改',
          id: '1',
          higherDeptOptions: [],
          parentId: 0,
          nickname: '管理员',
          username: 'admin',
          password: '',
          phone: '',
          email: '',
          sex: 0,
          status: 'ACTIVE',
          remark: ''
        }
      }
    });
    // 编辑模式下不应有密码字段和状态开关
    expect(wrapper.find('.el-switch').exists()).toBe(false);
  });

  it('el-cascader 归属部门渲染', () => {
    const wrapper = mountWithEP(UserForm, {
      props: {
        formInline: {
          title: '新增',
          higherDeptOptions: [{ id: 1, name: '总公司', children: [] }],
          parentId: 0,
          nickname: '',
          username: '',
          password: '',
          phone: '',
          email: '',
          sex: '',
          status: 'ACTIVE',
          remark: ''
        }
      }
    });
    expect(wrapper.find('.el-cascader').exists()).toBe(true);
  });

  it('textarea 备注渲染', () => {
    const wrapper = mountWithEP(UserForm);
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('性别选择器渲染', () => {
    const wrapper = mountWithEP(UserForm);
    expect(wrapper.find('.el-select').exists()).toBe(true);
  });
});
