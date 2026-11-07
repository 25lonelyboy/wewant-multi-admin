/**
 * 档案快照的五个 Redis 键——S5 只有本文件知道它们叫什么。
 *
 * ⚠️ 不能把「期望版本」与「已建版本」合成一个：worker 会在快照重建完成前读到新版本号、
 * 判定「不比我新」而跳过拉取，然后停在旧快照上。
 */
export const REGISTRY_REV_KEY = 'iot:registry:rev';
export const REGISTRY_BUILT_KEY = 'iot:registry:built';
export const REGISTRY_SNAPSHOT_KEY = 'iot:registry:snapshot';
export const REGISTRY_REBUILD_LOCK_KEY = 'iot:registry:rebuild-lock';

/** worker 实例当前应用的版本；供 A4（注册返回后 2 秒内全部实例可见）验收 */
export function registryWorkerVersionKey(instanceId: string): string {
  return `iot:registry:worker-version:${instanceId}`;
}
