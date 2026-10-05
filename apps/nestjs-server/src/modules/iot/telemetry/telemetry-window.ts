/** 一个统计窗口的接收结果 */
export interface TelemetryWindow {
  messages: number;
  metrics: number;
  devices: number;
}

/**
 * 固定窗口内的接收计数：只保留计数与设备标识集合，不缓存消息体。
 * 逐条落日志在 100 台设备下不可读，聚合窗口才是可读的验收证据。
 */
export class TelemetryWindowCounter {
  private messages = 0;
  private metrics = 0;
  private devices = new Set<string>();

  record(deviceId: string, metricCount: number): void {
    this.messages += 1;
    this.metrics += metricCount;
    this.devices.add(deviceId);
  }

  /** 取出当前窗口并清零 */
  drain(): TelemetryWindow {
    const window: TelemetryWindow = {
      messages: this.messages,
      metrics: this.metrics,
      devices: this.devices.size
    };
    this.messages = 0;
    this.metrics = 0;
    this.devices = new Set<string>();
    return window;
  }
}
