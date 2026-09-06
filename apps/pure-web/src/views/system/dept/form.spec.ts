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
          higherDeptOptions: [{ id: 1, name: '总公司', children: [] }],
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

  it('默认 withDefaults 工厂生成空表单', () => {
    const wrapper = mountWithEP(DeptForm);
    // 默认 formInline 应存在
    expect(wrapper.find('form').exists()).toBe(true);
    // el-input 应存在（name/ principal/ phone/ email/ remark）
    expect(wrapper.findAll('.el-input').length).toBeGreaterThanOrEqual(4);
  });

  it('el-cascader 渲染（higherDeptOptions 非空）', () => {
    const wrapper = mountWithEP(DeptForm, {
      props: {
        formInline: {
          higherDeptOptions: [
            {
              id: 1,
              name: '总公司',
              children: [{ id: 2, name: '子部门', children: [] }]
            }
          ],
          parentId: 0,
          name: '',
          principal: '',
          phone: '',
          email: '',
          sort: 0,
          status: 1,
          remark: ''
        }
      }
    });
    expect(wrapper.find('.el-cascader').exists()).toBe(true);
  });

  it('el-switch 渲染部门状态', () => {
    const wrapper = mountWithEP(DeptForm);
    expect(wrapper.find('.el-switch').exists()).toBe(true);
  });

  it('textarea 渲染备注', () => {
    const wrapper = mountWithEP(DeptForm);
    expect(wrapper.find('textarea').exists()).toBe(true);
  });
});
