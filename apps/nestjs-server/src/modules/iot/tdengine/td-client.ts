import { createRequire } from 'node:module';
import type * as TdClient from '@tdengine/websocket';

/**
 * `@tdengine/websocket` 是 **CJS 产物**（`lib/index.js` 为 tsc CommonJS 输出），
 * 从 ESM 里用 `createRequire` 取，避免具名导出探测依赖打包器的实现细节。
 */
const require = createRequire(import.meta.url);
const td = require('@tdengine/websocket') as typeof TdClient;

// ⚠️ 连接器在加载时把 winston 的 ExceptionHandler 挂到了 `uncaughtException` 上，而它在本机栈上
// 自己就会崩（`TypeError: stackTrace.parse is not a function`），把真正的异常盖掉、只剩 winston 的
// 崩栈。摘掉它：异常该由本进程自己处理，不该经过一个会崩的日志器。
//
// ⚠️ 代价：`removeAllListeners` 摘的是**该事件上所有**处理器、不只连接器那一个——若本进程他处
// （或将来某个依赖）也注册了 `uncaughtException`，会被一并摘掉。因此这一段必须在本应用**最早**、
// 且在任何自有处理器注册**之前**执行；此后新注册的处理器不受影响。
process.removeAllListeners('uncaughtException');

type TdConnection = Awaited<ReturnType<typeof td.sqlConnect>>;

/** 一行查询结果（按列序） */
export type TdRow = unknown[];

export interface TdSql {
  /** 执行不取结果的语句；错误由连接器**抛异常** */
  exec(sql: string): Promise<void>;
  query(sql: string): Promise<TdRow[]>;
  version(): Promise<string>;
  close(): Promise<void>;
}

/** 连上 taosAdapter；`database` 省略时连接不带默认库 */
export async function connectTd(
  url: string,
  database?: string
): Promise<TdSql> {
  const target = database === undefined ? url : `${url}/${database}`;
  const connection: TdConnection = await td.sqlConnect(new td.WSConfig(target));

  return {
    async exec(sql: string): Promise<void> {
      await connection.exec(sql);
    },
    async query(sql: string): Promise<TdRow[]> {
      const result = await connection.exec(sql);
      return (result.getData() ?? []) as TdRow[];
    },
    async version(): Promise<string> {
      return String(await connection.version());
    },
    async close(): Promise<void> {
      await connection.close();
    }
  };
}

/** 释放连接器持有的全局资源；仅进程退出前调用 */
export function destroyTd(): void {
  try {
    td.destroy();
  } catch {
    // 关闭期错误不影响结果
  }
}
