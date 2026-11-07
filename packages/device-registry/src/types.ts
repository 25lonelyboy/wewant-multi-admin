/** 子表引用——建表脚本与注册路径据此枚举 */
export interface SubtableRef {
  /** 子表名（已折小写，与 TDengine 的存储形态一致） */
  name: string;
  /** 平台设备标识（**原样大小写**，进标签值） */
  deviceId: string;
  /** 物模型编码：决定超表名 */
  modelCode: string;
}
