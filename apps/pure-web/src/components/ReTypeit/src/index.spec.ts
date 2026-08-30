// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';

import type { Options as TypeItOptions } from 'typeit';

const goMock = vi.hoisted(() => vi.fn());
const TypeItMock = vi.hoisted(() =>
  vi.fn(function (
    this: { go: typeof goMock },
    _el: unknown,
    _options: TypeItOptions
  ) {
    this.go = goMock;
  })
);
vi.mock('typeit', () => ({ default: TypeItMock }));

import TypeIt from './index';

const instanceSentinel = Symbol('typeit-instance');

afterEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'language', {
    value: 'en-US',
    configurable: true
  });
});

describe('TypeIt', () => {
  it('无默认槽：渲染内置 span.type-it 并以空配置创建实例，expose 实例', () => {
    goMock.mockReturnValue(instanceSentinel);
    const wrapper = mount(TypeIt);
    expect(TypeItMock).toHaveBeenCalledTimes(1);
    const [el, options] = TypeItMock.mock.calls[0] as [Element, TypeItOptions];
    expect((el as Element).classList.contains('type-it')).toBe(true);
    expect(options).toEqual({});
    expect(goMock).toHaveBeenCalledTimes(1);
    expect((wrapper.vm as unknown as { typeIt: unknown }).typeIt).toBe(
      instanceSentinel
    );
  });

  it('自定槽提供 .type-it 锚点且透传 options', () => {
    mount(TypeIt, {
      props: { options: { speed: 90 } },
      slots: { default: '<div class="type-it custom-anchor"></div>' }
    });
    const [el, options] = TypeItMock.mock.calls[0] as [Element, TypeItOptions];
    expect((el as Element).classList.contains('custom-anchor')).toBe(true);
    expect(options).toEqual({ speed: 90 });
  });

  it('缺少 .type-it 锚点：默认语言下抛英文 TypeError', () => {
    expect(() =>
      mount(TypeIt, { slots: { default: '<div>no-anchor</div>' } })
    ).toThrow(/Please make sure/);
  });

  it('zh-CN 环境：错误信息切中文', () => {
    Object.defineProperty(navigator, 'language', {
      value: 'zh-CN',
      configurable: true
    });
    expect(() =>
      mount(TypeIt, { slots: { default: '<div>no-anchor</div>' } })
    ).toThrow(/请确保/);
  });
});
