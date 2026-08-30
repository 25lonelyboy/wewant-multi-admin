import { mount, type VueWrapper } from '@vue/test-utils';
import type { Component } from 'vue';
import ElementPlus from 'element-plus';
import SvgIconStub from './svg-component-stub';

// jsdom 未实现 ResizeObserver（@pureadmin/utils useResizeObserver、el-scrollbar 依赖）
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

type MountEPGlobal = {
  plugins?: unknown[];
  directives?: Record<string, unknown>;
  components?: Record<string, unknown>;
  mocks?: Record<string, unknown>;
  provide?: Record<string | symbol, unknown>;
};

type MountEPOptions = {
  props?: Recordable;
  attrs?: Recordable;
  slots?: Recordable;
  global?: MountEPGlobal;
};

/**
 * B3 组件测试挂载 helper：
 * - ElementPlus 全插件（el-* 全局组件 + v-loading 等指令）
 * - v-tippy 指令空实现（tippy 实例行为无断言价值；需细测的 spec 自行 vi.mock vue-tippy）
 * - IconifyIconOffline / IconifyIconOnline 全局组件 stub
 *   （main.ts 全局注册，SFC/JSX 以 kebab 标签直接消费，如 bar.tsx、ReQrcode）
 * 注意：mock element-plus 渲染层的 spec 不走本 helper，直接 mount + 局部 global。
 */
export function mountWithEP(
  component: Component,
  options: MountEPOptions = {}
): VueWrapper {
  const { global: extraGlobal, ...rest } = options;
  return mount(
    component as never,
    {
      ...rest,
      global: {
        plugins: [ElementPlus, ...(extraGlobal?.plugins ?? [])],
        directives: { tippy: () => {}, ...(extraGlobal?.directives ?? {}) },
        components: {
          IconifyIconOffline: SvgIconStub,
          IconifyIconOnline: SvgIconStub,
          ...(extraGlobal?.components ?? {})
        },
        ...(extraGlobal?.mocks ? { mocks: extraGlobal.mocks } : {}),
        ...(extraGlobal?.provide ? { provide: extraGlobal.provide } : {})
      }
    } as never
  ) as unknown as VueWrapper;
}
