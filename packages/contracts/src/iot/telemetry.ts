/**
 * 设备接入契约：主题与上行载荷。
 *
 * 主题形态「按设备 ID 分层、通道段结尾」与主流平台约定一致；不以 `$` 开头——MQTT 规范把
 * `$` 前缀保留给 broker 内部主题（如 `$SYS/`）。主题层级同时就是将来 ACL 的授权单位。
 */

/** 主题顶层前缀：隔离本平台的命名空间 */
export const IOT_TOPIC_PREFIX = 'wewant';

/** 上行通道（主题最后一段）；event / service 通道在物模型增量中于此扩展 */
export const IotChannel = {
  TELEMETRY: 'telemetry'
} as const;

export type IotChannelValue = (typeof IotChannel)[keyof typeof IotChannel];

/** 设备上行遥测主题：`wewant/devices/{deviceId}/telemetry` */
export function telemetryTopic(deviceId: string): string {
  return `${IOT_TOPIC_PREFIX}/devices/${deviceId}/${IotChannel.TELEMETRY}`;
}

/** 订阅端通配过滤器：`+` 匹配单层，即全部设备的遥测主题 */
export const TELEMETRY_TOPIC_FILTER = `${IOT_TOPIC_PREFIX}/devices/+/${IotChannel.TELEMETRY}`;

/** 单个测点 */
export interface TelemetryMetric {
  /** 测点标识（如 `temperature`）；落 TDengine 时即超级表的测点列 */
  key: string;
  value: number;
  unit: string;
}

/**
 * 设备一次上行报文的载荷。
 *
 * `ts` 用 epoch 毫秒而非 ISO 字符串：设备侧无时区上下文，毫秒数在链路上无歧义，且与
 * TDengine 的时间戳存储同形。
 */
export interface TelemetryPayload {
  deviceId: string;
  ts: number;
  metrics: TelemetryMetric[];
}
