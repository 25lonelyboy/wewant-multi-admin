// 模拟后端动态生成路由（离线态保留 system + monitor 两组树全功能；直连态由真实后端只供 System 组——分设计决策 #2）
import { defineFakeRoute } from 'vite-plugin-fake-server/client';
import { system, monitor } from '@/router/enums';
import type { ApiResponse, AsyncRouteNode } from '@multi-admin/contracts';

/**
 * roles：页面级别权限，这里模拟二种 "admin"、"common"
 * admin：管理员角色
 * common：普通角色
 */

const systemManagementRouter: AsyncRouteNode = {
  path: '/system',
  meta: {
    icon: 'ri:settings-3-line',
    title: 'menus.pureSysManagement',
    rank: system
  },
  children: [
    {
      path: '/system/user/index',
      name: 'SystemUser',
      meta: {
        icon: 'ri:admin-line',
        title: 'menus.pureUser',
        roles: ['admin']
      }
    },
    {
      path: '/system/role/index',
      name: 'SystemRole',
      meta: {
        icon: 'ri:admin-fill',
        title: 'menus.pureRole',
        roles: ['admin']
      }
    },
    {
      path: '/system/menu/index',
      name: 'SystemMenu',
      meta: {
        icon: 'ep:menu',
        title: 'menus.pureSystemMenu',
        roles: ['admin']
      }
    },
    {
      path: '/system/dept/index',
      name: 'SystemDept',
      meta: {
        icon: 'ri:git-branch-line',
        title: 'menus.pureDept',
        roles: ['admin']
      }
    }
  ]
};

const systemMonitorRouter: AsyncRouteNode = {
  path: '/monitor',
  meta: {
    icon: 'ep:monitor',
    title: 'menus.pureSysMonitor',
    rank: monitor
  },
  children: [
    {
      path: '/monitor/online-user',
      component: 'monitor/online/index',
      name: 'OnlineUser',
      meta: {
        icon: 'ri:user-voice-line',
        title: 'menus.pureOnlineUser',
        roles: ['admin']
      }
    },
    {
      path: '/monitor/login-logs',
      component: 'monitor/logs/login/index',
      name: 'LoginLog',
      meta: {
        icon: 'ri:window-line',
        title: 'menus.pureLoginLog',
        roles: ['admin']
      }
    },
    {
      path: '/monitor/operation-logs',
      component: 'monitor/logs/operation/index',
      name: 'OperationLog',
      meta: {
        icon: 'ri:history-fill',
        title: 'menus.pureOperationLog',
        roles: ['admin']
      }
    },
    {
      path: '/monitor/system-logs',
      component: 'monitor/logs/system/index',
      name: 'SystemLog',
      meta: {
        icon: 'ri:file-search-line',
        title: 'menus.pureSystemLog',
        roles: ['admin']
      }
    }
  ]
};

export default defineFakeRoute([
  {
    url: '/api/v1/auth/get-async-routes',
    method: 'get',
    response: () => {
      return {
        code: 0,
        message: '操作成功',
        data: [systemManagementRouter, systemMonitorRouter]
      } satisfies ApiResponse<AsyncRouteNode[]>;
    }
  }
]);
