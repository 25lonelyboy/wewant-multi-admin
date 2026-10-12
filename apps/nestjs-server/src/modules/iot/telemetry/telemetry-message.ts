import {
  localDeviceIdFromTopic,
  normalizeLocalId
} from '@multi-admin/contracts';

/**
 * 只取 `localDeviceId` 的**轻量解析**。
 *
 * 订阅端不做完整校验——那件事归消费者（缓冲层 §3.1「入队在解析之前」）。这里解析只有一个
 * 目的：拿到与主题段比对的设备编号、并给设备在线视图喂数据。
 *
 * ⚠️ 它**不判好坏**：解析不出来就返回 `null`，报文照样入队，由消费者计数与丢弃。
 */
export function readLocalDeviceId(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const value = (parsed as { localDeviceId?: unknown }).localDeviceId;
  return typeof value === 'string' && value !== '' ? value : null;
}

export type MessageOutcome =
  /** 主题与载荷一致：入队，并记进设备在线视图（编号已规范化） */
  | { kind: 'accept'; localDeviceId: string }
  /** 载荷里读不出设备编号：**原样入队**，由消费者计数与丢弃 */
  | { kind: 'accept-opaque' }
  /** 身份不一致：**拦下**，不入队 */
  | {
      kind: 'reject-identity';
      topicDeviceId: string;
      payloadDeviceId: string;
    };

/**
 * 一条报文的去向判定。
 *
 * ⚠️ **"丢弃"分两类、归属不同**：`JSON.parse` 失败归**消费者**（原样入队）；
 * **身份不一致归订阅端**（不入队）——主题是 ACL 的授权单位，身份却以载荷为准，
 * 不拦的话，一个已授权设备可以在自己的主题上发别人的编号，数据落进别人的子表。
 *
 * 比对前两侧都过规范化：同一台设备前后大小写/空白不一致不算换了一台。
 */
export function classifyMessage(topic: string, raw: string): MessageOutcome {
  const payloadDeviceId = readLocalDeviceId(raw);
  if (payloadDeviceId === null) return { kind: 'accept-opaque' };

  const normalized = normalizeLocalId(payloadDeviceId);
  const topicDeviceId = localDeviceIdFromTopic(topic);
  if (
    topicDeviceId === null ||
    normalizeLocalId(topicDeviceId) !== normalized
  ) {
    return {
      kind: 'reject-identity',
      topicDeviceId: topicDeviceId ?? topic,
      payloadDeviceId
    };
  }

  return { kind: 'accept', localDeviceId: normalized };
}
