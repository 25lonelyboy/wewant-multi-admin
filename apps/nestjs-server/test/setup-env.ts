// jest setupFiles（先于任何测试模块 import 执行）：仅在进程 env 缺失时填测试默认值，
// 支持真机 env 覆盖（如 CI 用独立账号库）。DATABASE_URL 指向测试库 multi_admin_test，
// 与 e2e globalSetup 建库逻辑（test/global-setup.ts）保持一致。

function setIfAbsent(key: string, value: string): void {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value;
  }
}

setIfAbsent('NODE_ENV', 'test');
setIfAbsent(
  'DATABASE_URL',
  'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public'
);
setIfAbsent('REDIS_URL', 'redis://localhost:6379');
setIfAbsent('ADMIN_INIT_PASSWORD', 'e2e-admin-password');
