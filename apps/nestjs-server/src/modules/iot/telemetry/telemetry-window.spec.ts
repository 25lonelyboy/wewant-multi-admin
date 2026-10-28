import { TelemetryWindowCounter } from './telemetry-window.js';

describe('TelemetryWindowCounter', () => {
  it('按去向分列计数，设备数按 localDeviceId 去重', () => {
    const counter = new TelemetryWindowCounter();
    counter.recordEnqueued();
    counter.recordEnqueued();
    counter.recordSpilled();
    counter.recordDropped();
    counter.recordUnreadable();
    counter.recordDevice('sim-001');
    counter.recordDevice('sim-001');
    counter.recordDevice('sim-002');

    expect(counter.drain()).toEqual({
      enqueued: 2,
      spilled: 1,
      dropped: 1,
      unreadable: 1,
      devices: 2
    });
  });

  it('drain 后窗口清零', () => {
    const counter = new TelemetryWindowCounter();
    counter.recordEnqueued();

    expect(counter.drain().enqueued).toBe(1);
    expect(counter.drain()).toEqual({
      enqueued: 0,
      spilled: 0,
      dropped: 0,
      unreadable: 0,
      devices: 0
    });
  });

  it('空窗口 drain 全零', () => {
    expect(new TelemetryWindowCounter().drain()).toEqual({
      enqueued: 0,
      spilled: 0,
      dropped: 0,
      unreadable: 0,
      devices: 0
    });
  });
});
