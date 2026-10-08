// MQTT 协议版本探针：核实「mqtt.js 切到 MQTT 5.0」的迁移面里，文档说不清的那几条。
//
// 放在 apps/iot-simulator/ 下（而不是 scripts/probe/）——因为仓库根没有 `mqtt` 依赖，
// 按 catalog 规则它只属于模拟器；Node 从脚本所在目录向上解析依赖，放这里才 import 得到。
//
// 前提：本机 127.0.0.1:1883 上有一个 EMQX（`pnpm ops:env-up`，默认无认证）。
//       本探针**不改 EMQX 任何配置**——"不改配置能不能用 5.0"正是要验的东西之一。
//
// 用法：node apps/iot-simulator/scripts/mqtt-protocol-probe.mjs

import mqtt from 'mqtt';

const URL = process.env.MQTT_URL ?? 'mqtt://127.0.0.1:1883';
const results = [];

function record(id, title, detail) {
  results.push({ id, title, detail });
  console.log(`\n[${id}] ${title}\n    ${detail}`);
}

function connect(options) {
  return new Promise(resolve => {
    const client = mqtt.connect(URL, { reconnectPeriod: 0, ...options });
    const timer = setTimeout(() => {
      client.end(true);
      resolve({ ok: false, error: '连接超时（10s）' });
    }, 10000);
    client.once('connect', connack => {
      clearTimeout(timer);
      resolve({ ok: true, client, connack });
    });
    client.once('error', err => {
      clearTimeout(timer);
      client.end(true);
      resolve({ ok: false, error: err.message });
    });
  });
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

console.log(`目标 Broker：${URL}`);
console.log(`mqtt.js 默认 protocolVersion = 4（MQTT 3.1.1）`);

// ═══ P0 / P1：两个协议版本能否各自建连 ═══════════════════════════════════
console.log(
  `\n${'═'.repeat(72)}\nP0 / P1 连接（不改 EMQX 配置）\n${'═'.repeat(72)}`
);

const c4 = await connect({
  clientId: 'probe-v4',
  protocolVersion: 4,
  clean: true
});
record(
  'P0',
  'protocolVersion 4（MQTT 3.1.1）建连',
  c4.ok
    ? `✅ 成功；CONNACK sessionPresent=${c4.connack?.sessionPresent}`
    : `❌ ${c4.error}`
);

const c5 = await connect({
  clientId: 'probe-v5',
  protocolVersion: 5,
  clean: true
});
record(
  'P1',
  'protocolVersion 5（MQTT 5.0）建连 —— **未改 EMQX 任何配置**',
  c5.ok
    ? `✅ 成功；CONNACK sessionPresent=${c5.connack?.sessionPresent}`
    : `❌ ${c5.error}`
);

if (c5.ok) {
  record(
    'P1.1',
    '服务端 CONNACK properties（仅 5.0 有）',
    JSON.stringify(c5.client.serverProperties ?? null)
  );
}

// ═══ P2：混用 —— 5.0 订阅者 + 3.1.1 发布者 ═══════════════════════════════
console.log(
  `\n${'═'.repeat(72)}\nP2 版本混用（渐进迁移能否成立）\n${'═'.repeat(72)}`
);

if (c4.ok && c5.ok) {
  const TOPIC = 'wewant/probe/version-mix';
  const seen = [];
  c5.client.subscribe(TOPIC, { qos: 0 });
  c5.client.on('message', (t, p) => {
    if (t === TOPIC) seen.push(p.toString('utf8'));
  });
  await wait(500);
  c4.client.publish(TOPIC, 'from-3.1.1', { qos: 0 });
  await wait(800);
  record(
    'P2',
    '3.1.1 发布者 → 5.0 订阅者（同一 Broker、同一监听器）',
    seen.length === 1
      ? `✅ 收到：「${seen[0]}」`
      : `❌ 未收到（seen=${JSON.stringify(seen)}）`
  );
}

// ═══ P3：User Properties 端到端透传 ═══════════════════════════════════════
console.log(
  `\n${'═'.repeat(72)}\nP3 MQTT 5.0 独有特性：User Properties（trace 上下文传播）\n${'═'.repeat(72)}`
);

if (c5.ok) {
  const TOPIC = 'wewant/probe/userprops';
  const got = [];
  c5.client.subscribe(TOPIC, { qos: 0 });
  c5.client.on('message', (t, p, packet) => {
    if (t === TOPIC) got.push(packet.properties ?? null);
  });
  await wait(500);
  c5.client.publish(TOPIC, 'with-props', {
    qos: 0,
    properties: {
      userProperties: { traceId: 'trace-abc-123', deviceId: 'dev1' }
    }
  });
  await wait(800);
  record(
    'P3',
    '发布侧带 User Properties → 订阅侧是否收到',
    got.length
      ? `✅ 收到；properties=${JSON.stringify(got[0])}`
      : `❌ 未收到 properties（got=${JSON.stringify(got)}）`
  );

  // 对照：3.1.1 发布者带同样的 properties 会怎样
  const got2 = [];
  const TOPIC2 = 'wewant/probe/userprops-v4';
  c5.client.subscribe(TOPIC2, { qos: 0 });
  c5.client.on('message', (t, p, packet) => {
    if (t === TOPIC2)
      got2.push({
        payload: p.toString('utf8'),
        props: packet.properties ?? null
      });
  });
  await wait(500);
  let v4Err = null;
  try {
    c4.client.publish(TOPIC2, 'v4-with-props', {
      qos: 0,
      properties: { userProperties: { traceId: 'x' } }
    });
  } catch (e) {
    v4Err = e.message;
  }
  await wait(800);
  record(
    'P3.1',
    '对照：3.1.1 发布者带 properties',
    v4Err
      ? `发布侧抛错：${v4Err}`
      : `发布侧未报错；订阅侧收到 ${got2.length} 条，properties=${JSON.stringify(got2.map(g => g.props))}`
  );
}

// ═══ P4：clean 与 Session Expiry（5.0 的会话语义） ════════════════════════
console.log(`\n${'═'.repeat(72)}\nP4 clean 在 5.0 下的语义\n${'═'.repeat(72)}`);

if (c5.ok) {
  // 5.0 里 clean=true 表示 Clean Start；会话存活时长由 Session Expiry Interval 决定
  const kept = await connect({
    clientId: 'probe-session',
    protocolVersion: 5,
    clean: true,
    properties: { sessionExpiryInterval: 300 }
  });
  record(
    'P4',
    '5.0：clean=true 且 properties.sessionExpiryInterval=300 能否建连',
    kept.ok
      ? '✅ 成功（说明 properties 在 CONNECT 上被接受）'
      : `❌ ${kept.error}`
  );
  kept.client?.end(true);

  const bad = await connect({
    clientId: 'probe-session-bad',
    protocolVersion: 4,
    clean: true,
    properties: { sessionExpiryInterval: 300 }
  });
  record(
    'P4.1',
    '对照：3.1.1 上带 properties',
    bad.ok ? '⚠️ 建连成功（properties 被忽略）' : `❌ 被拒：${bad.error}`
  );
  bad.client?.end(true);
}

// ═══ P5：5.0 的 Reason Code ══════════════════════════════════════════════
console.log(
  `\n${'═'.repeat(72)}\nP5 5.0 的原因码（订阅结果的细粒度反馈）\n${'═'.repeat(72)}`
);

if (c5.ok) {
  await new Promise(resolve => {
    c5.client.subscribe(
      'wewant/probe/reasoncode',
      { qos: 2 },
      (err, granted) => {
        record(
          'P5',
          'SUBSCRIBE 的返回（5.0 用 reason code，3.1.1 只有 0x80 一种失败）',
          `err=${err ? err.message : 'null'}；granted=${JSON.stringify(granted)}`
        );
        resolve();
      }
    );
  });
}

// ═══ P6：跨版本矩阵 —— 载荷完整性与 properties 降级 ═════════════════════
console.log(
  `\n${'═'.repeat(72)}\nP6 跨版本矩阵（发布版本 × 订阅版本）\n${'═'.repeat(72)}`
);

const COMBOS = [
  { label: '3.1.1 发布 → 3.1.1 订阅（基线）', pub: 4, sub: 4 },
  { label: '3.1.1 发布 → 5.0 订阅 ← 订阅端切 5.0 的关键问题', pub: 4, sub: 5 },
  { label: '5.0 发布 → 3.1.1 订阅（现场老设备方向的逆）', pub: 5, sub: 4 },
  { label: '5.0 发布 → 5.0 订阅（基线）', pub: 5, sub: 5 }
];

let comboIndex = 0;
for (const combo of COMBOS) {
  comboIndex += 1;
  const TOPIC = `wewant/probe/matrix/${comboIndex}`;
  const PAYLOAD = `payload-from-v${combo.pub}`;
  const props = {
    userProperties: { traceId: `trace-${comboIndex}`, src: `v${combo.pub}` }
  };

  const subRes = await connect({
    clientId: `matrix-sub-${comboIndex}`,
    protocolVersion: combo.sub,
    clean: true
  });
  const pubRes = await connect({
    clientId: `matrix-pub-${comboIndex}`,
    protocolVersion: combo.pub,
    clean: true
  });

  if (!subRes.ok || !pubRes.ok) {
    record(
      `P6.${comboIndex}`,
      combo.label,
      `建连失败：sub=${subRes.ok ? 'ok' : subRes.error} pub=${pubRes.ok ? 'ok' : pubRes.error}`
    );
    subRes.client?.end(true);
    pubRes.client?.end(true);
    continue;
  }

  const seen = [];
  subRes.client.subscribe(TOPIC, { qos: 0 });
  subRes.client.on('message', (t, p, packet) => {
    if (t === TOPIC) {
      seen.push({
        payload: p.toString('utf8'),
        props: packet.properties ?? null,
        qos: packet.qos
      });
    }
  });
  await wait(400);

  // 两个版本都带 properties 发一次——看 3.1.1 侧是否静默丢弃
  pubRes.client.publish(TOPIC, PAYLOAD, { qos: 0, properties: props });
  await wait(900);

  const got = seen[0];
  record(
    `P6.${comboIndex}`,
    combo.label,
    got
      ? `收到 ${seen.length} 条；payload=${got.payload === PAYLOAD ? '✅ 完整一致' : `⚠️ 不符（${got.payload}）`}；` +
          `properties=${got.props ? `✅ ${JSON.stringify(got.props)}` : '空（null）'}`
      : `❌ 未收到（seen=${seen.length}）`
  );

  subRes.client.end(true);
  pubRes.client.end(true);
  await wait(200);
}

// ═══ P7：5.0 发布者带 User Properties → 3.1.1 订阅者 ═══════════════════
console.log(
  `\n${'═'.repeat(72)}\nP7 5.0 的 User Properties 投给 3.1.1 订阅者\n${'═'.repeat(72)}`
);

{
  const TOPIC = 'wewant/probe/matrix/props-to-v4';
  const sub = await connect({
    clientId: 'props-v4-sub',
    protocolVersion: 4,
    clean: true
  });
  const pub = await connect({
    clientId: 'props-v5-pub',
    protocolVersion: 5,
    clean: true
  });
  if (sub.ok && pub.ok) {
    const seen = [];
    sub.client.subscribe(TOPIC, { qos: 0 });
    sub.client.on('message', (t, p, packet) => {
      if (t === TOPIC)
        seen.push({
          payload: p.toString('utf8'),
          props: packet.properties ?? null
        });
    });
    await wait(400);
    pub.client.publish(TOPIC, 'v5-with-props-to-v4', {
      qos: 0,
      properties: { userProperties: { traceId: 'should-be-dropped' } }
    });
    await wait(900);
    record(
      'P7',
      '5.0 发布（带 traceId）→ 3.1.1 订阅者',
      seen.length
        ? `收到 ${seen.length} 条；payload=${seen[0].payload}；properties=${seen[0].props ? JSON.stringify(seen[0].props) : '空（null）——**被丢弃**'}`
        : '❌ 未收到'
    );
  } else {
    record('P7', '5.0 发布 → 3.1.1 订阅者', '建连失败');
  }
  sub.client?.end(true);
  pub.client?.end(true);
  await wait(200);
}

// ═══ P8：连续多报文跨版本（不只是"一条能过"） ══════════════════════════
console.log(
  `\n${'═'.repeat(72)}\nP8 连续多报文：3.1.1 发布 → 5.0 订阅（20 条）\n${'═'.repeat(72)}`
);

{
  const TOPIC = 'wewant/probe/matrix/burst';
  const sub = await connect({
    clientId: 'burst-v5-sub',
    protocolVersion: 5,
    clean: true
  });
  const pub = await connect({
    clientId: 'burst-v4-pub',
    protocolVersion: 4,
    clean: true
  });
  if (sub.ok && pub.ok) {
    const seen = [];
    sub.client.subscribe(TOPIC, { qos: 0 });
    sub.client.on('message', (t, p) => {
      if (t === TOPIC) seen.push(p.toString('utf8'));
    });
    await wait(400);
    for (let i = 0; i < 20; i++) {
      pub.client.publish(TOPIC, `msg-${i}`, { qos: 0 });
    }
    await wait(1200);
    const ordered = seen.every((v, i) => v === `msg-${i}`);
    record(
      'P8',
      '3.1.1 发布 20 条 → 5.0 订阅',
      `收到 ${seen.length}/20 条；顺序${ordered ? '✅ 保持' : `⚠️ 不保持（${seen.join(',')}）`}`
    );
  } else {
    record('P8', '连续多报文', '建连失败');
  }
  sub.client?.end(true);
  pub.client?.end(true);
  await wait(200);
}

// ═══ 收尾 ═══════════════════════════════════════════════════════════════
for (const c of [c4, c5]) {
  c.client?.end(true);
}
await wait(300);

console.log(`\n${'═'.repeat(72)}\n汇总\n${'═'.repeat(72)}`);
for (const r of results) console.log(`${r.id}\t${r.title}`);
console.log(`\n共 ${results.length} 项。`);
process.exit(0);
