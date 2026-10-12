/**
 * 遥测入库队列名。
 *
 * 生产者（`nestjs-server` 的设备上行订阅端）与消费者（`apps/iot-worker`）**分属两个应用**，
 * 队列名必须一处定义，否则两端会各自连到不同的队列上而不报错。
 *
 * ⚠️ **名字里不能出现 `:`**——BullMQ 用它作 Redis 键的分隔符，队列名含冒号时构造即抛
 * 「Queue name cannot contain :」。域与用途两段仍保留，分隔符改用 `-`。
 */
export const TELEMETRY_INGEST_QUEUE = 'iot-telemetry-ingest';

/**
 * 队列的 Redis 键前缀。
 *
 * BullMQ 以 `<prefix>:<queue>:<...>` 组织键空间，命名空间归它管、不归队列名管——
 * 与 MQTT 的主题前缀同名，一眼能对上。
 */
export const TELEMETRY_QUEUE_PREFIX = 'wewant';
