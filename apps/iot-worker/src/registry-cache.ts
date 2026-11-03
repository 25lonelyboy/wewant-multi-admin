import { normalizeLocalId } from '@multi-admin/contracts';
import type {
  DeviceRegistry,
  PointResolution
} from '@multi-admin/device-registry';

/**
 * 查档结果的本地缓存。
 *
 * ⚠️ 万级设备下逐条查档不成立（决策 2 §6 轴 10）⇒ 必须缓存 + 失效。
 * 缓存的是**档案的答案**，档案一变（增量 3 换真档案）就靠 TTL 过期，不需要消费方感知。
 */
export class ResolveCache {
  private readonly entries = new Map<
    string,
    { at: number; result: PointResolution }
  >();

  constructor(
    private readonly registry: DeviceRegistry,
    private readonly ttlMs: number,
    private readonly maxEntries = 100_000,
    private readonly now: () => number = Date.now
  ) {}

  get size(): number {
    return this.entries.size;
  }

  resolve(localDeviceId: string): PointResolution {
    const key = normalizeLocalId(localDeviceId);
    const at = this.now();
    const hit = this.entries.get(key);
    if (hit !== undefined && at - hit.at < this.ttlMs) return hit.result;

    const result = this.registry.resolve(localDeviceId);
    // 未登记的设备会不断产生新键 ⇒ 简单封顶，超了整体清空（P1 规模下够用）
    if (this.entries.size >= this.maxEntries) this.entries.clear();
    this.entries.set(key, { at, result });
    return result;
  }

  reset(): void {
    this.entries.clear();
  }
}
