import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import mqtt, { type MqttClient } from 'mqtt';
import { TELEMETRY_TOPIC_FILTER } from '@multi-admin/contracts';
import { AppConfigService } from '../../../config/app-config.service.js';
import { parseTelemetry } from './telemetry-message.js';
import { TelemetryWindowCounter } from './telemetry-window.js';

/** 聚合日志窗口：逐条打印在 100 台设备下不可读 */
const REPORT_INTERVAL_MS = 1000;

/**
 * 设备上行订阅。本增量只做「订阅 + 可见性日志」：不进队列、不落库。
 *
 * 连接失败**不得**阻断应用启动——MQTT 是接入子系统，Broker 不可达时 API 仍须可用，
 * 恢复交给 mqtt.js 的自动重连。仓库内三条链路在没有 EMQX 的情况下启动本应用
 * （server 镜像冒烟、CI docker-build 的 server 冒烟、CI e2e-web-real）。
 */
@Injectable()
export class TelemetrySubscriberService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelemetrySubscriberService.name);
  private readonly counter = new TelemetryWindowCounter();
  /** 收到过报文的设备集合：增量 4 的设备在线视图与增量 6 的指标都以此为底 */
  private readonly seenDevices = new Set<string>();
  private client: MqttClient | null = null;
  private reportTimer: NodeJS.Timeout | null = null;
  private received = 0;
  private dropped = 0;
  private reportedDropped = 0;
  /** 一次断连周期只记一条告警，避免重连间隔刷屏 */
  private outageLogged = false;

  constructor(private readonly config: AppConfigService) {}

  /** 自启动以来接收的报文总数 */
  get receivedTotal(): number {
    return this.received;
  }

  /** 自启动以来被丢弃（结构不符）的报文总数 */
  get droppedTotal(): number {
    return this.dropped;
  }

  /** 是否收到过该设备的报文 */
  hasSeenDevice(deviceId: string): boolean {
    return this.seenDevices.has(deviceId);
  }

  onModuleInit(): void {
    const url = this.config.mqttUrl;
    this.logger.log(`设备上行订阅目标：${url}，主题 ${TELEMETRY_TOPIC_FILTER}`);
    try {
      const client = mqtt.connect(url, {
        clientId: `nestjs-server-${process.pid}`
      });
      this.client = client;

      client.on('connect', () => {
        this.outageLogged = false;
        client.subscribe(TELEMETRY_TOPIC_FILTER, { qos: 0 }, error => {
          if (error) {
            this.logger.warn(`订阅失败：${error.message}`);
          } else {
            this.logger.log(`已订阅 ${TELEMETRY_TOPIC_FILTER}`);
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

  onModuleDestroy(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }
    this.client?.end(true);
    this.client = null;
  }

  /** 单条报文处理：结构不符只计数并降级为 debug，不中断订阅链路 */
  handleMessage(topic: string, payload: Buffer): void {
    const sample = parseTelemetry(payload.toString('utf8'));
    if (!sample) {
      this.dropped += 1;
      this.logger.debug(`丢弃无法解析的报文：${topic}`);
      return;
    }
    this.received += 1;
    this.seenDevices.add(sample.deviceId);
    this.counter.record(sample.deviceId, sample.metrics.length);
    this.logger.debug(
      `收到 ${sample.deviceId} 的 ${sample.metrics.length} 个测点`
    );
  }

  /** 每秒一行聚合，即验收证据：可 grep、可计数 */
  private report(): void {
    const window = this.counter.drain();
    const dropped = this.dropped - this.reportedDropped;
    this.reportedDropped = this.dropped;
    if (window.messages === 0 && dropped === 0) return;

    this.logger.log(
      `telemetry 每秒 ${window.messages} 条 / ${window.metrics} 测点 / ${window.devices} 台设备` +
        (dropped > 0 ? `（丢弃 ${dropped} 条）` : '')
    );
  }

  private logOutage(message: string): void {
    if (this.outageLogged) return;
    this.outageLogged = true;
    this.logger.warn(`MQTT ${message}`);
  }
}
