import { classifyMessage, readLocalDeviceId } from './telemetry-message.js';

const topic = 'wewant/devices/sim-001/telemetry';

function raw(localDeviceId: string): string {
  return JSON.stringify({
    localDeviceId,
    ts: 1759603200000,
    metrics: [{ key: 'temperature', value: 62.4, unit: '°C' }]
  });
}

describe('readLocalDeviceId', () => {
  it('取到合法编号', () => {
    expect(readLocalDeviceId(raw('sim-001'))).toBe('sim-001');
  });

  it('非 JSON / 非对象 / 缺字段 / 空串均返回 null', () => {
    expect(readLocalDeviceId('not-json')).toBeNull();
    expect(readLocalDeviceId('42')).toBeNull();
    expect(readLocalDeviceId('null')).toBeNull();
    expect(readLocalDeviceId('[]')).toBeNull();
    expect(readLocalDeviceId(JSON.stringify({ ts: 1 }))).toBeNull();
    expect(
      readLocalDeviceId(JSON.stringify({ localDeviceId: '', ts: 1 }))
    ).toBeNull();
    expect(
      readLocalDeviceId(JSON.stringify({ localDeviceId: 7, ts: 1 }))
    ).toBeNull();
  });
});

describe('classifyMessage', () => {
  it('主题与载荷一致 ⇒ accept', () => {
    expect(classifyMessage(topic, raw('sim-001'))).toEqual({
      kind: 'accept',
      localDeviceId: 'sim-001'
    });
  });

  it('大小写与首尾空白不一致不算换了一台，且按规范化后的编号记名', () => {
    expect(classifyMessage(topic, raw(' SIM-001 '))).toEqual({
      kind: 'accept',
      localDeviceId: 'sim-001'
    });
  });

  it('主题段与载荷不一致 ⇒ 拦下', () => {
    expect(
      classifyMessage('wewant/devices/sim-002/telemetry', raw('sim-001'))
    ).toEqual({
      kind: 'reject-identity',
      topicDeviceId: 'sim-002',
      payloadDeviceId: 'sim-001'
    });
  });

  it('主题不符合契约形态 ⇒ 拦下（等价于身份不可信）', () => {
    expect(
      classifyMessage('wewant/devices/sim-001/other', raw('sim-001'))
    ).toEqual({
      kind: 'reject-identity',
      topicDeviceId: 'wewant/devices/sim-001/other',
      payloadDeviceId: 'sim-001'
    });
  });

  it('解析不出编号 ⇒ 原样入队，不拦', () => {
    expect(classifyMessage(topic, 'not-json')).toEqual({
      kind: 'accept-opaque'
    });
    expect(
      classifyMessage(topic, JSON.stringify({ ts: 1, metrics: [] }))
    ).toEqual({ kind: 'accept-opaque' });
  });
});
