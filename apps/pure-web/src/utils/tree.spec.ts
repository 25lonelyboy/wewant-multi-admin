import { describe, it, expect, vi } from 'vitest';
import {
  extractPathList,
  deleteChildren,
  buildHierarchyTree,
  getNodeByUniqueId,
  appendFieldByUniqueId,
  handleTree
} from './tree';

describe('buildHierarchyTree', () => {
  it('非数组输入告警并返回空数组', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(buildHierarchyTree('not-a-tree' as unknown as unknown[])).toEqual(
      []
    );
    expect(warn).toHaveBeenCalledWith('tree must be an array');
    warn.mockRestore();
  });

  it('空数组直接返回空数组', () => {
    expect(buildHierarchyTree([])).toEqual([]);
  });

  it('扁平节点注入 id/parentId/pathList', () => {
    const result = buildHierarchyTree([{ name: 'a' }, { name: 'b' }]);
    expect(result[0]).toMatchObject({ id: 0, parentId: null, pathList: [0] });
    expect(result[1]).toMatchObject({ id: 1, parentId: null, pathList: [1] });
  });

  it('嵌套子节点递归注入层级信息', () => {
    const tree: any[] = [{ name: 'root', children: [{ name: 'child' }] }];
    buildHierarchyTree(tree);
    expect(tree[0].pathList).toEqual([0]);
    expect(tree[0].children[0]).toMatchObject({
      id: 0,
      parentId: 0,
      pathList: [0, 0]
    });
  });

  it('children 为空数组时不递归、保留原数组', () => {
    const tree: any[] = [{ name: 'a', children: [] }];
    buildHierarchyTree(tree);
    expect(tree[0].id).toBe(0);
    expect(tree[0].children).toEqual([]);
  });
});

describe('extractPathList', () => {
  it('非数组输入告警并返回空数组', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(extractPathList('x' as unknown as unknown[])).toEqual([]);
    expect(warn).toHaveBeenCalledWith('tree must be an array');
    warn.mockRestore();
  });

  it('收集每层节点 uniqueId', () => {
    expect(extractPathList([{ uniqueId: 1 }, { uniqueId: 2 }])).toEqual([1, 2]);
  });

  // 注意：源码递归调用 extractPathList(node.children) 但未使用返回值，
  // 因此子层 uniqueId 不会出现在本层返回的数组中（已知缺陷）
  it('有子节点时仅收集本层 uniqueId（递归返回值被丢弃）', () => {
    const tree = [{ uniqueId: 'a', children: [{ uniqueId: 'b' }] }];
    expect(extractPathList(tree)).toEqual(['a']);
  });
});

describe('deleteChildren', () => {
  it('单子节点删除 children 并组装 uniqueId', () => {
    const tree: any[] = [{ name: 'a', children: [{ name: 'a1' }] }];
    deleteChildren(tree);
    expect(tree[0].children).toBeUndefined();
    expect(tree[0].uniqueId).toBe(0);
  });

  it('多子节点保留 children 且层级 uniqueId 用连字符', () => {
    const tree: any[] = [
      { name: 'a', children: [{ name: 'b' }, { name: 'c' }] }
    ];
    deleteChildren(tree);
    expect(tree[0].children.length).toBe(2);
    expect(tree[0].children[0].uniqueId).toBe('0-0');
  });

  it('非数组输入告警并返回空数组', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(deleteChildren(null as unknown as unknown[])).toEqual([]);
    expect(warn).toHaveBeenCalledWith('menuTree must be an array');
    warn.mockRestore();
  });
});

describe('getNodeByUniqueId', () => {
  it('命中当前层节点直接返回', () => {
    const node = { uniqueId: 'x' };
    expect(getNodeByUniqueId([node], 'x')).toBe(node);
  });

  it('未命中时向子层递归查找', () => {
    const child = { uniqueId: 'y' };
    const tree = [{ uniqueId: 'x', children: [child] }];
    expect(getNodeByUniqueId(tree, 'y')).toBe(child);
  });

  it('非数组输入告警并返回空数组', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getNodeByUniqueId('x' as unknown as unknown[], 'a')).toEqual([]);
    warn.mockRestore();
  });
});

describe('appendFieldByUniqueId', () => {
  it('命中节点追加字段', () => {
    const tree = [{ uniqueId: 'x' }];
    appendFieldByUniqueId(tree, 'x', { disabled: true });
    expect(tree[0]).toMatchObject({ disabled: true });
  });

  it('fields 非普通对象时不追加', () => {
    const tree = [{ uniqueId: 'x' }];
    appendFieldByUniqueId(tree, 'x', 'not-object' as unknown as object);
    expect(tree[0]).toEqual({ uniqueId: 'x' });
  });

  it('子层命中时递归追加', () => {
    const tree = [{ uniqueId: 'x', children: [{ uniqueId: 'y' }] }];
    appendFieldByUniqueId(tree, 'y', { hidden: true });
    expect(tree[0].children[0]).toMatchObject({ hidden: true });
  });
});

describe('handleTree', () => {
  it('扁平数据组装为树（缺省字段名）', () => {
    const data = [
      { id: 1, parentId: null },
      { id: 2, parentId: 1 }
    ];
    const tree = handleTree(data);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].id).toBe(2);
  });

  it('自定义字段名', () => {
    const data = [
      { key: 1, pId: null },
      { key: 2, pId: 1 }
    ];
    const tree = handleTree(data, 'key', 'pId', 'kids');
    expect(tree[0].kids[0].key).toBe(2);
  });

  it('非数组输入告警并返回空数组', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(handleTree('x' as unknown as unknown[])).toEqual([]);
    expect(warn).toHaveBeenCalledWith('data must be an array');
    warn.mockRestore();
  });
});
