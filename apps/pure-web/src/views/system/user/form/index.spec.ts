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
});
