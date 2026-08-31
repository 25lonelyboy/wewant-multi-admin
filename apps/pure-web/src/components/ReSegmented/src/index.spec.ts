import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReSegmented from './index';
import type { OptionsType } from './type';
import { mountWithEP } from '@/test-utils/mount';

/* ---------- vi.hoisted：mock 变量必须在 vi.mock 工厂外提升 ---------- */
const { mockIsDark, mockDark } = vi.hoisted(() => {
  const mockDark = { isDark: { value: false } };
  return { mockIsDark: vi.fn(() => mockDark), mockDark };
});

vi.mock('@pureadmin/utils', async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>('@pureadmin/utils');
  return {
    ...actual,
    useDark: mockIsDark,
    useResizeObserver: vi.fn()
  };
});

/* ---------- 公共 fixtures ---------- */
const options: OptionsType[] = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' }
];

const disabledOption: OptionsType[] = [
  { label: 'A', value: 'a' },
  { label: 'B', value: 'b', disabled: true },
  { label: 'C', value: 'c' }
];

function getLabels(wrapper: ReturnType<typeof mountWithEP>) {
  return wrapper.findAll('.pure-segmented-item');
}

describe('ReSegmented', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDark.isDark.value = false;
  });

  /* -------- 基础渲染 -------- */
  it('渲染所有选项文本', () => {
    const wrapper = mountWithEP(ReSegmented, { props: { options } });
    const labels = getLabels(wrapper);
    expect(labels).toHaveLength(3);
    expect(labels[0].text()).toBe('Day');
    expect(labels[1].text()).toBe('Week');
    expect(labels[2].text()).toBe('Month');
  });

  it('默认选中第一项（index=0）', async () => {
    const wrapper = mountWithEP(ReSegmented, { props: { options } });
    await vi.waitFor(() => {
      const selected = wrapper.find('.pure-segmented-item-selected');
      expect(selected.exists()).toBe(true);
      expect(selected.attributes('style')).toContain('display: block');
    });
  });

  /* -------- modelValue 数字模式（响应式） -------- */
  describe('modelValue 数字模式', () => {
    it('点击第二项 → update:modelValue(1) + change({index:1})', async () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options, modelValue: 0 }
      });
      const labels = getLabels(wrapper);
      await labels[1].trigger('click');

      expect(wrapper.emitted('update:modelValue')).toEqual([[1]]);
      expect(wrapper.emitted('change')).toEqual([
        [{ index: 1, option: options[1] }]
      ]);
    });

    it('modelValue 变化 → 选中态跟随', async () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options, modelValue: 0 }
      });
      await wrapper.setProps({ modelValue: 2 });
      await vi.waitFor(() => {
        const selected = wrapper.find('.pure-segmented-item-selected');
        const style = selected.attributes('style') ?? '';
        // translateX 应发生变化（非 0px）
        expect(style).toMatch(/translateX\((\d+)px\)/);
      });
    });
  });

  /* -------- modelValue 字符串模式（非响应式） -------- */
  describe('modelValue 字符串模式', () => {
    it('点击第三项 → change 事件（不触发 update:modelValue）', async () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options, modelValue: '0' }
      });
      const labels = getLabels(wrapper);
      await labels[2].trigger('click');

      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      expect(wrapper.emitted('change')).toEqual([
        [{ index: 2, option: options[2] }]
      ]);
    });

    it('内部 curIndex 跟随点击切换', async () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options, modelValue: '0' }
      });
      const labels = getLabels(wrapper);

      await labels[1].trigger('click');
      await labels[2].trigger('click');

      const changeEvents = wrapper.emitted('change')!;
      expect(changeEvents).toHaveLength(2);
      expect(changeEvents[0]).toEqual([{ index: 1, option: options[1] }]);
      expect(changeEvents[1]).toEqual([{ index: 2, option: options[2] }]);
    });
  });

  /* -------- 全局禁用 -------- */
  describe('全局 disabled', () => {
    it('disabled=true → 点击不触发任何事件', async () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options, disabled: true }
      });
      const labels = getLabels(wrapper);
      await labels[1].trigger('click');

      expect(wrapper.emitted('change')).toBeUndefined();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('disabled=true → 所有项添加 disabled class', () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options, disabled: true }
      });
      const labels = getLabels(wrapper);
      labels.forEach(l => {
        expect(l.classes()).toContain('pure-segmented-item-disabled');
      });
    });

    it('disabled=true → hover 不改变 background', async () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options, disabled: true }
      });
      const labels = getLabels(wrapper);
      await labels[1].trigger('mouseenter');

      const style = labels[1].attributes('style') ?? '';
      expect(style).not.toContain('#1f1f1f');
      expect(style).not.toContain('rgba(0, 0, 0, 0.06)');
    });
  });

  /* -------- 单项禁用 -------- */
  describe('单项 disabled', () => {
    it('禁用项添加 disabled class', () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options: disabledOption }
      });
      const labels = getLabels(wrapper);
      expect(labels[1].classes()).toContain('pure-segmented-item-disabled');
      expect(labels[0].classes()).not.toContain('pure-segmented-item-disabled');
    });

    it('点击禁用项 → 不触发 change', async () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options: disabledOption }
      });
      const labels = getLabels(wrapper);
      await labels[1].trigger('click');

      expect(wrapper.emitted('change')).toBeUndefined();
    });

    it('点击非禁用项 → 正常触发 change', async () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options: disabledOption }
      });
      const labels = getLabels(wrapper);
      await labels[2].trigger('click');

      expect(wrapper.emitted('change')).toEqual([
        [{ index: 2, option: disabledOption[2] }]
      ]);
    });
  });

  /* -------- hover 明暗分支 -------- */
  describe('hover 明暗分支', () => {
    it('亮色模式 hover 非禁用项 → background rgba(0,0,0,0.06)', async () => {
      mockDark.isDark.value = false;
      const wrapper = mountWithEP(ReSegmented, {
        props: { options, modelValue: 0 }
      });
      const labels = getLabels(wrapper);
      await labels[1].trigger('mouseenter');

      const style = labels[1].attributes('style') ?? '';
      expect(style).toContain('rgba(0, 0, 0, 0.06)');
    });

    it('暗色模式 hover 非禁用项 → background #1f1f1f', async () => {
      mockDark.isDark.value = true;
      const wrapper = mountWithEP(ReSegmented, {
        props: { options, modelValue: 0 }
      });
      const labels = getLabels(wrapper);
      await labels[1].trigger('mouseenter');

      const style = labels[1].attributes('style') ?? '';
      // jsdom 将 #1f1f1f 转为 rgb(31, 31, 31)
      expect(style).toContain('rgb(31, 31, 31)');
    });

    it('hover 禁用项 → background 为空', async () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options: disabledOption, modelValue: 0 }
      });
      const labels = getLabels(wrapper);
      await labels[1].trigger('mouseenter');

      const style = labels[1].attributes('style') ?? '';
      // 禁用项 hover 时 segmentedItembg 为空 → background 不应含颜色值
      expect(style).not.toContain('#1f1f1f');
      expect(style).not.toContain('rgba(0, 0, 0, 0.06)');
    });

    it('mouseleave → curMouseActive 重置为 -1', async () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options, modelValue: 0 }
      });
      const labels = getLabels(wrapper);
      await labels[1].trigger('mouseenter');
      await labels[1].trigger('mouseleave');

      // mouseleave 后 background 应被清空
      const style = labels[1].attributes('style') ?? '';
      expect(style).not.toContain('rgba(0, 0, 0, 0.06)');
    });
  });

  /* -------- block / size -------- */
  describe('block 与 size', () => {
    it('block=true → 添加 pure-segmented-block class', () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options, block: true }
      });
      expect(wrapper.find('.pure-segmented').classes()).toContain(
        'pure-segmented-block'
      );
    });

    it('size=small → 添加 pure-segmented--small class', () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options, size: 'small' }
      });
      expect(wrapper.find('.pure-segmented').classes()).toContain(
        'pure-segmented--small'
      );
    });

    it('size=large → 添加 pure-segmented--large class', () => {
      const wrapper = mountWithEP(ReSegmented, {
        props: { options, size: 'large' }
      });
      expect(wrapper.find('.pure-segmented').classes()).toContain(
        'pure-segmented--large'
      );
    });
  });
});
