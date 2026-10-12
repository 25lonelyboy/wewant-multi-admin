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
    await appendFile(this.file, line, 'utf8');
    this.bytes += Buffer.byteLength(line);
    return !this.overflowed;
  }

  /**
   * FIFO 补投：**投成功才删**。
   *
   * 重复投是安全的（幂等键兜底），反过来会丢——所以宁可重投。
   */
  async drain(send: SpillSend): Promise<number> {
    let content: string;
    try {
      content = await readFile(this.file, 'utf8');
    } catch {
      this.bytes = 0;
      return 0;
    }

    const lines = content.split('\n').filter(line => line !== '');
    if (lines.length === 0) {
      this.bytes = 0;
      return 0;
    }

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

    // 只把**已确认投递**的那些行移出文件
    const rest = lines.slice(sent);
    const remaining = rest.length === 0 ? '' : `${rest.join('\n')}\n`;
    await writeFile(this.file, remaining, 'utf8');
    this.bytes = Buffer.byteLength(remaining);
    return sent;
  }
}
