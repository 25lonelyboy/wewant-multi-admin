import { randomInt } from 'node:crypto';

/** 平台设备标识长度：决策 1 §8.2 定为 16 位全大写 */
export const DEVICE_ID_LENGTH = 16;

/** 首字符只用字母；其余字母或数字 */
const LEAD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BODY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const DEVICE_ID_PATTERN = /^[A-Z][A-Z0-9]{15}$/;

/**
 * 校验平台签发的设备标识。
 *
 * `deviceId` 进子表名与 TAGS 标签值，字符集必须兜住。⚠️ 它拦的是**从库里读回的脏数据**，
 * 不是正常注册路径——签发函数本身保证格式。
 */
export function checkDeviceId(value: string): boolean {
  return DEVICE_ID_PATTERN.test(value);
}

/**
 * 签发一个新的设备标识：随机 + 唯一约束兜底重试（调用方负责重试）。
 *
 * 与 P1 的序号确定性映射不同——注册路径没有序号可用，随机生成时靠库的唯一约束发现碰撞。
 */
export function issueDeviceId(): string {
  let id = LEAD_ALPHABET.charAt(randomInt(LEAD_ALPHABET.length));
  for (let index = 1; index < DEVICE_ID_LENGTH; index += 1) {
    id += BODY_ALPHABET.charAt(randomInt(BODY_ALPHABET.length));
  }
  return id;
}
