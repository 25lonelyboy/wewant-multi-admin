import { buildRouteTree, type MenuRouteRow } from './route-tree.js';

const row = (
  partial: Partial<MenuRouteRow> & Pick<MenuRouteRow, 'id' | 'name'>
): MenuRouteRow => ({
  parentId: null,
  type: 'MENU',
  title: partial.name,
  icon: null,
  path: null,
  component: null,
  sort: 0,
  visible: true,
  meta: null,
  ...partial
});

const rows: MenuRouteRow[] = [
  row({
    id: 'm-sys',
    name: 'System',
    path: '/system',
    icon: 'ri:settings-3-line',
    sort: 1
  }),
  row({ id: 'm-mon', name: 'Monitor', path: '/monitor', sort: 0 }),
  row({
    id: 'm-user',
    name: 'SystemUser',
    parentId: 'm-sys',
    path: '/system/user/index',
    icon: 'ri:admin-line'
  }),
  row({
    id: 'm-log',
    name: 'LoginLog',
    parentId: 'm-sys',
    path: '/monitor/login-logs',
    component: 'monitor/logs/login/index',
    sort: 1
  }),
  row({
    id: 'b-q',
    name: 'SystemUser:query',
    parentId: 'm-user',
    type: 'BUTTON'
  })
];

describe('buildRouteTree', () => {
  it('顶层按 sort 升序、BUTTON 过滤、叶子带 name/component/roles', () => {
    const tree = buildRouteTree(rows, ['common']);
    expect(tree.map(n => n.path)).toEqual(['/monitor', '/system']);

    const sys = tree[1];
    expect(sys.meta).toEqual({
      rank: 1,
      title: 'System',
      icon: 'ri:settings-3-line',
      showLink: true
    });
    expect(sys.name).toBeUndefined();
    expect(sys.children).toHaveLength(2);
    expect(sys.children![0]).toMatchObject({
      path: '/system/user/index',
      name: 'SystemUser',
      meta: {
        title: 'SystemUser',
        roles: ['common'],
        icon: 'ri:admin-line',
        showLink: true
      }
    });
    expect(sys.children![1]).toMatchObject({
      name: 'LoginLog',
      component: 'monitor/logs/login/index'
    });
    expect(sys.children![1].meta.icon).toBeUndefined();
  });

  it('IFRAME/EXTERNAL 型进树，BUTTON 仍过滤', () => {
    const tree = buildRouteTree(
      [
        row({ id: 'm1', name: 'Frame', type: 'IFRAME', path: '/frame' }),
        row({
          id: 'm2',
          name: 'Link',
          type: 'EXTERNAL',
          path: 'https://example.com'
        }),
        row({ id: 'b1', name: 'Btn', type: 'BUTTON' })
      ],
      ['common']
    );
    expect(tree.map(n => n.path)).toEqual(['/frame', 'https://example.com']);
  });

  it('showLink 输出为 visible；meta 字段透传且内置字段后置写入', () => {
    const tree = buildRouteTree(
      [
        row({
          id: 'm1',
          name: 'Hidden',
          path: '/hidden',
          visible: false,
          meta: { keepAlive: true, frameSrc: 'https://x.com' }
        })
      ],
      ['common']
    );
    expect(tree[0].meta.showLink).toBe(false);
    expect(tree[0].meta.keepAlive).toBe(true);
    expect(tree[0].meta.frameSrc).toBe('https://x.com');
    // title 等内置字段后置写入，任何透传字段都无法覆盖（MenuMeta 类型亦不含 title）
    expect(tree[0].meta.title).toBe('Hidden');
  });

  it('visible=true 时 showLink 为 true（默认形态回归）', () => {
    const tree = buildRouteTree(rows, ['common']);
    expect(tree[1].meta.showLink).toBe(true);
    expect(tree[1].children![0].meta.showLink).toBe(true);
  });
});
