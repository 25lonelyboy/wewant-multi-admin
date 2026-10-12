import { tmpdir } from 'node:os';
import { join } from 'node:path';

// jest setupFiles（先于任何测试模块 import 执行）：仅在进程 env 缺失时填测试默认值，
// 支持真机 env 覆盖（如 CI 用独立账号库）。DATABASE_URL 指向测试库 multi_admin_test，
// 与 e2e globalSetup 建库逻辑（test/e2e-env.ts，由 test/global-setup.ts 经 tsx 拉起）保持一致。

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
setIfAbsent('QUEUE_REDIS_URL', 'redis://localhost:6380');
setIfAbsent('MQTT_URL', 'mqtt://127.0.0.1:1883');
// 订阅端 clientId 固定 ⇒ 与开发者本机可能在跑的 dev:server 会互踢，测试用独立 id 隔离
setIfAbsent('MQTT_CLIENT_ID', 'wewant-iot-subscriber-e2e');
// 本地缓冲目录落在临时目录，别往仓库里写
setIfAbsent('IOT_SPILL_DIR', join(tmpdir(), 'wewant-iot-spill-test'));
setIfAbsent('ADMIN_INIT_PASSWORD', 'e2e-admin-password');
setIfAbsent('JWT_ACCESS_SECRET', 'e2e-access-secret-minimum-32-char!');
setIfAbsent('JWT_REFRESH_SECRET', 'e2e-refresh-secret-minimum-32-char!');
