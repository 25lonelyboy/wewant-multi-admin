import { Injectable, Logger, Optional } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import mqtt, { type MqttClient } from 'mqtt';
import { TELEMETRY_TOPIC_FILTER } from '@multi-admin/contracts';
import { AppConfigService } from '../../../config/app-config.service.js';
import { classifyMessage } from './telemetry-message.js';
import { TelemetryProducer } from './telemetry-producer.js';
import {
  TelemetryWindowCounter,
  type TelemetryWindow
} from './telemetry-window.js';

/** 聚合日志窗口：逐条打印在 100 台设备下不可读 */
const REPORT_INTERVAL_MS = 1000;

/**
 * 设备上行订阅：**只做两件事**——解析出设备编号（喂在线视图、拦身份不一致），
 * 再把**原始载荷**投进队列。
 *
 * 完整解析 / 校验 / 计数全在消费者（缓冲层 §3.1「入队在解析之前」——重投即原样重投）。
 *
 * ⚠️ 连接与队列**失败都不得阻断应用启动**：MQTT 是接入子系统，Broker 或队列 Redis 不可达时
 * API 仍须可用；队列不可达时由本地落盘缓冲兜底。仓库内三条链路在没有这些服务的情况下
 * 都要能起（server 镜像冒烟、CI docker-build 的 server 冒烟、CI e2e-web-real）。
 */
@Injectable()
export class TelemetrySubscriberService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelemetrySubscriberService.name);
  private readonly counter = new TelemetryWindowCounter();
  /** 收到过报文的设备集合：增量 4 的设备在线视图与增量 6 的指标都以此为底 */
  private readonly seenDevices = new Set<string>();
  private producer: TelemetryProducer | null = null;
  private client: MqttClient | null = null;
  private reportTimer: NodeJS.Timeout | null = null;
  private enqueued = 0;
  private identityRejected = 0;
  private reportedRejected = 0;
  /** 一次断连周期只记一条告警，避免重连间隔刷屏 */
  private outageLogged = false;
  /** 本地缓冲超限后停订阅；**不自动恢复**，需人工处置后重启 */
  private subscriptionStopped = false;

  /**
   * ⚠️ 生产者以构造参数注入仅为**测试替换**：生产链路里它交给 `onModuleInit` 自建，
   * 因为超限回调要绑回本实例，做成 Nest provider 会绕成循环依赖。
   */
  constructor(
    private readonly config: AppConfigService,
    @Optional() injectedProducer?: TelemetryProducer
  ) {
    this.producer = injectedProducer ?? null;
  }

  /** 自启动以来**真正入队**的报文数（落缓冲与丢弃不计） */
  get receivedTotal(): number {
    return this.enqueued;
  }

  /** 自启动以来因"主题与载荷不一致"被拦下的报文总数 */
  get identityRejectedTotal(): number {
    return this.identityRejected;
  }

  /** 是否收到过该设备的报文（需要主题与载荷一致） */
  hasSeenDevice(localDeviceId: string): boolean {
    return this.seenDevices.has(localDeviceId);
  }

  onModuleInit(): void {
    const url = this.config.mqttUrl;
    this.logger.log(
      `设备上行订阅目标：${url}，主题 ${TELEMETRY_TOPIC_FILTER}，clientId ${this.config.mqttClientId}`
    );

    // 队列生产者：构造即完成，不 ping、不 await 下游（注入替身时保留替身）
    if (this.producer === null) {
      this.producer = new TelemetryProducer({
        queueRedisUrl: this.config.queueRedisUrl,
        spillDir: this.config.iotSpillDir,
        spillMaxBytes: this.config.iotSpillMaxBytes,
        logger: {
          info: message => this.logger.log(message),
          warn: message => this.logger.warn(message),
          error: message => this.logger.error(message)
        },
        onSpillOverflow: message => this.stopSubscribing(message),
        onSpillFailure: message => this.logger.error(message)
      });
    }
    void this.producer.start();

    try {
      const client = mqtt.connect(url, {
        clientId: this.config.mqttClientId,
        protocolVersion: 5,
        // 会话跨重连保留：QoS 1 的未确认投递才可能在重连后补上
        clean: false,
        properties: {
          sessionExpiryInterval: this.config.mqttSessionExpirySeconds
        }
      });
      this.client = client;

      client.on('connect', () => {
        this.outageLogged = false;
        if (this.subscriptionStopped) return;
        client.subscribe(TELEMETRY_TOPIC_FILTER, { qos: 1 }, error => {
          if (error) {
            this.logger.warn(`订阅失败：${error.message}`);
          } else {
            this.logger.log(`已订阅 ${TELEMETRY_TOPIC_FILTER}（QoS 1）`);
          }
        });
      });
      client.on('message', (topic, payload) =>
        this.handleMessage(topic, payload)
      );
      client.on('error', error =>
        this.logOutage(`连接异常，将自动重连：${error.message}`)
      );
      client.on('reconnect', () => this.logOutage('重连中'));
    } catch (error) {
      this.logger.warn(
        `MQTT 客户端初始化失败，接入链路不可用：${String(error)}`
      );
    }

    this.reportTimer = setInterval(() => this.report(), REPORT_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reportTimer !== null) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }
    this.client?.end(true);
    this.client = null;
    const producer = this.producer;
    this.producer = null;
    if (producer !== null) await producer.close();
  }

  /**
   * 单条报文处理。
   *
   * **"丢弃"分两类、归属不同**：
   * - `JSON.parse` 失败 ⇒ **原样入队**，由消费者计数与丢弃
   * - 主题段 ≠ 载荷 `localDeviceId` ⇒ 订阅端**拦下**（主题是 ACL 的授权单位，身份却以载荷为准
   *   ⇒ 不拦的话，一个已授权设备可以在自己的主题上发别人的编号，数据落进别人的子表）
   */
  handleMessage(topic: string, payload: Buffer): void {
    const raw = payload.toString('utf8');
    const outcome = classifyMessage(topic, raw);

    if (outcome.kind === 'reject-identity') {
      this.identityRejected += 1;
      this.logger.warn(
        `身份不一致，丢弃：主题段「${outcome.topicDeviceId}」载荷「${outcome.payloadDeviceId}」`
      );
      return;
    }

    if (outcome.kind === 'accept') {
      this.seenDevices.add(outcome.localDeviceId);
      this.counter.recordDevice(outcome.localDeviceId);
    } else {
      // 坏 JSON：读不出编号，进不了设备视图；但报文照样入队 ⇒ 单独计"坏 JSON"
      this.counter.recordBadJson();
    }

    void this.enqueue(raw);
  }

  private async enqueue(raw: string): Promise<void> {
    const producer = this.producer;
    if (producer === null) return;
    // 按**实际去向**计数：落缓冲 / 丢弃都不算"入队"
    const disposition = await producer.send(raw);
    if (disposition === 'enqueued') {
      this.enqueued += 1;
      this.counter.recordEnqueued();
    } else if (disposition === 'spilled') {
      this.counter.recordSpilled();
    } else {
      this.counter.recordDropped();
    }
  }

  /** 本地缓冲超限：**停订阅 + 告警**。⚠️ 不自动恢复——需人工处置后重启 */
  private stopSubscribing(reason: string): void {
    this.subscriptionStopped = true;
    this.logger.error(`停止订阅：${reason}。需人工处置后重启，期间完全断流`);
    const client = this.client;
    if (client === null) return;
    client.unsubscribe(TELEMETRY_TOPIC_FILTER, error => {
      if (error) this.logger.warn(`取消订阅失败：${error.message}`);
    });
  }

  /**
   * 每秒一行聚合，即验收证据：可 grep、可计数。**按去向分列**，因为"入队数"若把落缓冲 /
   * 丢弃一并算进去，读数就偏高、反而误导。返回本窗口，供调用方与测试读取。
   */
  report(): TelemetryWindow {
    const window = this.counter.drain();
    const rejected = this.identityRejected - this.reportedRejected;
    this.reportedRejected = this.identityRejected;
    const active =
      window.enqueued +
      window.spilled +
      window.dropped +
      window.badJson +
      rejected;
    if (active === 0) return window;

    this.logger.log(
      `telemetry 每秒：入队 ${window.enqueued} / 落缓冲 ${window.spilled} / 丢弃 ${window.dropped}` +
        `（坏 JSON ${window.badJson}）/ ${window.devices} 台设备` +
        (rejected > 0 ? `（身份不一致拦截 ${rejected} 条）` : '')
    );
    return window;
  }

  private logOutage(message: string): void {
    if (this.outageLogged) return;
    this.outageLogged = true;
    this.logger.warn(`MQTT ${message}`);
  }
}
