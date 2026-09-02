// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  menuTypeOptions,
  showLinkOptions,
  fixedTagOptions,
  keepAliveOptions,
  hiddenTagOptions,
  showParentOptions,
  frameLoadingOptions
} from './enums';

describe('menu enums', () => {
  it('menuTypeOptions 有 4 项（0-3）', () => {
    expect(menuTypeOptions).toHaveLength(4);
    expect(menuTypeOptions.map(o => o.value)).toEqual([0, 1, 2, 3]);
  });

  it('showLinkOptions 为 true/false 二值', () => {
    expect(showLinkOptions).toHaveLength(2);
    expect(showLinkOptions.map(o => o.value)).toEqual([true, false]);
  });

  it('fixedTagOptions / keepAliveOptions / hiddenTagOptions / showParentOptions / frameLoadingOptions 均为 2 项', () => {
    for (const opts of [
      fixedTagOptions,
      keepAliveOptions,
      hiddenTagOptions,
      showParentOptions,
      frameLoadingOptions
    ]) {
      expect(opts).toHaveLength(2);
      expect(opts.map(o => o.value).sort()).toEqual([false, true]);
    }
  });

  it('所有选项均有 label', () => {
    for (const opts of [
      menuTypeOptions,
      showLinkOptions,
      fixedTagOptions,
      keepAliveOptions,
      hiddenTagOptions,
      showParentOptions,
      frameLoadingOptions
    ]) {
      for (const opt of opts) {
        expect(opt.label).toBeTruthy();
      }
    }
  });
});
