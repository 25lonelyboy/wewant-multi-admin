import { parseTelemetry } from './telemetry-message.js';

const validPayload = JSON.stringify({
  deviceId: 'sim-001',
  ts: 1759603200000,
  metrics: [
    { key: 'temperature', value: 62.4, unit: '°C' },
    { key: 'current', value: 4.31, unit: 'A' }
  ]
});

describe('parseTelemetry', () => {
  it('解析合法报文', () => {
    expect(parseTelemetry(validPayload)).toEqual({
      deviceId: 'sim-001',
      ts: 1759603200000,
      metrics: [
        { key: 'temperature', value: 62.4, unit: '°C' },
        { key: 'current', value: 4.31, unit: 'A' }
      ]
    });
  });

  it('非 JSON 文本返回 null', () => {
    expect(parseTelemetry('not-json')).toBeNull();
  });

  it('顶层非对象返回 null', () => {
    expect(parseTelemetry('42')).toBeNull();
    expect(parseTelemetry('null')).toBeNull();
    expect(parseTelemetry('[]')).toBeNull();
  });

  it('deviceId 缺失或为空返回 null', () => {
    expect(parseTelemetry(JSON.stringify({ ts: 1, metrics: [] }))).toBeNull();
    expect(
      parseTelemetry(JSON.stringify({ deviceId: '', ts: 1, metrics: [] }))
    ).toBeNull();
  });

  it('ts 非有限数字返回 null', () => {
    expect(
      parseTelemetry(
        JSON.stringify({ deviceId: 'sim-001', ts: 'now', metrics: [] })
      )
    ).toBeNull();
    expect(
      parseTelemetry(
        JSON.stringify({ deviceId: 'sim-001', ts: null, metrics: [] })
      )
    ).toBeNull();
  });

  it('metrics 非数组返回 null', () => {
    expect(
      parseTelemetry(
        JSON.stringify({ deviceId: 'sim-001', ts: 1, metrics: 'x' })
      )
    ).toBeNull();
  });

  it('测点全部非法时返回 null', () => {
    expect(
      parseTelemetry(
        JSON.stringify({
          deviceId: 'sim-001',
          ts: 1,
          metrics: [{ key: 'temperature', value: 'hot', unit: '°C' }]
        })
      )
    ).toBeNull();
  });

  it('过滤非法测点并保留合法项', () => {
    const sample = parseTelemetry(
      JSON.stringify({
        deviceId: 'sim-001',
        ts: 1,
        metrics: [
          { key: '', value: 1, unit: 'A' },
          { key: 'current', value: 4.31, unit: 'A' },
          { key: 'broken', value: Number.NaN, unit: 'A' }
        ]
      })
    );
    expect(sample?.metrics).toEqual([
      { key: 'current', value: 4.31, unit: 'A' }
    ]);
  });
});
