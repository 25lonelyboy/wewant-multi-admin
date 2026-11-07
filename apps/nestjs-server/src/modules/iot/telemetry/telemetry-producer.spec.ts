import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Queue } from 'bullmq';
import {
  TelemetryProducer,
  type TelemetryProducerOptions
} from './telemetry-producer.js';

// 只替换 Queue：生产者对其余依赖（本地缓冲、logger）走真实实现，
// 以便验证"落缓冲"确实是文件里的字节，而非桩上的调用。
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined)
  }))
}));

const QueueMock = Queue as unknown as jest.Mock;

const SPILL_FILE = 'telemetry-spill.ndjson';

/** 最近一次构造出来的 Queue 实例上的 add 替身 */
function lastAdd(): jest.Mock {
  return (QueueMock.mock.results.at(-1)!.value as { add: jest.Mock }).add;
}

function options(
  spillDir: string,
  spillMaxBytes: number,
  overrides: Partial<TelemetryProducerOptions> = {}
): TelemetryProducerOptions {
  return {
    queueRedisUrl: 'redis://127.0.0.1:6379',
    spillDir,
    spillMaxBytes,
    maxMessageBytes: 262_144,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    },
    onSpillOverflow: jest.fn(),
    onSpillFailure: jest.fn(),
    ...overrides
  };
}

describe('TelemetryProducer.send 去向', () => {
  beforeEach(() => QueueMock.mockClear());

  it('入队成功 ⇒ enqueued', async () => {
    const producer = new TelemetryProducer(options('unused', 1024));
    lastAdd().mockResolvedValue(undefined);

    await expect(producer.send('a')).resolves.toBe('enqueued');
  });

  it('入队失败 ⇒ 落本地缓冲，返回 spilled，且这一条确实写进了文件', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'producer-'));
    try {
      const producer = new TelemetryProducer(options(dir, 1024));
      lastAdd().mockRejectedValue(new Error('队列断了'));

      await expect(producer.send('a')).resolves.toBe('spilled');
      expect(await readFile(join(dir, SPILL_FILE), 'utf8')).toBe('a\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('落缓冲把缓冲推过上限 ⇒ 本次 spilled 并告警一次；其后 send 立即 dropped', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'producer-'));
    const onSpillOverflow = jest.fn();
    try {
      const producer = new TelemetryProducer(
        options(dir, 1, { onSpillOverflow })
      );
      lastAdd().mockRejectedValue(new Error('队列断了'));

      // 'a\n' 已是 2 字节 ≥ 上限 1：写入成功，同时触发超限告警
      await expect(producer.send('a')).resolves.toBe('spilled');
      expect(onSpillOverflow).toHaveBeenCalledTimes(1);

      // 已超限：静默丢弃——不入队、不落盘、不重复告警
      await expect(producer.send('b')).resolves.toBe('dropped');
      expect(onSpillOverflow).toHaveBeenCalledTimes(1);
      expect(await readFile(join(dir, SPILL_FILE), 'utf8')).toBe('a\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('落缓冲本身失败（目录不可写）⇒ dropped 且响亮告警', async () => {
    const base = await mkdtemp(join(tmpdir(), 'producer-'));
    const missing = join(base, 'missing-dir');
    const onSpillFailure = jest.fn();
    try {
      const producer = new TelemetryProducer(
        options(missing, 1024, { onSpillFailure })
      );
      lastAdd().mockRejectedValue(new Error('队列断了'));

      await expect(producer.send('a')).resolves.toBe('dropped');
      expect(onSpillFailure).toHaveBeenCalledTimes(1);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe('TelemetryProducer 报文上限', () => {
  beforeEach(() => QueueMock.mockClear());

  it('超限：不入队、不落盘，返回 oversized', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'producer-'));
    try {
      const producer = new TelemetryProducer(
        options(dir, 1024, { maxMessageBytes: 4 })
      );
      lastAdd().mockResolvedValue(undefined);

      await expect(producer.send('12345')).resolves.toBe('oversized');
      expect(lastAdd()).not.toHaveBeenCalled();
      expect(producer.spillBytes).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('恰好等于上限放行', async () => {
    const producer = new TelemetryProducer(
      options('unused', 1024, { maxMessageBytes: 5 })
    );
    lastAdd().mockResolvedValue(undefined);

    await expect(producer.send('12345')).resolves.toBe('enqueued');
  });

  it('按字节算：中文 2 字符 = 6 字节，超过 5 字节上限即拒', async () => {
    const producer = new TelemetryProducer(
      options('unused', 1024, { maxMessageBytes: 5 })
    );
    lastAdd().mockResolvedValue(undefined);

    expect(Buffer.byteLength('中文', 'utf8')).toBe(6);
    await expect(producer.send('中文')).resolves.toBe('oversized');
  });

  it('队列不可达时超限报文仍被拒，不落本地缓冲', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'producer-'));
    try {
      const producer = new TelemetryProducer(
        options(dir, 1024, { maxMessageBytes: 4 })
      );
      lastAdd().mockRejectedValue(new Error('队列断了'));

      await expect(producer.send('12345')).resolves.toBe('oversized');
      expect(producer.spillBytes).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('日志限频：同一秒只 warn 一条，其后降为 debug；下一秒重新 warn', async () => {
    const warn = jest.fn();
    const debug = jest.fn();
    let now = 1_000_000;
    const producer = new TelemetryProducer(
      options('unused', 1024, {
        maxMessageBytes: 1,
        logger: { info: jest.fn(), warn, error: jest.fn(), debug },
        now: () => now
      })
    );

    await producer.send('ab');
    await producer.send('cd');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledTimes(1);
    const messages = (warn.mock.calls as unknown[][]).map(call =>
      String(call[0])
    );
    expect(messages[0]).toContain('累计 1 条');

    now += 1_000;
    await producer.send('ef');
    expect(warn).toHaveBeenCalledTimes(2);
    const afterMessages = (warn.mock.calls as unknown[][]).map(call =>
      String(call[0])
    );
    expect(afterMessages[1]).toContain('累计 3 条');
  });
});
