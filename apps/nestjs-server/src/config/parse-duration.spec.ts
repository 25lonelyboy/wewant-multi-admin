import { parseDurationToSeconds } from './parse-duration.js';

describe('parseDurationToSeconds', () => {
  it.each([
    ['90s', 90],
    ['15m', 900],
    ['12h', 43200],
    ['7d', 604800],
    [' 15m ', 900]
  ])('解析 %s → %i', (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected);
  });

  it.each(['', 'abc', '15x', 'm15', '-5m', '1.5h'])(
    '非法输入 %j 抛错',
    input => {
      expect(() => parseDurationToSeconds(input)).toThrow(/非法时长格式/);
    }
  );
});
