// @vitest-environment jsdom
// Canvas 豁免口径：裁剪绘制主体依赖 cropperjs + canvas 2d，jsdom 不可达；
// 本 spec mock cropperjs 边界后只覆盖实例创建、图片设置与裁剪事件接线逻辑；
// 绘制行不入覆盖率门禁（无 thresholds 键）。
// 双向登记：docs/governance/backlog.md「B4 ReCropper 转在用迁移」。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

/* ── mock: cropperjs（构造器 + 实例方法全部 stub） ── */
const cropperInstanceMocks = vi.hoisted(() => {
  const methods = {
    destroy: vi.fn(),
    reset: vi.fn(),
    rotate: vi.fn(),
    zoom: vi.fn(),
    move: vi.fn(),
    scaleX: vi.fn(),
    scaleY: vi.fn(),
    getCroppedCanvas: vi.fn(() => ({
      width: 100,
      height: 80,
      toBlob(cb: (b: Blob) => void) {
        cb(new Blob(['x']));
      },
      getContext: () => null
    })),
    getData: vi.fn(() => ({ x: 10, y: 20, width: 100, height: 80 }))
  };
  const calls: any[][] = [];
  // 必须用 function 而非箭头函数，以支持 new 调用
  function CropperCtor(this: any, ...args: any[]) {
    Object.assign(this, methods);
    calls.push(args);
  }
  return { CropperCtor, methods, calls };
});
vi.mock('cropperjs', () => ({
  default: cropperInstanceMocks.CropperCtor,
  __esModule: true
}));

/* ── mock: @pureadmin/utils（保留纯函数，stub 异步/DOM 依赖） ── */
vi.mock('@pureadmin/utils', async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>('@pureadmin/utils');
  return {
    ...actual,
    useResizeObserver: vi.fn(),
    delay: vi.fn((_ms: number) => Promise.resolve()),
    debounce: vi.fn((fn: Function) => fn),
    downloadByBase64: vi.fn()
  };
});

/* ── mock: vue-tippy ── */
vi.mock('vue-tippy', () => ({
  useTippy: vi.fn(() => ({
    show: vi.fn(),
    setProps: vi.fn(),
    destroy: vi.fn(),
    state: { value: { isShown: false, isVisible: false } }
  })),
  directive: {}
}));

/* ── mock: @/directives/longpress ── */
vi.mock('@/directives/longpress', () => ({
  longpress: {}
}));

/* ── mock: svg 子模块（*.svg?component → stub） ── */
vi.mock('./svg', () => {
  const stub = {
    name: 'SvgStub',
    render: () => null
  };
  return {
    Reload: stub,
    Upload: stub,
    ArrowH: stub,
    ArrowV: stub,
    ArrowUp: stub,
    ArrowDown: stub,
    ArrowLeft: stub,
    ChangeIcon: stub,
    ArrowRight: stub,
    RotateLeft: stub,
    SearchPlus: stub,
    RotateRight: stub,
    SearchMinus: stub,
    DownloadIcon: stub
  };
});

import ReCropper from './index';

function mountCropper(extraProps: Record<string, unknown> = {}) {
  return mount(ReCropper, {
    props: {
      src: 'test.png',
      ...extraProps
    },
    global: {
      directives: { tippy: () => {}, longpress: () => {} }
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  cropperInstanceMocks.calls.length = 0;
});

describe('ReCropper', () => {
  it('挂载后以 img 元素创建 Cropper 实例', async () => {
    const wrapper = mountCropper();
    await nextTick();
    expect(cropperInstanceMocks.calls).toHaveLength(1);
    // 第一个参数是 img DOM 元素
    const firstArg = cropperInstanceMocks.calls[0][0];
    expect(firstArg).toBeInstanceOf(HTMLImageElement);
    // 第二个参数含默认 options + ready / crop / zoom / cropmove 回调
    const opts = cropperInstanceMocks.calls[0][1];
    expect(opts).toHaveProperty('ready');
    expect(opts).toHaveProperty('crop');
    expect(opts).toHaveProperty('zoom');
    expect(opts).toHaveProperty('cropmove');
    wrapper.unmount();
  });

  it('src 为空时不渲染任何内容', () => {
    const wrapper = mountCropper({ src: '' });
    // render 返回 null，组件无 DOM 输出
    expect(wrapper.find('div').exists()).toBe(false);
    wrapper.unmount();
  });

  it('ready 回调触发 readied 事件', async () => {
    const wrapper = mountCropper();
    await nextTick();
    const opts = cropperInstanceMocks.calls[0][1];
    // 模拟 ready
    opts.ready();
    await vi.waitFor(() => {
      expect(wrapper.emitted('readied')).toBeTruthy();
    });
    wrapper.unmount();
  });

  it('crop / zoom / cropmove 回调触发 debounceRealTimeCroppered', async () => {
    const wrapper = mountCropper({ realTimePreview: true });
    await nextTick();
    const opts = cropperInstanceMocks.calls[0][1];
    // 先触发 ready
    opts.ready();
    // crop 回调 → 调用 debounce（已 mock 为直接执行）→ croppered → emit('cropper')
    opts.crop();
    // FileReader.readAsDataURL → onloadend 是异步的
    await vi.waitFor(() => {
      expect(wrapper.emitted('cropper')).toBeTruthy();
    });
    const payload = wrapper.emitted('cropper')![0][0] as any;
    expect(payload).toHaveProperty('base64');
    expect(payload).toHaveProperty('blob');
    expect(payload.info).toHaveProperty('size');
    expect(payload.info).toHaveProperty('width');
    wrapper.unmount();
  });

  it('realTimePreview=false 时 crop 不触发 cropper 事件', async () => {
    const wrapper = mountCropper({ realTimePreview: false });
    await nextTick();
    const opts = cropperInstanceMocks.calls[0][1];
    opts.ready();
    opts.crop();
    expect(wrapper.emitted('cropper')).toBeUndefined();
    wrapper.unmount();
  });

  it('circled=true 分支：走 getRoundedCanvas 路径', async () => {
    // jsdom 的 getContext('2d') 返回 null，需 mock canvas 上下文
    const ctxMock = {
      imageSmoothingEnabled: false,
      drawImage: vi.fn(),
      globalCompositeOperation: '',
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn()
    };
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'canvas') {
        (el as any).getContext = vi.fn(() => ctxMock);
      }
      return el;
    });
    const wrapper = mountCropper({ circled: true });
    await nextTick();
    const opts = cropperInstanceMocks.calls[0][1];
    opts.ready();
    opts.crop();
    // circled 模式下 getCroppedCanvas 被调用（getRoundedCanvas 内部使用）
    expect(cropperInstanceMocks.methods.getCroppedCanvas).toHaveBeenCalled();
    // 验证圆形裁剪路径：arc + fill 被调用
    await vi.waitFor(() => {
      expect(ctxMock.arc).toHaveBeenCalled();
      expect(ctxMock.fill).toHaveBeenCalled();
    });
    vi.restoreAllMocks();
    wrapper.unmount();
  });

  it('卸载时销毁 Cropper 实例', async () => {
    const wrapper = mountCropper();
    await nextTick();
    wrapper.unmount();
    expect(cropperInstanceMocks.methods.destroy).toHaveBeenCalledTimes(1);
  });

  it('options prop 合并到 Cropper 构造参数', async () => {
    const wrapper = mountCropper({
      options: { aspectRatio: 16 / 9 }
    });
    await nextTick();
    const opts = cropperInstanceMocks.calls[0][1];
    expect(opts.aspectRatio).toBe(16 / 9);
    wrapper.unmount();
  });
});
