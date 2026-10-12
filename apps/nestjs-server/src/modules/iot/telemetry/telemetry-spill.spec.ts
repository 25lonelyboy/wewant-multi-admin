import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TelemetrySpill } from './telemetry-spill.js';

const FILE = 'telemetry-spill.ndjson';

async function withSpill(
  maxBytes: number,
  run: (spill: TelemetrySpill, dir: string) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'spill-'));
  try {
    await run(new TelemetrySpill(dir, maxBytes), dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('TelemetrySpill', () => {
  it('追加后按 FIFO 补投，全部投出则清空文件', async () => {
    await withSpill(1024, async (spill, dir) => {
      await spill.init();
      await spill.append('a');
      await spill.append('b');

      const sent: string[] = [];
      const count = await spill.drain(raw => {
        sent.push(raw);
        return Promise.resolve();
      });

      expect(count).toBe(2);
      expect(sent).toEqual(['a', 'b']);
      expect(spill.sizeBytes).toBe(0);
      expect(await readFile(join(dir, FILE), 'utf8')).toBe('');
    });
  });

  it('投递中途失败时只移除已确认的行（投成功才删）', async () => {
    await withSpill(1024, async (spill, dir) => {
      await spill.init();
      await spill.append('a');
      await spill.append('b');
      await spill.append('c');

      const sent: string[] = [];
      const count = await spill.drain(raw => {
        if (raw === 'c') return Promise.reject(new Error('队列又断了'));
        sent.push(raw);
        return Promise.resolve();
      });

      expect(count).toBe(2);
      expect(sent).toEqual(['a', 'b']);
      // b 之后的行必须还在——重复投是安全的，反过来会丢
      expect(await readFile(join(dir, FILE), 'utf8')).toBe('c\n');
    });
  });

  it('超过上限时 append 返回 false', async () => {
    await withSpill(1, async spill => {
      await spill.init();
      expect(await spill.append('too-big')).toBe(false);
      expect(spill.overflowed).toBe(true);
    });
  });

  it('init 读回已有缓冲的体积（重启接着用同一份缓冲）', async () => {
    await withSpill(1024, async (spill, dir) => {
      await spill.init();
      await writeFile(join(dir, FILE), 'x\ny\n', 'utf8');

      const reopened = new TelemetrySpill(dir, 1024);
      await reopened.init();

      expect(reopened.sizeBytes).toBe(4);
      expect(reopened.overflowed).toBe(false);
    });
  });
});
