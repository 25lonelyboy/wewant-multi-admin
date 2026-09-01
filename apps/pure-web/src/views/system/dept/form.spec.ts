// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import DeptForm from './form.vue';

vi.mock('../hooks', () => ({
  usePublicHooks: () => ({
    switchStyle: { value: {} },
    isDark: { value: false },
    tagStyle: { value: () => ({}) }
  })
}));

describe('dept/form.vue', () => {
  it('渲染部门表单（新增模式）', () => {
    const wrapper = mountWithEP(DeptForm);
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('getRef 通过 expose 暴露', () => {
    const wrapper = mountWithEP(DeptForm);
    expect((wrapper.vm as any).getRef).toBeDefined();
  });

  it('编辑模式传入 formInline', () => {
    const wrapper = mountWithEP(DeptForm, {
      props: {
        formInline: {
          higherDeptOptions: [],
          parentId: 1,
          name: '技术部',
          principal: '张三',
          phone: '13800138000',
          email: 'tech@test.com',
          sort: 1,
          status: 1,
          remark: '负责技术开发'
        }
      }
    });
    expect(wrapper.find('form').exists()).toBe(true);
  });
});
