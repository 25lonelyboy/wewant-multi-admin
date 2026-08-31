// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import { store } from '@/store';

const sortableCreateMock = vi.hoisted(() => vi.fn());

// vi.hoisted 工厂同步执行，此时 vue 导入尚未初始化，
// 故使用纯对象组件（Vue 3 接受 { setup } 或 { render }  plain object 作为组件）。
const epMocks = vi.hoisted(() => ({
  ElPopover: {
    setup(_p: any, { slots }: any) {
      return () =>
        h('div', { class: 'ep-popover' }, [
          slots.reference?.(),
          slots.default?.()
        ]);
    }
  },
  ElDropdown: {
    setup(_p: any, { slots }: any) {
      return () =>
        h('div', { class: 'ep-dropdown' }, [
          slots.default?.(),
          slots.dropdown?.()
        ]);
    }
  },
  ElDropdownMenu: {
    setup(_p: any, { slots }: any) {
      return () => h('div', { class: 'ep-dropdown-menu' }, slots.default?.());
    }
  },
  ElDropdownItem: {
    setup(_p: any, { slots, attrs }: any) {
      return () =>
        h(
          'div',
          { class: 'ep-dropdown-item', onClick: attrs.onClick },
          slots.default?.()
        );
    }
  },
  ElCheckbox: {
    props: ['modelValue', 'label', 'value', 'indeterminate'],
    emits: ['change'],
    setup(props: any, { slots, emit }: any) {
      return () =>
        h('label', { class: 'ep-checkbox' }, [
          h('input', {
            type: 'checkbox',
            checked: props.modelValue,
            onChange: (e: Event) =>
              emit('change', (e.target as HTMLInputElement).checked)
          }),
          slots.default?.() ?? props.label
        ]);
    }
  },
  ElCheckboxGroup: {
    props: ['modelValue'],
    emits: ['change'],
    setup(_p: any, { slots }: any) {
      return () => h('div', { class: 'ep-checkbox-group' }, slots.default?.());
    }
  },
  ElScrollbar: {
    setup(_p: any, { slots }: any) {
      return () => h('div', { class: 'ep-scrollbar' }, slots.default?.());
    }
  },
  ElSpace: {
    setup(_p: any, { slots }: any) {
      return () => h('div', { class: 'ep-space' }, slots.default?.());
    }
  },
  ElDivider: {
    render: () => h('hr', { class: 'ep-divider' })
  },
  ElButton: {
    setup(_p: any, { slots, attrs }: any) {
      return () =>
        h(
          'button',
          { class: 'ep-button', onClick: attrs.onClick },
          slots.default?.()
        );
    }
  }
}));

vi.mock('sortablejs', () => ({
  default: { create: sortableCreateMock }
}));
vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));
vi.mock('element-plus', () => epMocks);

// ~icons/* 四枚导入由 vitest alias stub 接住；
// 但 @iconify/vue 内部 addIcon 在 jsdom 中可能产生 data URL，显式 mock 避开。
const IconStubSvg = vi.hoisted(() => ({
  render: () => h('svg')
}));
vi.mock('~icons/bi/pin-angle', () => ({ default: IconStubSvg }));
vi.mock('~icons/bi/pin-angle-fill', () => ({ default: IconStubSvg }));
vi.mock('~icons/ri/fullscreen-fill', () => ({ default: IconStubSvg }));
vi.mock('~icons/ri/fullscreen-exit-fill', () => ({ default: IconStubSvg }));

import PureTableBar from './bar';
import SvgIconStub from '@/test-utils/svg-component-stub';

const columns: Recordable[] = [
  { label: '甲', prop: 'a' },
  { label: '乙', prop: 'b', hide: true },
  { label: '丙', prop: 'c' }
];

// JSX 中 kebab-case EP 标签（el-divider 等）依赖 Vue 运行时 resolveComponent，
// 使用 app.mixin beforeCreate 将 EP mock 组件直接注入共享 appContext.components，
// 确保 resolveComponent('el-divider') 等能正确找到 mock。
const epMixin = {
  beforeCreate(this: any) {
    // Vue 3 内部：instance.appContext = app._context
    const ctx = this?.$?.appContext ?? this?.$.appContext;
    if (ctx?.components) {
      Object.assign(ctx.components, epMocks);
    }
  }
};

function mountBar(options: Recordable = {}) {
  return mount(PureTableBar, {
    props: { columns: columns as never, ...options.props },
    slots: {
      default:
        options.slotDefault ??
        (({ size, dynamicColumns }: Recordable) =>
          h(
            'div',
            { class: 'slot-default', 'data-size': size },
            JSON.stringify(dynamicColumns.map((c: Recordable) => c.label))
          ))
    },
    global: {
      directives: { tippy: () => {} },
      components: {
        IconifyIconOffline: SvgIconStub,
        IconifyIconOnline: SvgIconStub
      },
      mixins: [epMixin],
      plugins: [store]
    }
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  sortableCreateMock.mockClear();
});

afterEach(() => vi.useRealTimers());

describe('PureTableBar', () => {
  it('标题：默认 props.title（i18n key 直出）；title 槽覆盖', () => {
    expect(mountBar().find('p.font-bold').text()).toBe('tableBar.pureList');
    const wrapper = mount(PureTableBar, {
      props: { columns: [] as never },
      slots: {
        title: () => h('b', { class: 'slot-title' }, 'T'),
        default: () => h('i')
      },
      global: {
        directives: { tippy: () => {} },
        components: { IconifyIconOffline: SvgIconStub },
        mixins: [epMixin],
        plugins: [store]
      }
    });
    expect(wrapper.find('.slot-title').exists()).toBe(true);
  });

  it('buttons 槽渲染到工具区', () => {
    const wrapper = mountBar();
    expect(wrapper.find('.flex.mr-4').exists()).toBe(false);
    const withBtn = mount(PureTableBar, {
      props: { columns: [] as never },
      slots: {
        buttons: () => h('button', { class: 'slot-btn' }),
        default: () => h('i')
      },
      global: {
        directives: { tippy: () => {} },
        components: { IconifyIconOffline: SvgIconStub },
        mixins: [epMixin],
        plugins: [store]
      }
    });
    expect(withBtn.find('.slot-btn').exists()).toBe(true);
  });

  it('refresh：emit refresh 且 loading 500ms 后回落', async () => {
    const wrapper = mountBar();
    const svgs = wrapper.findAll('svg');
    const refreshSvg = svgs.find(s => s.classes().includes('w-4'));
    expect(refreshSvg).toBeDefined();
    await refreshSvg!.trigger('click');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
    // 点击后 loading=true，该 svg 应含 animate-spin
    expect(wrapper.find('svg.animate-spin').exists()).toBe(true);
    // 推进 fake timer 让 delay(500) 的 .then 回调执行
    await vi.advanceTimersByTimeAsync(600);
    expect(wrapper.find('svg.animate-spin').exists()).toBe(false);
  });

  it('fullscreen：点击末位图标翻转并 emit，容器切全屏类', async () => {
    const wrapper = mountBar();
    // ~icons/* 渲染为 <svg>；全屏图标为末位带 w-4 class 的 svg
    const w4Svgs = wrapper
      .findAll('svg')
      .filter(s => s.classes().includes('w-4'));
    const fullscreenIcon = w4Svgs.at(-1)!;
    await fullscreenIcon.trigger('click');
    expect(wrapper.emitted('fullscreen')?.at(-1)).toEqual([true]);
    expect(wrapper.find('.fixed').exists()).toBe(true);
    await fullscreenIcon.trigger('click');
    expect(wrapper.emitted('fullscreen')?.at(-1)).toEqual([false]);
  });

  it('expand：tableRef.size 存在时渲染展开钮，点击递归 toggle 子树', async () => {
    const toggleRowExpansion = vi.fn();
    const tableRef = {
      size: 'default',
      data: [{ id: 1, children: [{ id: 2 }, { id: 3, children: null }] }],
      toggleRowExpansion
    };
    const wrapper = mountBar({ props: { tableRef } });
    const svgs = wrapper.findAll('svg');
    const expandSvg = svgs.find(s => s.classes().includes('w-4'));
    expect(expandSvg).toBeDefined();
    await expandSvg!.trigger('click');
    expect(toggleRowExpansion).toHaveBeenCalledTimes(3);
    expect(toggleRowExpansion).toHaveBeenNthCalledWith(
      1,
      tableRef.data[0],
      false
    );
  });

  it('density：三档切换改写默认槽 size 参数', async () => {
    const wrapper = mountBar();
    const items = wrapper.findAll('.ep-dropdown-item');
    expect(items.map(i => i.text())).toEqual([
      'tableBar.pureLarge',
      'tableBar.pureDefault',
      'tableBar.pureSmall'
    ]);
    await items[2].trigger('click');
    expect(wrapper.find('.slot-default').attributes('data-size')).toBe('small');
  });

  it('列显隐：全选/单选/重置三联动', async () => {
    const wrapper = mountBar();
    const slotText = () => wrapper.find('.slot-default').text();
    // dynamicColumns 为全量克隆，默认槽见全量
    expect(slotText()).toBe('["甲","乙","丙"]');
    const allCheckboxes = wrapper.findAll('.ep-checkbox input[type=checkbox]');
    // [0]=全选钮 [1]=甲 [2]=乙 [3]=丙
    expect(allCheckboxes.length).toBe(4);
    expect((allCheckboxes[0].element as HTMLInputElement).checked).toBe(true);
    // 取消「甲」
    await allCheckboxes[1].setValue(false);
    expect((allCheckboxes[1].element as HTMLInputElement).checked).toBe(false);
    // 全选关闭 → 全列 hide
    await allCheckboxes[0].setValue(false);
    expect(wrapper.findAll('.ep-checkbox input:checked')).toHaveLength(0);
    // 重置按钮可点击（onReset 执行，重置内部状态）
    const resetBtn = wrapper.find('.ep-button');
    expect(resetBtn.exists()).toBe(true);
    await resetBtn.trigger('click');
    // 重置后默认槽仍显示全量列（dynamicColumns 被重新克隆）
    expect(slotText()).toBe('["甲","乙","丙"]');
  });

  it('pin 双向：左固定切换 + isFixedColumn 左右三态', async () => {
    const wrapper = mountBar();
    // ~icons/* mock 渲染为 <svg>；pin 图标带 size-4 class
    const pinIcons = wrapper
      .findAll('svg')
      .filter(s => s.classes().includes('size-4'));
    // 每列 2 枚 pin 图标（左、右）；首列左 pin = pinIcons[0]
    expect(pinIcons.length).toBeGreaterThanOrEqual(2);
    await pinIcons[0].trigger('click');
    expect(pinIcons[0].classes()).toContain('text-primary');
    await pinIcons[0].trigger('click'); // 取消固定
    const slotText = wrapper.find('.slot-default').text();
    expect(slotText).toContain('甲');
  });

  it('rowDrop：mouseenter 建 Sortable；onEnd 无 fixed 重排、有 fixed 回滚双分支', async () => {
    // $refs[`GroupRef0`].$el.firstElementChild 即为 Sortable 的容器
    const groupEl = document.createElement('div');
    const rowWrap = document.createElement('div');
    groupEl.appendChild(rowWrap);
    const wrapper = mountBar();
    (wrapper.vm.$refs as Recordable)['GroupRef0'] = { $el: groupEl };
    const dragBtns = wrapper.findAll('.drag-btn');
    expect(dragBtns.length).toBeGreaterThanOrEqual(1);
    await dragBtns[0].trigger('mouseenter');
    await nextTick();
    expect(sortableCreateMock).toHaveBeenCalledTimes(1);
    expect(sortableCreateMock.mock.calls[0][1]).toMatchObject({
      handle: '.drag-btn'
    });
    const { onEnd } = sortableCreateMock.mock.calls[0][1];
    // 分支一（无 fixed）：0 → 2 重排 dynamicColumns
    const ths = [0, 1, 2].map(() =>
      rowWrap.appendChild(document.createElement('div'))
    );
    onEnd({ newIndex: 2, oldIndex: 0, item: ths[0] });
    await nextTick();
    expect(wrapper.find('.slot-default').text()).toBe('["乙","丙","甲"]');
    // 分支二（有 fixed）：固定首列再拖拽 → DOM 回滚、列序不变
    const pinIcons = wrapper
      .findAll('svg')
      .filter(s => s.classes().includes('size-4'));
    await pinIcons[0].trigger('click'); // 首列左固定
    await nextTick();
    onEnd({ newIndex: 2, oldIndex: 0, item: ths[0] });
    await nextTick();
    expect(wrapper.find('.slot-default').text()).toBe('["乙","丙","甲"]');
  });

  it('右固定：右 pin 切换 + isFixedColumn right 分支', async () => {
    const wrapper = mountBar();
    const pinIcons = wrapper
      .findAll('svg')
      .filter(s => s.classes().includes('size-4'));
    // 每列 2 枚 pin（左、右）；右 pin 含 scale-x-[-1] class
    const rightPins = pinIcons.filter(s =>
      s.classes().some(c => c.includes('scale-x'))
    );
    expect(rightPins.length).toBeGreaterThanOrEqual(1);
    await rightPins[0].trigger('click');
    expect(rightPins[0].classes()).toContain('text-primary');
    await rightPins[0].trigger('click'); // 取消右固定
    expect(wrapper.find('.slot-default').text()).toContain('甲');
  });

  it('默认槽收到 size 与 dynamicColumns 实时引用', () => {
    const seen: Recordable[] = [];
    mountBar({
      slotDefault: (params: Recordable) => {
        seen.push(params);
        return h('i');
      }
    });
    expect(seen[0]).toHaveProperty('size', 'default');
    expect(Array.isArray(seen[0].dynamicColumns)).toBe(true);
  });
});
