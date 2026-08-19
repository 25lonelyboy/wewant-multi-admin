import { alive, normalizePageQuery, pageResult } from './system-shared.js';

describe('system shared 工具', () => {
  describe('alive()', () => {
    it('返回软删过滤片段且可展开进 Prisma where', () => {
      expect(alive()).toEqual({ deletedAt: null });
      expect({ ...alive(), status: 'ACTIVE' }).toEqual({
        deletedAt: null,
        status: 'ACTIVE'
      });
    });
  });

  describe('normalizePageQuery', () => {
    it('默认 page=1 pageSize=10', () => {
      expect(normalizePageQuery({})).toEqual({
        page: 1,
        pageSize: 10,
        skip: 0,
        take: 10
      });
    });

    it('兜底钳制：page 下限 1、pageSize 上限 100', () => {
      expect(normalizePageQuery({ page: 0, pageSize: 500 })).toEqual({
        page: 1,
        pageSize: 100,
        skip: 0,
        take: 100
      });
    });

    it('skip = (page - 1) * pageSize', () => {
      expect(normalizePageQuery({ page: 3, pageSize: 20 })).toEqual({
        page: 3,
        pageSize: 20,
        skip: 40,
        take: 20
      });
    });
  });

  it('pageResult 组装 {items,total,page,pageSize}', () => {
    expect(pageResult([1, 2], 42, 2, 10)).toEqual({
      items: [1, 2],
      total: 42,
      page: 2,
      pageSize: 10
    });
  });
});
