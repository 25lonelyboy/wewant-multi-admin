import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaModule } from './prisma.module.js';
import { PrismaService } from './prisma.service.js';
import { AppConfigService } from '../config/app-config.service.js';

jest.mock('@prisma/adapter-pg', () => ({
  // 生成 client 构造时校验 adapter.provider，需补最小形态
  PrismaPg: jest.fn().mockReturnValue({
    provider: 'postgres',
    adapterName: '@prisma/adapter-pg'
  })
}));

// 模块封装：PrismaService 在 PrismaModule 作用域内解析 AppConfigService，
// 根测试模块的 providers 对其不可见，需用全局模块提供 mock。
@Global()
@Module({
  providers: [
    {
      provide: AppConfigService,
      useValue: { databaseUrl: 'postgresql://u:p@h:5432/db' }
    }
  ],
  exports: [AppConfigService]
})
class MockAppConfigModule {}

describe('PrismaModule', () => {
  it('导出 PrismaService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockAppConfigModule, PrismaModule]
    }).compile();
    const service = moduleRef.get(PrismaService);
    // Prisma 7 runtime 构造器返回包裹对象（方法与 constructor 被拷贝为自有属性），
    // instanceof 不成立，改用 constructor 同一性 + 生命周期方法存在断言。
    expect(service.constructor).toBe(PrismaService);
    expect(typeof service.$connect).toBe('function');
    expect(typeof service.$disconnect).toBe('function');
    await moduleRef.close();
  });
});
