import { Logger } from '@nestjs/common';
import type { TdSql } from '../tdengine/td-client.js';
import { dropCreatedTables, type CreatedTable } from './execute.js';

interface FakeTd {
  td: TdSql;
  statements: string[];
}

/** 前 `failures` 次 exec 抛错，之后成功 */
function fakeTd(failures = 0): FakeTd {
  const statements: string[] = [];
  let attempts = 0;
  const td: TdSql = {
    exec(sql: string): Promise<void> {
      attempts += 1;
      if (attempts <= failures) {
        return Promise.reject(new Error('tdengine 暂时不可用'));
      }
      statements.push(sql);
      return Promise.resolve();
    },
    query(): Promise<unknown[][]> {
      return Promise.resolve([]);
    },
    version(): Promise<string> {
      return Promise.resolve('3.4.2.8');
    },
    close(): Promise<void> {
      return Promise.resolve();
    }
  };
  return { td, statements };
}

describe('失败清理', () => {
  it('按逆序删除本次建的表，超表用 DROP STABLE、子表用 DROP TABLE', async () => {
    const { td, statements } = fakeTd();
    const created: CreatedTable[] = [
      { db: 'wewant_iot', name: 'raw_stable', kind: 'stable' },
      { db: 'wewant_iot', name: 'raw_sub', kind: 'table' }
    ];
    await dropCreatedTables(td, created, new Logger('test'), {
      modelCode: 'm'
    });
    expect(statements).toEqual([
      'DROP TABLE wewant_iot.raw_sub',
      'DROP STABLE wewant_iot.raw_stable'
    ]);
  });

  it('单张失败重试后成功', async () => {
    const { td, statements } = fakeTd(2);
    await dropCreatedTables(
      td,
      [{ db: 'wewant_iot', name: 'raw_sub', kind: 'table' }],
      new Logger('test'),
      {}
    );
    expect(statements).toEqual(['DROP TABLE wewant_iot.raw_sub']);
  });

  it('重试仍失败只记日志，继续删下一张', async () => {
    const { td, statements } = fakeTd(6);
    const logger = new Logger('test');
    const error = jest.spyOn(logger, 'error').mockImplementation(() => {});
    await dropCreatedTables(
      td,
      [
        { db: 'wewant_iot', name: 'first', kind: 'table' },
        { db: 'wewant_iot', name: 'second', kind: 'table' }
      ],
      logger,
      { modelCode: 'm', localDeviceId: 'dev' }
    );
    // 第一张耗尽三次仍未删掉；第二张也耗尽，但循环没有中断
    expect(statements).toEqual([]);
    expect(error).toHaveBeenCalledTimes(2);
    // 逆序：先删后建的 second，再删 first
    expect(error.mock.calls[0][0]).toContain('second');
    expect(error.mock.calls[1][0]).toContain('first');
  });
});
