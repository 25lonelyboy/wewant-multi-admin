import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 本地缓冲文件：一行一条原始载荷（NDJSON） */
const SPILL_FILE = 'telemetry-spill.ndjson';

/** 一条记录的成功投递动作；抛错表示投递失败，本行及其后都保留 */
export type SpillSend = (raw: string) => Promise<void>;

/**
 * 队列不可达时的本地落盘缓冲。
 *
 * ⚠️ 它有自己的失败模式，**不是"落本地就安全了"**：
 * - 落盘失败（磁盘满、权限错）⇒ 那时**真的会丢** ⇒ 由调用方响亮告警
 * - 超过上限 ⇒ 由调用方**停订阅 + 告警**，不静默丢数据
 */
export class TelemetrySpill {
  private readonly file: string;
  private bytes = 0;

  /** append 与 drain 的"读—改—写"互斥：保证整文件重写不会覆盖并发追加的行 */
  private critical: Promise<void> = Promise.resolve();

  constructor(
    private readonly dir: string,
    private readonly maxBytes: number
  ) {
    this.file = join(dir, SPILL_FILE);
  }

  /** 建目录并读回已有缓冲的体积（重启后接着用同一份缓冲） */
  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      this.bytes = (await stat(this.file)).size;
    } catch {
      this.bytes = 0;
    }
  }

  get sizeBytes(): number {
    return this.bytes;
  }

  get overflowed(): boolean {
    return this.bytes >= this.maxBytes;
  }

  /** 追加一条；返回 `false` 表示已超上限 */
  async append(raw: string): Promise<boolean> {
    const line = `${raw}\n`;
    await this.exclusive(async () => {
      await appendFile(this.file, line, 'utf8');
      this.bytes += Buffer.byteLength(line);
    });
    return !this.overflowed;
  }

  /**
   * FIFO 补投：**投成功才删**。
   *
   * 重复投是安全的（幂等键兜底），反过来会丢——所以宁可重投。
   *
   * ⚠️ 投递循环**不能**进临界区：`send` 里可能再触发一次 `append`（热路径并发），
   * 若循环持锁，那个 append 只能等本循环结束 ⇒ 死锁。循环外的追加只会落在文件末尾，
   * 由收尾时的"重读 + 截掉已确认的前缀"捕捉，不会丢。
   */
  async drain(send: SpillSend): Promise<number> {
    let lines: string[];
    try {
      lines = (await readFile(this.file, 'utf8'))
        .split('\n')
        .filter(line => line !== '');
    } catch {
      lines = [];
    }
    if (lines.length === 0) return 0;

    let sent = 0;
    for (const line of lines) {
      try {
        await send(line);
      } catch {
        break;
      }
      sent += 1;
    }
    if (sent === 0) return 0;

    // 读—改—写临界区（与 append 互斥）：**重读**当前文件——投递循环期间追加的行
    // 已经落在旧快照之后，截去前 `sent` 行（已确认投递）即可留下它们。
    await this.exclusive(async () => {
      let current: string;
      try {
        current = await readFile(this.file, 'utf8');
      } catch {
        current = '';
      }
      const rest = current
        .split('\n')
        .filter(line => line !== '')
        .slice(sent);
      const remaining = rest.length === 0 ? '' : `${rest.join('\n')}\n`;
      await writeFile(this.file, remaining, 'utf8');
      this.bytes = Buffer.byteLength(remaining);
    });
    return sent;
  }

  /** 串行执行"读—改—写"片段；前一环的成败不影响排队 */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.critical.then(task);
    this.critical = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
