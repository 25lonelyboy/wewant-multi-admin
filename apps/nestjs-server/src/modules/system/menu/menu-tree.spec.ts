import { buildMenuTree } from './menu-tree.js';

const row = (id: string, parentId: string | null, sort = 0) => ({
  id,
  parentId,
  sort
});

describe('buildMenuTree', () => {
  it('按 sort 升序组装父子树', () => {
    const tree = buildMenuTree([
      row('c1', 'p1', 1),
      row('p1', null, 0),
      row('c0', 'p1', 0)
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('p1');
    expect(tree[0].children.map(c => c.id)).toEqual(['c0', 'c1']);
  });

  it('已删父节点的孤儿子树不渲染（父链自然不可见）', () => {
    const tree = buildMenuTree([row('root', null), row('orphan', 'p-deleted')]);
    expect(tree.map(n => n.id)).toEqual(['root']);
  });

  it('空集返回空数组', () => {
    expect(buildMenuTree([])).toEqual([]);
  });
});
