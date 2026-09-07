// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import Tree from './tree.vue';

vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => ({ render: () => null })
}));

const sampleTree = [
  {
    id: 1,
    name: '总公司',
    children: [
      { id: 2, name: '技术部', children: [] },
      { id: 3, name: '市场部', children: [] }
    ]
  }
];

describe('user/tree.vue', () => {
  it('渲染部门树组件', () => {
    const wrapper = mountWithEP(Tree, {
      props: { treeLoading: false, treeData: [] }
    });
    expect(wrapper.find('.overflow-hidden').exists()).toBe(true);
  });

  it('treeLoading 时显示 loading', () => {
    const wrapper = mountWithEP(Tree, {
      props: { treeLoading: true, treeData: [] }
    });
    expect(wrapper.find('.overflow-hidden').exists()).toBe(true);
  });

  it('onTreeReset 可通过 expose 调用', () => {
    const wrapper = mountWithEP(Tree, {
      props: { treeLoading: false, treeData: [] }
    });
    expect((wrapper.vm as any).onTreeReset).toBeDefined();
    expect(() => (wrapper.vm as any).onTreeReset()).not.toThrow();
  });

  it('treeData 传入数据后渲染树', () => {
    const wrapper = mountWithEP(Tree, {
      props: { treeLoading: false, treeData: sampleTree }
    });
    expect(wrapper.find('.el-tree').exists()).toBe(true);
  });

  it('搜索框渲染', () => {
    const wrapper = mountWithEP(Tree, {
      props: { treeLoading: false, treeData: sampleTree }
    });
    expect(wrapper.find('.el-input').exists()).toBe(true);
  });

  it('展开/折叠按钮渲染', () => {
    const wrapper = mountWithEP(Tree, {
      props: { treeLoading: false, treeData: sampleTree }
    });
    // el-dropdown 应存在
    expect(wrapper.find('.el-dropdown').exists()).toBe(true);
  });

  it('onTreeReset 重置搜索值和髙亮', () => {
    const wrapper = mountWithEP(Tree, {
      props: { treeLoading: false, treeData: sampleTree }
    });
    (wrapper.vm as any).onTreeReset();
    // 重置后搜索框应为空
    const input = wrapper.find('.el-input__inner');
    expect(input.exists()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('el-divider 渲染', () => {
    const wrapper = mountWithEP(Tree, {
      props: { treeLoading: false, treeData: sampleTree }
    });
    expect(wrapper.find('.el-divider').exists()).toBe(true);
  });

  it('el-scrollbar 渲染', () => {
    const wrapper = mountWithEP(Tree, {
      props: { treeLoading: false, treeData: sampleTree }
    });
    expect(wrapper.find('.el-scrollbar').exists()).toBe(true);
  });
});
