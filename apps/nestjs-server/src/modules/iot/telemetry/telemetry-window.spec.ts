import { TelemetryWindowCounter } from './telemetry-window.js';

describe('TelemetryWindowCounter', () => {
  it('累计消息数、测点数，设备数按 deviceId 去重', () => {
    const counter = new TelemetryWindowCounter();
    counter.record('sim-001', 3);
    counter.record('sim-001', 3);
    counter.record('sim-002', 2);

    expect(counter.drain()).toEqual({ messages: 3, metrics: 8, devices: 2 });
  });

  it('drain 后窗口清零', () => {
    const counter = new TelemetryWindowCounter();
    counter.record('sim-001', 3);

    expect(counter.drain()).toEqual({ messages: 1, metrics: 3, devices: 1 });
    expect(counter.drain()).toEqual({ messages: 0, metrics: 0, devices: 0 });
  });

  it('空窗口 drain 全零', () => {
    expect(new TelemetryWindowCounter().drain()).toEqual({
      messages: 0,
      metrics: 0,
      devices: 0
    });
  });
});
