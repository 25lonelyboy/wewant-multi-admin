import { describe, it, expect, beforeEach } from 'vitest';
import { useMultiFrame } from './useMultiFrame';

beforeEach(() => {
  const { MAP } = useMultiFrame();
  MAP.clear();
});

describe('useMultiFrame', () => {
  it('setMap + getMap：按 path 存储和获取组件', () => {
    const { setMap, getMap } = useMultiFrame();
    const fakeComp = { name: 'TestComp' } as any;
    setMap('/frame/a', fakeComp);
    expect(getMap('/frame/a')).toBe(fakeComp);
  });

  it('getMap：path 不存在返回 undefined', () => {
    const { getMap } = useMultiFrame();
    expect(getMap('/no-such')).toBeUndefined();
  });

  it('getMap：无参返回全部 entries', () => {
    const { setMap, getMap } = useMultiFrame();
    const comp1 = { name: 'C1' } as any;
    const comp2 = { name: 'C2' } as any;
    setMap('/a', comp1);
    setMap('/b', comp2);
    const entries = getMap() as [string, any][];
    expect(entries).toHaveLength(2);
    expect(entries.map(e => e[0])).toEqual(['/a', '/b']);
  });

  it('delMap：删除指定 path', () => {
    const { setMap, getMap, delMap } = useMultiFrame();
    setMap('/x', { name: 'X' } as any);
    delMap('/x');
    expect(getMap('/x')).toBeUndefined();
  });

  it('MAP 是共享实例', () => {
    const { setMap, MAP } = useMultiFrame();
    setMap('/shared', { name: 'S' } as any);
    expect(MAP.size).toBe(1);
  });
});
