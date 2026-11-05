import { columnMatches } from './td-schema.js';

describe('列类型比对', () => {
  it('标量类型逐字比（不分大小写）', () => {
    expect(columnMatches('FLOAT', { type: 'FLOAT', length: 4 })).toBe(true);
    expect(columnMatches('INT', { type: 'INT', length: 4 })).toBe(true);
    expect(columnMatches('BOOL', { type: 'FLOAT', length: 4 })).toBe(false);
  });

  it('VARCHAR(n) 要同时对上类型与长度', () => {
    expect(columnMatches('VARCHAR(32)', { type: 'VARCHAR', length: 32 })).toBe(
      true
    );
    expect(columnMatches('VARCHAR(32)', { type: 'VARCHAR', length: 64 })).toBe(
      false
    );
    expect(columnMatches('VARCHAR(32)', { type: 'INT', length: 32 })).toBe(
      false
    );
  });
});
