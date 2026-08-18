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
      icon: 'ri:settings-3-line'
    });
    expect(sys.name).toBeUndefined();
    expect(sys.children).toHaveLength(2);
    expect(sys.children![0]).toMatchObject({
      path: '/system/user/index',
      name: 'SystemUser',
      meta: { title: 'SystemUser', roles: ['common'], icon: 'ri:admin-line' }
    });
    expect(sys.children![1]).toMatchObject({
      name: 'LoginLog',
      component: 'monitor/logs/login/index'
    });
    expect(sys.children![1].meta.icon).toBeUndefined();
  });
});
