import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TelemetrySpill } from './telemetry-spill.js';

// 默认走真实实现，只在需要时对单次调用注入失败——用于构造真实文件系统无法制造的
// "重读失败但后续写入仍可成功"（同一条路径上读失败必然连带写失败，无法隔离）。
jest.mock('node:fs/promises', () => {
  const actual =
    jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, readFile: jest.fn(actual.readFile) };
});

const readFileMock = readFile as unknown as jest.Mock;

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

  it('drain 的 send 中途 append 的新行不被覆盖丢失（drain × append 竞态）', async () => {
    await withSpill(1024, async (spill, dir) => {
      await spill.init();
      await spill.append('a');

      const sent: string[] = [];
      const count = await spill.drain(async raw => {
        sent.push(raw);
        // 在 drain 进行中（此刻 file 仍含旧快照）追加新行：
        // 若 drain 事后按旧快照整文件重写，这行会被覆盖掉。
        await spill.append('during-drain');
      });

      expect(count).toBe(1);
      expect(sent).toEqual(['a']);
      // 已确认投递的 'a' 与 drain 期间追加的行都必须还在
      expect(await readFile(join(dir, FILE), 'utf8')).toBe('during-drain\n');
      expect(spill.sizeBytes).toBe(Buffer.byteLength('during-drain\n'));
    });
  });

  it('drain 中途失败中止时，期间追加的行与未投出的行都保留且体积准确', async () => {
    await withSpill(1024, async (spill, dir) => {
      await spill.init();
      await spill.append('a');
      await spill.append('b');
      await spill.append('c');

      const count = await spill.drain(async raw => {
        if (raw === 'b') await spill.append('during-drain');
        // 'c' 投递失败：'b' 之后的行一律保留
        if (raw === 'c') throw new Error('队列又断了');
      });

      expect(count).toBe(2);
      expect(await readFile(join(dir, FILE), 'utf8')).toBe('c\nduring-drain\n');
      expect(spill.sizeBytes).toBe(Buffer.byteLength('c\nduring-drain\n'));
    });
  });

  it('drain 中途追加后把缓冲推过上限，append 返回 false 且 overflowed 为真', async () => {
    await withSpill('a\n'.length + 1, async (spill, dir) => {
      await spill.init();
      await spill.append('a');

      let withinLimit: boolean | undefined;
      const count = await spill.drain(async () => {
        // 追加一行后，落盘体积超过上限 ⇒ append 必须返回 false、overflowed 为真
        withinLimit = await spill.append('bb');
      });

      expect(count).toBe(1);
      expect(withinLimit).toBe(false);
      expect(spill.sizeBytes).toBe(Buffer.byteLength('bb\n'));
      expect(spill.overflowed).toBe(true);
      expect(await readFile(join(dir, FILE), 'utf8')).toBe('bb\n');
    });
  });

  it('收尾重读失败（非 ENOENT）时抛出，未投出行留在盘上、不凭空返回成功', async () => {
    await withSpill(1024, async (spill, dir) => {
      await spill.init();
      await spill.append('a');
      await spill.append('b');

      // 顶部快照读成功、send 途中把"收尾重读"注入一次非 ENOENT 失败（EIO）
      const eio = Object.assign(new Error('EIO'), { code: 'EIO' });
      await expect(
        spill.drain(raw => {
          if (raw === 'a') readFileMock.mockRejectedValueOnce(eio);
          return Promise.resolve();
        })
      ).rejects.toThrow();

      // 修复前会把重读失败当成空文件 ⇒ writeFile('') 抹掉两行并返回成功；
      // 修复后读失败即抛出、不写，两行原样留在盘上
      expect(await readFile(join(dir, FILE), 'utf8')).toBe('a\nb\n');
      expect(spill.sizeBytes).toBe(Buffer.byteLength('a\nb\n'));
    });
  });

  it('缓冲文件被外部删除时当作空缓冲，体积回零（overflowed 可复位）', async () => {
    await withSpill(3, async (spill, dir) => {
      await spill.init();
      await spill.append('a');
      await spill.append('b');
      expect(spill.overflowed).toBe(true);

      // 外部删除缓冲文件（ENOENT 是唯一"文件确实不在"的错误）
      await rm(join(dir, FILE), { force: true });

      const count = await spill.drain(() => Promise.resolve());

      expect(count).toBe(0);
      expect(spill.sizeBytes).toBe(0);
      expect(spill.overflowed).toBe(false);
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
