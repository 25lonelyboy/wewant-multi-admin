import { defineFakeRoute } from 'vite-plugin-fake-server/client';
import { faker } from '@faker-js/faker/locale/zh_CN';
import type { ApiResponse, UserProfile } from '@multi-admin/contracts';

export default defineFakeRoute([
  // 账户设置-个人信息（对 GET /api/v1/auth/profile，UserProfile 形状）
  {
    url: '/api/v1/auth/profile',
    method: 'get',
    response: () => {
      return {
        code: 0,
        message: '操作成功',
        data: {
          avatar: 'https://avatars.githubusercontent.com/u/44761321',
          username: 'admin',
          nickname: '小铭',
          email: 'pureadmin@163.com',
          phone: '15888886789',
          description: '一个热爱开源的前端工程师'
        } satisfies UserProfile
      } satisfies ApiResponse<UserProfile>;
    }
  },
  // 账户设置-个人安全日志（端点预留位，直连态未实现属预期过渡；离线态正常供数）
  {
    url: '/api/v1/mine-logs',
    method: 'get',
    response: () => {
      const list = [
        {
          id: 1,
          ip: faker.internet.ipv4(),
          address: '中国河南省信阳市',
          system: 'macOS',
          browser: 'Chrome',
          summary: '账户登录',
          operatingTime: new Date()
        },
        {
          id: 2,
          ip: faker.internet.ipv4(),
          address: '中国广东省深圳市',
          system: 'Windows',
          browser: 'Firefox',
          summary: '绑定了手机号码',
          operatingTime: new Date().setDate(new Date().getDate() - 1)
        }
      ];
      return {
        code: 0,
        message: '操作成功',
        data: {
          list,
          total: list.length,
          pageSize: 10,
          currentPage: 1
        }
      };
    }
  }
]);
