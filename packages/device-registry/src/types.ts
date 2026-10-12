/** 一个采集点的对应关系 */
export interface PointMapping {
  /** 设备自报的采集点编号 */
  localPointId: string;
  /** 平台侧采集点标识：3 位递增补零，同设备内唯一 */
  pointKey: string;
}

/** 一台设备的登记 */
export interface DeviceRecord {
  /** 设备自报的本地编号；与主题段、载荷字段同源 */
  localDeviceId: string;
  /** 平台签发的 16 位标识；进子表名与标签，**不下发设备** */
  deviceId: string;
  /** 登记为**单点设备**：允许报文缺省 `localPointId` */
  singlePoint: boolean;
  points: readonly PointMapping[];
}

/** 查档失败的原因——每一条都对应一种要告警的现场情况 */
export type DeviceLookupFailure =
  'unknown-device' | 'unknown-point' | 'missing-point' | 'point-id-too-long';

export type PointResolution =
  | { ok: true; deviceId: string; pointKey: string }
  | { ok: false; reason: DeviceLookupFailure };

/** 子表引用——建表脚本据此枚举 */
export interface SubtableRef {
  /** 子表名（已折小写，与 TDengine 的存储形态一致） */
  name: string;
  /** 平台设备标识（**原样大小写**，进标签值） */
  deviceId: string;
  pointKey: string;
}

/**
 * 档案的对外接口。
 *
 * 数据长什么样是实现细节：增量 3 换成读设备档案（PG 表）时，消费方不动。
 */
export interface DeviceRegistry {
  /** 该设备是否已登记（键已规范化） */
  hasDevice(localDeviceId: string): boolean;
  /** 解析到平台标识；失败给出可告警的原因 */
  resolve(localDeviceId: string, localPointId?: string): PointResolution;
  /** 全部子表——建表脚本据此枚举 */
  allSubtables(): SubtableRef[];
}
