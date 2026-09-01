// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { bg, avatar, illustration } from './static';

describe('login/utils/static', () => {
  it('导出 bg 背景图路径', () => {
    expect(bg).toBeDefined();
  });
  it('导出 avatar 和 illustration SVG 组件', () => {
    expect(avatar).toBeDefined();
    expect(illustration).toBeDefined();
  });
});
