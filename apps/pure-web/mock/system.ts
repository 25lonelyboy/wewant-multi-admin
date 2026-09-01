import { defineFakeRoute } from 'vite-plugin-fake-server/client';
import { faker } from '@faker-js/faker/locale/zh_CN';
import { BizCode } from '@multi-admin/contracts';
import type {
  ApiResponse,
  MenuVO,
  PageResult,
  RoleOption,
  RoleVO,
  UserVO
} from '@multi-admin/contracts';

/** 统一 fixture 时间（固定值：mock 输出确定性） */
const NOW_ISO = '2026-08-22T00:00:00.000Z';

// ===== user fixture =====
const USERS: UserVO[] = [
  {
    id: 'user-mock-admin',
    username: 'admin',
    nickname: '小铭',
    status: 'ACTIVE',
    avatar: 'https://avatars.githubusercontent.com/u/44761321',
    phone: '15888886789',
    email: 'admin@example.com',
    sex: 0,
    remark: '管理员',
    roles: ['admin'],
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO
  },
  {
    id: 'user-mock-common',
    username: 'common',
    nickname: '小林',
    status: 'ACTIVE',
    avatar: 'https://avatars.githubusercontent.com/u/52823142',
    phone: '18288882345',
    email: 'common@example.com',
    sex: 1,
    remark: '普通用户',
    roles: ['common'],
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO
  }
];

// ===== role fixture =====
const ROLES: RoleVO[] = [
  {
    id: 'role-mock-admin',
    code: 'admin',
    name: '超级管理员',
    status: 'ACTIVE',
    remark: '超级管理员拥有最高权限',
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO
  },
  {
    id: 'role-mock-common',
    code: 'common',
    name: '普通角色',
    status: 'ACTIVE',
    remark: '普通角色拥有部分权限',
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO
  }
];

const ROLE_OPTIONS: RoleOption[] = ROLES.map(({ id, code, name }) => ({
  id,
  code,
  name
}));

// ===== menu fixture（扁平行 → 树） =====
type MenuRow = Omit<MenuVO, 'children'>;

/** 按钮行生成器：3 页面 × 4 动作 = 12 按钮 */
const buttonRow = (
  page: 'user' | 'role' | 'menu',
  action: string,
  title: string,
  sort: number
): MenuRow => ({
  id: `btn-${page}-${action}`,
  parentId: `menu-${page}`,
  type: 'BUTTON',
  name: action,
  title,
  icon: null,
  path: null,
  component: null,
  permission: `system:${page}:${action}`,
  sort,
  visible: true,
  meta: null,
  createdAt: NOW_ISO,
  updatedAt: NOW_ISO,
  deletedAt: null
});

const MENU_ROWS: MenuRow[] = [
  // 系统管理组
  {
    id: 'menu-system',
    parentId: null,
    type: 'MENU',
    name: 'System',
    title: 'menus.pureSystem',
    icon: 'ri:settings-3-line',
    path: '/system',
    component: 'layout',
    permission: null,
    sort: 1,
    visible: true,
    meta: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    deletedAt: null
  },
  {
    id: 'menu-user',
    parentId: 'menu-system',
    type: 'MENU',
    name: 'SystemUser',
    title: 'menus.pureUser',
    icon: 'ri:admin-line',
    path: '/system/user/index',
    component: 'system/user/index',
    permission: null,
    sort: 1,
    visible: true,
    meta: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    deletedAt: null
  },
  buttonRow('user', 'create', '新增用户', 1),
  buttonRow('user', 'update', '编辑用户', 2),
  buttonRow('user', 'delete', '删除用户', 3),
  buttonRow('user', 'reset-password', '重置密码', 4),
  {
    id: 'menu-role',
    parentId: 'menu-system',
    type: 'MENU',
    name: 'SystemRole',
    title: 'menus.pureRole',
    icon: 'ri:admin-fill',
    path: '/system/role/index',
    component: 'system/role/index',
    permission: null,
    sort: 2,
    visible: true,
    meta: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    deletedAt: null
  },
  buttonRow('role', 'create', '新增角色', 1),
  buttonRow('role', 'update', '编辑角色', 2),
  buttonRow('role', 'delete', '删除角色', 3),
  buttonRow('role', 'assign-menu', '菜单权限', 4),
  {
    id: 'menu-menu',
    parentId: 'menu-system',
    type: 'MENU',
    name: 'SystemMenu',
    title: 'menus.pureMenu',
    icon: 'ri:file-list-3-line',
    path: '/system/menu/index',
    component: 'system/menu/index',
    permission: null,
    sort: 3,
    visible: true,
    meta: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    deletedAt: null
  },
  buttonRow('menu', 'create', '新增菜单', 1),
  buttonRow('menu', 'update', '编辑菜单', 2),
  buttonRow('menu', 'delete', '删除菜单', 3),
  buttonRow('menu', 'query', '查询菜单', 4),
  // 外链样例组（覆盖 IFRAME/EXTERNAL 形态）
  {
    id: 'menu-iframe',
    parentId: null,
    type: 'MENU',
    name: 'PureIframe',
    title: 'menus.pureExternalPage',
    icon: 'ri:links-fill',
    path: '/iframe',
    component: 'layout',
    permission: null,
    sort: 7,
    visible: true,
    meta: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    deletedAt: null
  },
  {
    id: 'menu-iframe-doc',
    parentId: 'menu-iframe',
    type: 'IFRAME',
    name: 'PureIframeExternal',
    title: 'menus.pureExternalDoc',
    icon: null,
    path: '/iframe/external',
    component: '',
    permission: null,
    sort: 1,
    visible: true,
    meta: { frameSrc: 'https://pure-admin.cn/', frameLoading: true },
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    deletedAt: null
  },
  {
    id: 'menu-external',
    parentId: 'menu-iframe',
    type: 'EXTERNAL',
    name: 'https://pure-admin.cn/',
    title: 'menus.pureExternalLink',
    icon: null,
    path: '/external',
    component: '',
    permission: null,
    sort: 2,
    visible: true,
    meta: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    deletedAt: null
  }
];

const buildMenuTree = (rows: MenuRow[]): MenuVO[] => {
  const map = new Map<string, MenuVO>();
  rows.forEach(row => map.set(row.id, { ...row, children: [] }));
  const roots: MenuVO[] = [];
  map.forEach(node => {
    const parent = node.parentId === null ? undefined : map.get(node.parentId);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
};

const MENU_TREE = buildMenuTree(MENU_ROWS);
const ALL_MENU_IDS = MENU_ROWS.map(row => row.id);

export default defineFakeRoute([
  // 用户管理-列表（GET query 分页）
  {
    url: '/api/v1/system/users',
    method: 'get',
    response: ({ query }) => {
      const page = Number(query.page ?? 1);
      const pageSize = Number(query.pageSize ?? 10);
      let list = USERS;
      if (query.username) {
        list = list.filter(item =>
          item.username.includes(String(query.username))
        );
      }
      if (query.status) {
        list = list.filter(item => item.status === query.status);
      }
      const data: PageResult<UserVO> = {
        items: list.slice((page - 1) * pageSize, page * pageSize),
        total: list.length,
        page,
        pageSize
      };
      return {
        code: BizCode.SUCCESS,
        message: '操作成功',
        data
      } satisfies ApiResponse<PageResult<UserVO>>;
    }
  },
  // 用户管理-详情（不存在 → 40404，与 server findOne 同口径）
  {
    url: '/api/v1/system/users/:id',
    method: 'get',
    response: ({ params }) => {
      const user = USERS.find(item => item.id === params.id);
      if (!user) {
        return {
          code: BizCode.NOT_FOUND,
          message: '用户不存在',
          data: null
        };
      }
      return {
        code: BizCode.SUCCESS,
        message: '操作成功',
        data: user
      } satisfies ApiResponse<UserVO>;
    }
  },
  // 用户管理-新增（回显 + 新 id）
  {
    url: '/api/v1/system/users',
    method: 'post',
    response: ({ body }) => ({
      code: BizCode.SUCCESS,
      message: '操作成功',
      data: {
        ...body,
        id: 'user-mock-created',
        roles: [],
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
      }
    })
  },
  // 用户管理-编辑（回显）
  {
    url: '/api/v1/system/users/:id',
    method: 'put',
    response: ({ params, body }) => ({
      code: BizCode.SUCCESS,
      message: '操作成功',
      data: { ...body, id: params.id, updatedAt: NOW_ISO }
    })
  },
  // 用户管理-删除
  {
    url: '/api/v1/system/users/:id',
    method: 'delete',
    response: () => ({
      code: BizCode.SUCCESS,
      message: '操作成功',
      data: null
    })
  },
  // 用户管理-查用户角色 id 列表
  {
    url: '/api/v1/system/users/:id/roles',
    method: 'get',
    response: ({ params }) => ({
      code: BizCode.SUCCESS,
      message: '操作成功',
      data:
        params.id === 'user-mock-admin'
          ? ['role-mock-admin']
          : ['role-mock-common']
    })
  },
  // 用户管理-分配角色
  {
    url: '/api/v1/system/users/:id/roles',
    method: 'put',
    response: ({ body }) => ({
      code: BizCode.SUCCESS,
      message: '操作成功',
      data: body?.roleIds ?? []
    })
  },
  // 角色管理-全部角色（不分页；先于 :id 注册避免吞路由）
  {
    url: '/api/v1/system/roles/all',
    method: 'get',
    response: () =>
      ({
        code: BizCode.SUCCESS,
        message: '操作成功',
        data: ROLE_OPTIONS
      }) satisfies ApiResponse<RoleOption[]>
  },
  // 角色管理-列表（GET query 分页）
  {
    url: '/api/v1/system/roles',
    method: 'get',
    response: ({ query }) => {
      const page = Number(query.page ?? 1);
      const pageSize = Number(query.pageSize ?? 10);
      let list = ROLES;
      if (query.name) {
        list = list.filter(item => item.name.includes(String(query.name)));
      }
      if (query.code) list = list.filter(item => item.code === query.code);
      if (query.status) {
        list = list.filter(item => item.status === query.status);
      }
      const data: PageResult<RoleVO> = {
        items: list.slice((page - 1) * pageSize, page * pageSize),
        total: list.length,
        page,
        pageSize
      };
      return {
        code: BizCode.SUCCESS,
        message: '操作成功',
        data
      } satisfies ApiResponse<PageResult<RoleVO>>;
    }
  },
  // 角色管理-详情
  {
    url: '/api/v1/system/roles/:id',
    method: 'get',
    response: ({ params }) => {
      const role = ROLES.find(item => item.id === params.id);
      if (!role) {
        return {
          code: BizCode.NOT_FOUND,
          message: '角色不存在',
          data: null
        };
      }
      return {
        code: BizCode.SUCCESS,
        message: '操作成功',
        data: role
      } satisfies ApiResponse<RoleVO>;
    }
  },
  // 角色管理-新增（回显 + 新 id）
  {
    url: '/api/v1/system/roles',
    method: 'post',
    response: ({ body }) => ({
      code: BizCode.SUCCESS,
      message: '操作成功',
      data: {
        ...body,
        id: 'role-mock-created',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
      }
    })
  },
  // 角色管理-编辑（回显）
  {
    url: '/api/v1/system/roles/:id',
    method: 'put',
    response: ({ params, body }) => ({
      code: BizCode.SUCCESS,
      message: '操作成功',
      data: { ...body, id: params.id, updatedAt: NOW_ISO }
    })
  },
  // 角色管理-删除
  {
    url: '/api/v1/system/roles/:id',
    method: 'delete',
    response: () => ({
      code: BizCode.SUCCESS,
      message: '操作成功',
      data: null
    })
  },
  // 角色管理-查角色菜单 id 列表
  {
    url: '/api/v1/system/roles/:id/menus',
    method: 'get',
    response: ({ params }) => ({
      code: BizCode.SUCCESS,
      message: '操作成功',
      data:
        params.id === 'role-mock-admin'
          ? ALL_MENU_IDS
          : ALL_MENU_IDS.filter(
              id =>
                id === 'menu-system' ||
                id === 'menu-user' ||
                id.startsWith('btn-user-')
            )
    })
  },
  // 角色管理-分配菜单权限
  {
    url: '/api/v1/system/roles/:id/menus',
    method: 'put',
    response: ({ body }) => ({
      code: BizCode.SUCCESS,
      message: '操作成功',
      data: body?.menuIds ?? []
    })
  },
  // 菜单管理-全量树（GET 不分页）
  {
    url: '/api/v1/system/menus',
    method: 'get',
    response: () =>
      ({
        code: BizCode.SUCCESS,
        message: '操作成功',
        data: MENU_TREE
      }) satisfies ApiResponse<MenuVO[]>
  },
  // 菜单管理-详情（server 返回单行不带 children）
  {
    url: '/api/v1/system/menus/:id',
    method: 'get',
    response: ({ params }) => {
      const menu = MENU_ROWS.find(item => item.id === params.id);
      if (!menu) {
        return {
          code: BizCode.NOT_FOUND,
          message: '菜单不存在',
          data: null
        };
      }
      return {
        code: BizCode.SUCCESS,
        message: '操作成功',
        data: menu
      };
    }
  },
  // 菜单管理-新增（回显 + 新 id）
  {
    url: '/api/v1/system/menus',
    method: 'post',
    response: ({ body }) => ({
      code: BizCode.SUCCESS,
      message: '操作成功',
      data: {
        ...body,
        id: 'menu-mock-created',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
        children: []
      }
    })
  },
  // 菜单管理-编辑（回显）
  {
    url: '/api/v1/system/menus/:id',
    method: 'put',
    response: ({ params, body }) => ({
      code: BizCode.SUCCESS,
      message: '操作成功',
      data: { ...body, id: params.id, updatedAt: NOW_ISO }
    })
  },
  // 菜单管理-删除
  {
    url: '/api/v1/system/menus/:id',
    method: 'delete',
    response: () => ({
      code: BizCode.SUCCESS,
      message: '操作成功',
      data: null
    })
  },
  // 部门管理
  {
    url: '/api/v1/system/dept',
    method: 'post',
    response: () => {
      return {
        code: 0,
        message: '操作成功',
        data: [
          {
            name: '杭州总公司',
            parentId: 0,
            id: 100,
            sort: 0,
            phone: '15888888888',
            principal: faker.person.firstName(),
            email: faker.internet.email(),
            status: 1, // 状态 1 启用 0 停用
            type: 1, // 1 公司 2 分公司 3 部门
            createTime: 1605456000000,
            remark: '这里是备注信息这里是备注信息这里是备注信息这里是备注信息'
          },
          {
            name: '郑州分公司',
            parentId: 100,
            id: 101,
            sort: 1,
            phone: '15888888888',
            principal: faker.person.firstName(),
            email: faker.internet.email(),
            status: 1,
            type: 2,
            createTime: 1605456000000,
            remark: '这里是备注信息这里是备注信息这里是备注信息这里是备注信息'
          },
          {
            name: '研发部门',
            parentId: 101,
            id: 103,
            sort: 1,
            phone: '15888888888',
            principal: faker.person.firstName(),
            email: faker.internet.email(),
            status: 1,
            type: 3,
            createTime: 1605456000000,
            remark: '这里是备注信息这里是备注信息这里是备注信息这里是备注信息'
          },
          {
            name: '市场部门',
            parentId: 102,
            id: 108,
            sort: 1,
            phone: '15888888888',
            principal: faker.person.firstName(),
            email: faker.internet.email(),
            status: 1,
            type: 3,
            createTime: 1605456000000,
            remark: '这里是备注信息这里是备注信息这里是备注信息这里是备注信息'
          },
          {
            name: '深圳分公司',
            parentId: 100,
            id: 102,
            sort: 2,
            phone: '15888888888',
            principal: faker.person.firstName(),
            email: faker.internet.email(),
            status: 1,
            type: 2,
            createTime: 1605456000000,
            remark: '这里是备注信息这里是备注信息这里是备注信息这里是备注信息'
          },
          {
            name: '市场部门',
            parentId: 101,
            id: 104,
            sort: 2,
            phone: '15888888888',
            principal: faker.person.firstName(),
            email: faker.internet.email(),
            status: 1,
            type: 3,
            createTime: 1605456000000,
            remark: '这里是备注信息这里是备注信息这里是备注信息这里是备注信息'
          },
          {
            name: '财务部门',
            parentId: 102,
            id: 109,
            sort: 2,
            phone: '15888888888',
            principal: faker.person.firstName(),
            email: faker.internet.email(),
            status: 1,
            type: 3,
            createTime: 1605456000000,
            remark: '这里是备注信息这里是备注信息这里是备注信息这里是备注信息'
          },
          {
            name: '测试部门',
            parentId: 101,
            id: 105,
            sort: 3,
            phone: '15888888888',
            principal: faker.person.firstName(),
            email: faker.internet.email(),
            status: 0,
            type: 3,
            createTime: 1605456000000,
            remark: '这里是备注信息这里是备注信息这里是备注信息这里是备注信息'
          },
          {
            name: '财务部门',
            parentId: 101,
            id: 106,
            sort: 4,
            phone: '15888888888',
            principal: faker.person.firstName(),
            email: faker.internet.email(),
            status: 1,
            type: 3,
            createTime: 1605456000000,
            remark: '这里是备注信息这里是备注信息这里是备注信息这里是备注信息'
          },
          {
            name: '运维部门',
            parentId: 101,
            id: 107,
            sort: 5,
            phone: '15888888888',
            principal: faker.person.firstName(),
            email: faker.internet.email(),
            status: 0,
            type: 3,
            createTime: 1605456000000,
            remark: '这里是备注信息这里是备注信息这里是备注信息这里是备注信息'
          }
        ]
      };
    }
  },
  // 在线用户
  {
    url: '/api/v1/system/online-logs',
    method: 'post',
    response: ({ body }) => {
      let list = [
        {
          id: 1,
          username: 'admin',
          ip: faker.internet.ipv4(),
          address: '中国河南省信阳市',
          system: 'macOS',
          browser: 'Chrome',
          loginTime: new Date()
        },
        {
          id: 2,
          username: 'common',
          ip: faker.internet.ipv4(),
          address: '中国广东省深圳市',
          system: 'Windows',
          browser: 'Firefox',
          loginTime: new Date()
        }
      ];
      list = list.filter(item => item.username.includes(body?.username));
      return {
        code: 0,
        message: '操作成功',
        data: {
          list,
          total: list.length, // 总条目数
          pageSize: 10, // 每页显示条目个数
          currentPage: 1 // 当前页数
        }
      };
    }
  },
  // 登录日志
  {
    url: '/api/v1/system/login-logs',
    method: 'post',
    response: ({ body }) => {
      let list = [
        {
          id: 1,
          username: 'admin',
          ip: faker.internet.ipv4(),
          address: '中国河南省信阳市',
          system: 'macOS',
          browser: 'Chrome',
          status: 1, // 登录状态 1 成功 0 失败
          behavior: '账号登录',
          loginTime: new Date()
        },
        {
          id: 2,
          username: 'common',
          ip: faker.internet.ipv4(),
          address: '中国广东省深圳市',
          system: 'Windows',
          browser: 'Firefox',
          status: 0,
          behavior: '第三方登录',
          loginTime: new Date()
        }
      ];
      list = list.filter(item => item.username.includes(body?.username));
      list = list.filter(item =>
        String(item.status).includes(String(body?.status))
      );
      return {
        code: 0,
        message: '操作成功',
        data: {
          list,
          total: list.length, // 总条目数
          pageSize: 10, // 每页显示条目个数
          currentPage: 1 // 当前页数
        }
      };
    }
  },
  // 操作日志
  {
    url: '/api/v1/system/operation-logs',
    method: 'post',
    response: ({ body }) => {
      let list = [
        {
          id: 1,
          username: 'admin',
          ip: faker.internet.ipv4(),
          address: '中国河南省信阳市',
          system: 'macOS',
          browser: 'Chrome',
          status: 1, // 操作状态 1 成功 0 失败
          summary: '菜单管理-添加菜单', // 操作概要
          module: '系统管理', // 所属模块
          operatingTime: new Date() // 操作时间
        },
        {
          id: 2,
          username: 'common',
          ip: faker.internet.ipv4(),
          address: '中国广东省深圳市',
          system: 'Windows',
          browser: 'Firefox',
          status: 0,
          summary: '列表分页查询',
          module: '在线用户',
          operatingTime: new Date()
        }
      ];
      list = list.filter(item => item.module.includes(body?.module));
      list = list.filter(item =>
        String(item.status).includes(String(body?.status))
      );
      return {
        code: 0,
        message: '操作成功',
        data: {
          list,
          total: list.length, // 总条目数
          pageSize: 10, // 每页显示条目个数
          currentPage: 1 // 当前页数
        }
      };
    }
  },
  // 系统日志
  {
    url: '/api/v1/system/system-logs',
    method: 'post',
    response: ({ body }) => {
      let list = [
        {
          id: 1, // 日志ID
          /**
           * 日志级别
           * 0 debug调试（最低级别的日志，用于调试和开发阶段）
           * 1 info信息（默认级别，用于记录一般的信息）
           * 2 warn警告（表示可能出现的问题或潜在的错误，但不会影响系统的正常运行）
           * 3 error错误（表示发生了错误，但不会导致系统崩溃）
           * 4 fatal致命（最高级别的日志，表示发生了严重错误，导致系统无法继续运行）
           */
          level: 1,
          module: '菜单管理', // 所属模块
          url: '/menu', // 请求接口
          method: 'post', // 请求方法
          ip: faker.internet.ipv4(),
          address: '中国河南省信阳市',
          system: 'macOS',
          browser: 'Chrome',
          /**
           * 请求耗时（单位：ms 毫秒）
           * 正常耗时：一般认为在几百毫秒（0.1-0.5秒）范围内的请求耗时较为正常
           * 较慢耗时：在1秒以上的耗时可以被认为是较慢的请求，但具体是否较慢还需要根据具体业务场景和性能要求来判断
           */
          takesTime: 10,
          requestTime: new Date() // 请求时间
        },
        {
          id: 2,
          level: 0,
          module: '地图',
          url: '/get-map-info',
          method: 'get',
          ip: faker.internet.ipv4(),
          address: '中国广东省深圳市',
          system: 'Windows',
          browser: 'Firefox',
          takesTime: 1200,
          requestTime: new Date()
        }
      ];
      list = list.filter(item => item.module.includes(body?.module));
      return {
        code: 0,
        message: '操作成功',
        data: {
          list,
          total: list.length, // 总条目数
          pageSize: 10, // 每页显示条目个数
          currentPage: 1 // 当前页数
        }
      };
    }
  },
  // 系统日志-根据 id 查日志详情
  {
    url: '/api/v1/system/system-logs-detail',
    method: 'post',
    response: ({ body }) => {
      if (body.id == 1) {
        return {
          id: 1,
          level: 1,
          module: '菜单管理',
          url: '/menu',
          method: 'post',
          ip: faker.internet.ipv4(),
          address: '中国河南省信阳市',
          system: 'macOS',
          browser: 'Chrome',
          takesTime: 10,
          responseHeaders: {
            traceId: '1495502411171032',
            'Content-Type': 'application/json',
            Connection: 'keep-alive',
            'Keep-Alive': 'timeout=5',
            'Content-Length': 17019
          },
          responseBody: {
            code: 0,
            message: '操作成功',
            data: [
              {
                parentId: 0,
                id: 400,
                menuType: 0,
                title: 'menus.pureSysMonitor',
                name: 'PureMonitor',
                path: '/monitor',
                component: '',
                rank: 11,
                redirect: '',
                icon: 'ep:monitor',
                extraIcon: '',
                enterTransition: '',
                leaveTransition: '',
                activePath: '',
                auths: '',
                frameSrc: '',
                frameLoading: true,
                keepAlive: false,
                hiddenTag: false,
                fixedTag: false,
                showLink: true,
                showParent: false
              },
              {
                parentId: 400,
                id: 401,
                menuType: 0,
                title: 'menus.pureOnlineUser',
                name: 'OnlineUser',
                path: '/monitor/online-user',
                component: 'monitor/online/index',
                rank: null,
                redirect: '',
                icon: 'ri:user-voice-line',
                extraIcon: '',
                enterTransition: '',
                leaveTransition: '',
                activePath: '',
                auths: '',
                frameSrc: '',
                frameLoading: true,
                keepAlive: false,
                hiddenTag: false,
                fixedTag: false,
                showLink: true,
                showParent: false
              },
              {
                parentId: 400,
                id: 402,
                menuType: 0,
                title: 'menus.pureLoginLog',
                name: 'LoginLog',
                path: '/monitor/login-logs',
                component: 'monitor/logs/login/index',
                rank: null,
                redirect: '',
                icon: 'ri:window-line',
                extraIcon: '',
                enterTransition: '',
                leaveTransition: '',
                activePath: '',
                auths: '',
                frameSrc: '',
                frameLoading: true,
                keepAlive: false,
                hiddenTag: false,
                fixedTag: false,
                showLink: true,
                showParent: false
              },
              {
                parentId: 400,
                id: 403,
                menuType: 0,
                title: 'menus.pureOperationLog',
                name: 'OperationLog',
                path: '/monitor/operation-logs',
                component: 'monitor/logs/operation/index',
                rank: null,
                redirect: '',
                icon: 'ri:history-fill',
                extraIcon: '',
                enterTransition: '',
                leaveTransition: '',
                activePath: '',
                auths: '',
                frameSrc: '',
                frameLoading: true,
                keepAlive: false,
                hiddenTag: false,
                fixedTag: false,
                showLink: true,
                showParent: false
              },
              {
                parentId: 400,
                id: 404,
                menuType: 0,
                title: 'menus.pureSystemLog',
                name: 'SystemLog',
                path: '/monitor/system-logs',
                component: 'monitor/logs/system/index',
                rank: null,
                redirect: '',
                icon: 'ri:file-search-line',
                extraIcon: '',
                enterTransition: '',
                leaveTransition: '',
                activePath: '',
                auths: '',
                frameSrc: '',
                frameLoading: true,
                keepAlive: false,
                hiddenTag: false,
                fixedTag: false,
                showLink: true,
                showParent: false
              }
            ]
          },
          requestHeaders: {
            Accept: 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,eo;q=0.7',
            Authorization: 'Bearer eyJhbGciOiJIUzUxMiJ9.admin',
            Connection: 'keep-alive',
            'Content-Length': 0,
            Cookie:
              '_ga=GA1.1.231800979.1704562367; _ga_M74ZHEQ1M1=GS1.1.1709299375.7.1.1709299476.0.0.0; Hm_lvt_6a7dac00248d3b6ad8479d7249bb29c5=1709032753,1709359575; Hm_lvt_23a157b7d0d9867f7a51e42628f052f5=1708960489,1709485849,1709879672; authorized-token={%22accessToken%22:%22eyJhbGciOiJIUzUxMiJ9.admin%22%2C%22expires%22:1919520000000}; multiple-tabs=true',
            Host: '192.168.2.121:8848',
            Origin: 'http://192.168.2.121:8848',
            Referer: 'http://192.168.2.121:8848/',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest'
          },
          requestBody: {
            title: '系统监控'
          },
          traceId: '1495502411171032',
          requestTime: new Date()
        };
      } else if (body.id == 2) {
        return {
          id: 2,
          level: 0,
          module: '地图',
          url: '/get-map-info?plateNumber=豫A59778U',
          method: 'get',
          ip: faker.internet.ipv4(),
          address: '中国广东省深圳市',
          system: 'Windows',
          browser: 'Firefox',
          takesTime: 1200,
          responseHeaders: {
            traceId: '2280443117103208',
            'Content-Type': 'application/json',
            Connection: 'keep-alive',
            'Keep-Alive': 'timeout=5',
            'Content-Length': 28693
          },
          responseBody: {
            plateNumber: '豫A59778U',
            driver: '子骞',
            orientation: 289,
            lng: 113.8564,
            lat: 34.373
          },
          requestHeaders: {
            Accept: 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,eo;q=0.7',
            Authorization: 'Bearer eyJhbGciOiJIUzUxMiJ9.admin',
            Connection: 'keep-alive',
            'Content-Length': 0,
            Cookie:
              '_ga=GA1.1.231800979.1704562367; _ga_M74ZHEQ1M1=GS1.1.1709299375.7.1.1709299476.0.0.0; Hm_lvt_6a7dac00248d3b6ad8479d7249bb29c5=1709032753,1709359575; Hm_lvt_23a157b7d0d9867f7a51e42628f052f5=1708960489,1709485849,1709879672; authorized-token={%22accessToken%22:%22eyJhbGciOiJIUzUxMiJ9.admin%22%2C%22expires%22:1919520000000}; multiple-tabs=true',
            Host: '192.168.2.121:8848',
            Origin: 'http://192.168.2.121:8848',
            Referer: 'http://192.168.2.121:8848/',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest'
          },
          requestBody: null,
          traceId: '2280443117103208',
          requestTime: new Date()
        };
      }
      return { code: BizCode.NOT_FOUND, message: '日志不存在', data: null };
    }
  }
]);
