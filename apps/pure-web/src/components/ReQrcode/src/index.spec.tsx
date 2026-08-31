// @vitest-environment jsdom
// Canvas 豁免口径：二维码绘制主体（qrcode 库 + canvas 2d）jsdom 不可达，
// 本 spec mock qrcode 边界后只覆盖组件分支逻辑；绘制行不入覆盖率门禁（无 thresholds 键）。
// 双向登记：docs/governance/backlog.md「B3 Canvas 绘制豁免回补」。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

const toCanvasMock = vi.hoisted(() =>
  vi.fn(
    async (canvas: HTMLCanvasElement, _text: string, _opts?: Recordable) => {
      Object.defineProperty(canvas, 'width', { value: 33, configurable: true });
      (canvas as HTMLCanvasElement & { toDataURL: () => string }).toDataURL =
        vi.fn(() => 'data:image/png;base64,MOCK');
      return canvas;
    }
  )
);
const toDataURLMock = vi.hoisted(() =>
  vi.fn(async () => 'data:image/png;base64,IMG')
);
vi.mock('qrcode', () => ({
  default: { toCanvas: toCanvasMock, toDataURL: toDataURLMock }
}));

import ReQrcode from './index';
import SvgIconStub from '@/test-utils/svg-component-stub';

const mountQr = (props: Recordable = {}) =>
  mount(ReQrcode, {
    props,
    global: {
      directives: { loading: () => {} },
      components: { IconifyIconOffline: SvgIconStub }
    }
  });

beforeEach(() => {
  toCanvasMock.mockClear();
  toDataURLMock.mockClear();
});

describe('ReQrcode', () => {
  it('canvas 分支：短文本默认容错 H，scale 按宽度折算，done 回传 dataURL', async () => {
    const wrapper = mountQr({ text: 'abc', width: 100 });
    await vi.waitFor(() => expect(wrapper.emitted('done')).toBeTruthy());
    // getOriginWidth 探测 + 正式绘制 = 2 次
    expect(toCanvasMock).toHaveBeenCalledTimes(2);
    const last = (toCanvasMock.mock.calls as any[]).at(-1)![2] as Recordable;
    expect(last.errorCorrectionLevel).toBe('H');
    expect(last.scale).toBeCloseTo((100 / 33) * 4);
    expect(wrapper.emitted('done')![0]).toEqual(['data:image/png;base64,MOCK']);
  });

  it('容错档位：>16 字符 Q、>36 字符 M', async () => {
    const w1 = mountQr({ text: 'x'.repeat(20) });
    await vi.waitFor(() => expect(w1.emitted('done')).toBeTruthy());
    const w2 = mountQr({ text: 'x'.repeat(40) });
    await vi.waitFor(() => expect(w2.emitted('done')).toBeTruthy());
    const levels = (toCanvasMock.mock.calls as any[])
      .filter((c: any[]) => (c[1] as string).startsWith('x'))
      .map((c: any[]) => (c[2] as Recordable).errorCorrectionLevel);
    expect(levels).toEqual(['Q', 'Q', 'M', 'M']);
  });

  it('img 分支：toDataURL 写 src；width 0 时 scale 为 undefined', async () => {
    const wrapper = mountQr({ text: 'abc', tag: 'img' });
    await vi.waitFor(() => expect(wrapper.emitted('done')).toBeTruthy());
    expect(toDataURLMock).toHaveBeenCalledWith(
      'abc',
      expect.objectContaining({ errorCorrectionLevel: 'H', width: 200 })
    );
    expect(wrapper.find('img').attributes('src')).toBe(
      'data:image/png;base64,IMG'
    );
    const zero = mountQr({ text: 'abc', width: 0 });
    await vi.waitFor(() => expect(zero.emitted('done')).toBeTruthy());
    expect(
      ((toCanvasMock.mock.calls as any[]).at(-1)![2] as Recordable).scale
    ).toBeUndefined();
  });

  it('text 为空：watch 早退不初始化', () => {
    mountQr({ text: '' });
    expect(toCanvasMock).not.toHaveBeenCalled();
  });

  it('logo 分支：jsdom 无 2d context 早退（Canvas 豁免边界）', async () => {
    const wrapper = mountQr({ text: 'abc', logo: 'logo.png' });
    // getContext('2d') 为 null → createLogoCode 早退，done 以 undefined 发射
    await vi.waitFor(() => expect(toCanvasMock).toHaveBeenCalledTimes(2));
    expect(wrapper.emitted('done')).toEqual([[undefined]]);
  });

  it('disabled：覆盖层渲染 + disabled-click；正常态点击发 click', async () => {
    const wrapper = mountQr({
      text: 'abc',
      disabled: true,
      disabledText: '已过期'
    });
    expect(wrapper.find('.qrcode--disabled').exists()).toBe(true);
    expect(wrapper.text()).toContain('已过期');
    await wrapper.find('.qrcode--disabled').trigger('click');
    expect(wrapper.emitted('disabled-click')).toHaveLength(1);
    const normal = mountQr({ text: 'abc' });
    await normal.find('canvas').trigger('click');
    expect(normal.emitted('click')).toHaveLength(1);
  });
});
