/**
 * 设备接入契约：主题与上行载荷。
 *
 * 主题形态「按设备 ID 分层、通道段结尾」与主流平台约定一致；不以 `$` 开头——MQTT 规范把
 * `$` 前缀保留给 broker 内部主题（如 `$SYS/`）。主题层级同时就是将来 ACL 的授权单位。
 *
 * ⚠️ **主题段是路由地址，不是身份**：段里放的是**设备自报**的 `localDeviceId`；平台不以其
 * 判定身份（身份以载荷为准），订阅端只做一致性拦截。
 */

/** 主题顶层前缀：隔离本平台的命名空间 */
export const IOT_TOPIC_PREFIX = 'wewant';

/** 上行通道（主题最后一段）；event / service 通道在物模型增量中于此扩展 */
export const IotChannel = {
  TELEMETRY: 'telemetry'
} as const;

export type IotChannelValue = (typeof IotChannel)[keyof typeof IotChannel];

/** 主题里的设备层段名 */
const IOT_DEVICES_SEGMENT = 'devices';

/**
 * 设备上行遥测主题：`wewant/devices/{localDeviceId}/telemetry`。
 *
 * `localDeviceId` 是**设备报的**编号，与平台的 `deviceId` 不是一回事——后者由平台签发、
 * 不下发设备（见 `device-registry` 包）。
 */
export function telemetryTopic(localDeviceId: string): string {
  return `${IOT_TOPIC_PREFIX}/${IOT_DEVICES_SEGMENT}/${localDeviceId}/${IotChannel.TELEMETRY}`;
}

/**
 * 从遥测主题取回设备自报编号——`telemetryTopic` 的逆运算。
 * 层级数、前缀、段名或通道不符均返回 `null`。
 */
export function localDeviceIdFromTopic(topic: string): string | null {
  const [prefix, devices, localDeviceId, channel, ...rest] = topic.split('/');
  if (rest.length > 0) return null;
  if (prefix !== IOT_TOPIC_PREFIX) return null;
  if (devices !== IOT_DEVICES_SEGMENT) return null;
  if (channel !== IotChannel.TELEMETRY) return null;
  if (localDeviceId === undefined || localDeviceId === '') return null;
  return localDeviceId;
}

/** 订阅端通配过滤器：`+` 匹配单层，即全部设备的遥测主题 */
export const TELEMETRY_TOPIC_FILTER = `${IOT_TOPIC_PREFIX}/${IOT_DEVICES_SEGMENT}/+/${IotChannel.TELEMETRY}`;

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
  /** 设备报的本地编号；与主题段同值（订阅端会拦截不一致的报文） */
  localDeviceId: string;
  ts: number;
  metrics: TelemetryMetric[];
}
