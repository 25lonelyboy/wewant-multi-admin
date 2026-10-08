// MQTT 凭据探针：核实「切到 MQTT 5.0 后，认证/凭据这一块和 3.1.1 是不是一样」。
//
// 前提：一个**独立**的 EMQX（不影响开发环境那个），已配好：
//   · 认证器 password_based / built_in_database
//   · 用户 dev1 / secret123
// 本脚本面向 127.0.0.1:11883（临时容器），默认无认证的 1883 不适用。
//
// 放在 apps/iot-simulator/scripts/ 下（同 mqtt-protocol-probe.mjs）：仓库根没有 `mqtt` 依赖。
//
// 用法：MQTT_URL=mqtt://127.0.0.1:11883 node apps/iot-simulator/scripts/mqtt-credential-probe.mjs

import mqtt from 'mqtt';

const URL = process.env.MQTT_URL ?? 'mqtt://127.0.0.1:11883';
const results = [];

function record(id, title, detail) {
  results.push({ id, title, detail });
  console.log(`\n[${id}] ${title}\n    ${detail}`);
}

function attemptConnect(options, timeoutMs = 8000) {
  return new Promise(resolve => {
    const client = mqtt.connect(URL, {
      reconnectPeriod: 0,
      connectTimeout: timeoutMs,
      ...options
    });
    const timer = setTimeout(() => {
      client.end(true);
      resolve({
        ok: false,
        how: '超时',
        detail: `无 CONNACK（${timeoutMs}ms）`
      });
    }, timeoutMs);
    client.once('connect', connack => {
      clearTimeout(timer);
      client.end(true);
      resolve({ ok: true, connack });
    });
    client.once('error', err => {
      clearTimeout(timer);
      client.end(true);
      resolve({
        ok: false,
        how: 'error 事件',
        detail: err?.message ?? String(err),
        code: err?.code,
        // mqtt.js 把 CONNACK 的 reason code 放在 err 上（5.0 才有意义）
        raw: JSON.stringify({
          message: err?.message,
          code: err?.code,
          connack: err?.connack
        })
      });
    });
  });
}

console.log(`目标 Broker：${URL}（配了密码认证器 + 用户 dev1/secret123）`);

const CASES = [
  { id: 'C1', label: '3.1.1 · 不带凭据', v: 4, creds: {} },
  {
    id: 'C2',
    label: '3.1.1 · 正确凭据',
    v: 4,
    creds: { username: 'dev1', password: 'secret123' }
  },
  {
    id: 'C3',
    label: '3.1.1 · 错误密码',
    v: 4,
    creds: { username: 'dev1', password: 'WRONG' }
  },
  {
    id: 'C4',
    label: '3.1.1 · 不存在的用户',
    v: 4,
    creds: { username: 'nobody', password: 'x' }
  },
  { id: 'C5', label: '5.0 · 不带凭据', v: 5, creds: {} },
  {
    id: 'C6',
    label: '5.0 · 正确凭据',
    v: 5,
    creds: { username: 'dev1', password: 'secret123' }
  },
  {
    id: 'C7',
    label: '5.0 · 错误密码',
    v: 5,
    creds: { username: 'dev1', password: 'WRONG' }
  },
  {
    id: 'C8',
    label: '5.0 · 不存在的用户',
    v: 5,
    creds: { username: 'nobody', password: 'x' }
  },
  {
    id: 'C9',
    label: '5.0 · 二进制密码（Buffer）',
    v: 5,
    creds: { username: 'dev1', password: Buffer.from('secret123') }
  },
  {
    id: 'C10',
    label: '5.0 · 带认证方法属性（增强认证 Authentication Method）',
    v: 5,
    creds: {
      username: 'dev1',
      password: 'secret123',
      properties: { authenticationMethod: 'SCRAM-SHA-1' }
    }
  }
];

console.log(`\n${'═'.repeat(72)}\n凭据矩阵\n${'═'.repeat(72)}`);

for (const c of CASES) {
  const r = await attemptConnect({
    clientId: `cred-${c.id}`,
    protocolVersion: c.v,
    clean: true,
    ...c.creds
  });
  record(
    c.id,
    c.label,
    r.ok
      ? `✅ 连接成功`
      : `❌ 拒绝（${r.how}）｜${r.detail}${r.code !== undefined ? `｜code=${r.code}` : ''}`
  );
  await new Promise(res => setTimeout(res, 250));
}

console.log(`\n${'═'.repeat(72)}\n汇总\n${'═'.repeat(72)}`);
for (const r of results) console.log(`${r.id}\t${r.title}`);
console.log(`\n共 ${results.length} 项。`);
process.exit(0);
