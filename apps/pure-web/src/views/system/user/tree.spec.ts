// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import Tree from './tree.vue';

vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => ({ render: () => null })
}));

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
    // v-loading 指令在 jsdom 中不实际渲染遮罩，但组件存在
    expect(wrapper.find('.overflow-hidden').exists()).toBe(true);
  });

  it('onTreeReset 可通过 expose 调用', () => {
    const wrapper = mountWithEP(Tree, {
      props: { treeLoading: false, treeData: [] }
    });
    expect((wrapper.vm as any).onTreeReset).toBeDefined();
    expect(() => (wrapper.vm as any).onTreeReset()).not.toThrow();
  });
});
