// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const tippyInstance = vi.hoisted(() => ({
  setProps: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn()
}));
const useTippyMock = vi.hoisted(() => vi.fn(() => tippyInstance));
vi.mock('vue-tippy', () => ({ useTippy: useTippyMock }));

import ReText from './index.vue';
import { mountWithEP } from '@/test-utils/mount';

function setMetrics(
  el: Element,
  metrics: Partial<
    Record<
      'scrollWidth' | 'clientWidth' | 'scrollHeight' | 'clientHeight',
      number
    >
  >
) {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(el, key, { value, configurable: true });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReText', () => {
  it('挂载时用默认槽内容初始化 tippy 实例', () => {
    const wrapper = mountWithEP(ReText, { slots: { default: 'hello' } });
    expect(useTippyMock).toHaveBeenCalledTimes(1);
    expect((wrapper.element as HTMLElement).textContent).toContain('hello');
    // 未传 tippyProps 时走默认空对象工厂，props 仅 content
    expect(useTippyMock.mock.calls[0][1]).toHaveProperty('content');
  });

  it('单行省略：溢出时悬停启用 tippy 并刷新 props', async () => {
    const wrapper = mountWithEP(ReText, { slots: { default: 'x' } });
    const elText = wrapper.find('.el-text');
    setMetrics(elText.element, { scrollWidth: 100, clientWidth: 50 });
    await elText.trigger('mouseover');
    expect(tippyInstance.setProps).toHaveBeenCalledTimes(1);
    expect(tippyInstance.enable).toHaveBeenCalledTimes(1);
    expect(tippyInstance.disable).not.toHaveBeenCalled();
  });

  it('单行省略：未溢出时悬停禁用 tippy', async () => {
    const wrapper = mountWithEP(ReText, { slots: { default: 'x' } });
    const elText = wrapper.find('.el-text');
    setMetrics(elText.element, { scrollWidth: 30, clientWidth: 50 });
    await elText.trigger('mouseover');
    expect(tippyInstance.disable).toHaveBeenCalledTimes(1);
    expect(tippyInstance.enable).not.toHaveBeenCalled();
  });

  it('多行省略（lineClamp）：按 scrollHeight/clientHeight 判断溢出', async () => {
    const wrapper = mountWithEP(ReText, {
      props: { lineClamp: 2 },
      slots: { default: 'x' }
    });
    const elText = wrapper.find('.el-text');
    setMetrics(elText.element, { scrollHeight: 80, clientHeight: 40 });
    await elText.trigger('mouseover');
    expect(tippyInstance.enable).toHaveBeenCalledTimes(1);
  });

  it('content 槽优先于默认槽作为 tippy 内容；tippyProps 并入实例配置', () => {
    mountWithEP(ReText, {
      props: { tippyProps: { placement: 'top' } },
      slots: { default: 'd', content: '<b>tip</b>' }
    });
    const initProps = useTippyMock.mock.calls[0][1] as Recordable;
    expect(initProps).toMatchObject({ placement: 'top' });
    expect(initProps).toHaveProperty('content');
  });
});
