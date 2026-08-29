// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Print from './print';

describe('extendOptions', () => {
  it('浅合并 obj2 到 obj 并返回 obj', () => {
    const p = Object.create(Print.prototype) as {
      extendOptions: <T>(obj: object, obj2: T) => T;
    };
    const target = { a: 1 };
    const result = p.extendOptions(target, { b: 2, a: 3 });
    expect(result).toBe(target);
    expect(result).toEqual({ a: 3, b: 2 });
  });

  it('缺省 obj2 不改变 obj', () => {
    const p = Object.create(Print.prototype) as {
      extendOptions: (obj: object, obj2?: object) => object;
    };
    const target = { a: 1 };
    expect(p.extendOptions(target)).toBe(target);
  });
});

describe('conf 合并（构造器）', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="print">Hi</div>';
    vi.spyOn(Print.prototype, 'init').mockImplementation(function (
      this: unknown
    ) {
      return undefined;
    });
  });

  it('options 同名键覆盖 conf 缺省', () => {
    const printBeforeFn = vi.fn();
    const p = new (
      Print as unknown as new (
        dom: string,
        options?: object
      ) => {
        conf: {
          styleStr: string;
          printBeforeFn: unknown;
          printDoneCallBack: unknown;
        };
      }
    )('#print', { styleStr: '.x{}', printBeforeFn });
    expect(p.conf.styleStr).toBe('.x{}');
    expect(typeof p.conf.printBeforeFn).toBe('function');
    expect(p.conf.printDoneCallBack).toBeNull();
  });

  it('setDomHeightArr 非空时构造器内联动调用 setDomHeight', () => {
    const setDomHeight = vi
      .spyOn(
        Print.prototype as { setDomHeight: (arr: string[]) => unknown },
        'setDomHeight'
      )
      .mockImplementation(() => undefined);
    new (Print as unknown as new (dom: string, options?: object) => unknown)(
      '#print',
      {
        setDomHeightArr: ['.a']
      }
    );
    expect(setDomHeight).toHaveBeenCalledWith(['.a']);
  });
});

describe('getStyle', () => {
  it('拼接 style/link outerHTML 与 no-print 遮罩样式', () => {
    document.head.innerHTML =
      '<style>.a{color:red}</style><link rel="stylesheet">';
    const p = Object.create(Print.prototype) as {
      conf: { styleStr: string };
      getStyle: () => string;
    };
    p.conf = { styleStr: '.hidden{}' };
    const str = p.getStyle();
    expect(str).toContain('.a{color:red}');
    expect(str).toContain('.no-print{display:none;}');
    expect(str).toContain('.hidden{}');
  });
});

describe('isDOM', () => {
  it('HTMLElement 分支判断真实元素', () => {
    const p = Object.create(Print.prototype) as {
      isDOM: (obj: unknown) => boolean;
    };
    expect(p.isDOM(document.createElement('div'))).toBe(true);
    expect(p.isDOM({})).toBe(false);
  });
});
