// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const addIconMock = vi.hoisted(() => vi.fn());
vi.mock('@iconify/vue/dist/offline', () => ({ addIcon: addIconMock }));

describe('offlineIcon 本地菜单图标注册', () => {
  it('导入即把 35 个图标以 getSvgInfo 解析结果 addIcon 登记', async () => {
    await import('./offlineIcon');
    expect(addIconMock).toHaveBeenCalledTimes(35);
    expect(addIconMock.mock.calls[0][0]).toBe('ep/menu');
    expect(addIconMock.mock.calls[0][1]).toEqual({
      width: 0,
      height: 0,
      body: ''
    });
    expect(addIconMock.mock.calls[8][0]).toBe('ri/mind-map');
  });
});
