/**
 * 一个统计窗口的接收结果：**按报文去向分列**。
 *
 * 只记去向、不记"收到多少"——因为"收到"与"入队"不是一回事：队列不可达时报文落本地缓冲，
 * 缓冲超限或落盘失败时真的丢弃，把它们都算进"入队"就是虚报。
 */
export interface TelemetryWindow {
  /** 真正进了队列 */
  enqueued: number;
  /** 落本地缓冲（队列不可达，待补投） */
  spilled: number;
  /** 既没入队也没落缓冲——真的丢了 */
  dropped: number;
  /** 其中解析不出 JSON 的条数：与去向正交（坏 JSON 也会入队 / 落缓冲 / 丢弃） */
  badJson: number;
  /** 报文里读到过编号的设备数（去重） */
  devices: number;
}

/**
 * 固定窗口内按去向计数：只保留计数与设备标识集合，不缓存消息体。
 * 逐条落日志在 100 台设备下不可读，聚合窗口才是可读的验收证据。
 */
export class TelemetryWindowCounter {
  private enqueued = 0;
  private spilled = 0;
  private dropped = 0;
  private badJson = 0;
  private devices = new Set<string>();

  recordEnqueued(): void {
    this.enqueued += 1;
  }

  recordSpilled(): void {
    this.spilled += 1;
  }

  recordDropped(): void {
    this.dropped += 1;
  }

  recordBadJson(): void {
    this.badJson += 1;
  }

  recordDevice(localDeviceId: string): void {
    this.devices.add(localDeviceId);
  }

  /** 取出当前窗口并清零 */
  drain(): TelemetryWindow {
    const window: TelemetryWindow = {
      enqueued: this.enqueued,
      spilled: this.spilled,
      dropped: this.dropped,
      badJson: this.badJson,
      devices: this.devices.size
    };
    this.enqueued = 0;
    this.spilled = 0;
    this.dropped = 0;
    this.badJson = 0;
    this.devices = new Set<string>();
    return window;
  }
}
