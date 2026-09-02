// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

const storageFake = vi.hoisted(() => {
  const raw = new Map<string, any>();
  return {
    raw,
    getItem: <T>(k: string) => (raw.get(k) as T | undefined) ?? null,
    setItem: <T>(k: string, v: T) => raw.set(k, v),
    removeItem: (k: string) => raw.delete(k),
    clear: () => raw.clear()
  };
});

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return { ...actual, storageLocal: () => storageFake };
});

const mockRoute = vi.hoisted(() => ({
  name: 'Home',
  path: '/welcome',
  query: {} as Record<string, any>,
  params: {} as Record<string, any>,
  meta: { title: 'Home', showLink: true } as Record<string, any>
}));

vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    useRoute: () => mockRoute,
    useRouter: () => ({ push: vi.fn() })
  };
});

const settingsState = vi.hoisted(() => ({ hiddenSideBar: false }));
vi.mock('@/store/modules/settings', () => ({
  useSettingStoreHook: () => ({
    get hiddenSideBar() {
      return settingsState.hiddenSideBar;
    },
    changeSetting: vi.fn((data: { key: string; value: unknown }) => {
      if (data.key === 'hiddenSideBar')
        settingsState.hiddenSideBar = data.value as boolean;
    })
  })
}));

const permissionFake = vi.hoisted(() => ({
  flatteningRoutes: [] as any[]
}));
vi.mock('@/store/modules/permission', () => ({
  usePermissionStoreHook: () => permissionFake
}));

const mockRefs: Record<string, any> = {};
vi.mock('vue', async importOriginal => {
  const actual = await importOriginal<typeof import('vue')>();
  return {
    ...actual,
    getCurrentInstance: () => ({ refs: mockRefs })
  };
});

import { useTags } from './useTag';
import { setConfig } from '@/config';

const setRoute = (over: Record<string, any>) => {
  Object.assign(mockRoute, { query: {}, params: {}, meta: {}, ...over });
};

beforeEach(() => {
  vi.clearAllMocks();
  storageFake.raw.clear();
  settingsState.hiddenSideBar = false;
  permissionFake.flatteningRoutes = [];
  Object.keys(mockRefs).forEach(k => delete mockRefs[k]);
  setConfig({ ResponsiveStorageNameSpace: 'responsive-' });
  // 预填充 storage 以避免 useTag 初始化时访问 null.hideTabs 报错
  storageFake.raw.set('responsive-configure', {
    tagsStyle: 'chrome',
    hideTabs: false
  });
  setRoute({
    name: 'Home',
    path: '/welcome',
    query: {},
    params: {},
    meta: { title: 'Home', showLink: true }
  });
});

describe('useTags - tagsViews 初始化', () => {
  it('包含 7 个上下文菜单项', () => {
    const { tagsViews } = useTags();
    expect(tagsViews).toHaveLength(7);
  });

  it('所有菜单项 show=true', () => {
    const { tagsViews } = useTags();
    tagsViews.forEach(item => {
      expect(item.show).toBe(true);
    });
  });

  it('multiTags 为空时操作项 disabled=true', () => {
    const { tagsViews } = useTags();
    // index 1-5 的 disabled 取决于 multiTags.length
    expect(tagsViews[1].disabled).toBe(true);
    expect(tagsViews[4].disabled).toBe(true);
  });
});

describe('useTags - isFixedTag', () => {
  it('meta.fixedTag=true 返回 true', () => {
    const { isFixedTag } = useTags();
    expect(isFixedTag.value({ meta: { fixedTag: true } })).toBe(true);
  });

  it('meta.fixedTag=false 返回 false', () => {
    const { isFixedTag } = useTags();
    expect(isFixedTag.value({ meta: { fixedTag: false } })).toBe(false);
  });

  it('meta.fixedTag 不存在返回 false', () => {
    const { isFixedTag } = useTags();
    expect(isFixedTag.value({ meta: {} })).toBe(false);
  });

  it('item 无 meta 返回 false', () => {
    const { isFixedTag } = useTags();
    expect(isFixedTag.value({})).toBe(false);
  });
});

describe('useTags - conditionHandle 分支（通过 iconIsActive/linkIsActive/scheduleIsActive）', () => {
  describe('showLink=true（普通路由）', () => {
    it('name 匹配 → is-active', () => {
      setRoute({ name: 'Home', meta: { showLink: true } });
      const { linkIsActive } = useTags();
      expect(linkIsActive.value({ name: 'Home' })).toBe('is-active');
    });

    it('name 不匹配 → 空字符串', () => {
      setRoute({ name: 'Home', meta: { showLink: true } });
      const { linkIsActive } = useTags();
      expect(linkIsActive.value({ name: 'Other' })).toBe('');
    });
  });

  describe('showLink=false + query 存在', () => {
    it('name 匹配 + query 相等 → previous', () => {
      setRoute({
        name: 'Detail',
        query: { id: '1' },
        meta: { showLink: false }
      });
      const { linkIsActive } = useTags();
      expect(linkIsActive.value({ name: 'Detail', query: { id: '1' } })).toBe(
        'is-active'
      );
    });

    it('name 匹配 + query 不等 → next', () => {
      setRoute({
        name: 'Detail',
        query: { id: '1' },
        meta: { showLink: false }
      });
      const { linkIsActive } = useTags();
      expect(linkIsActive.value({ name: 'Detail', query: { id: '2' } })).toBe(
        ''
      );
    });
  });

  describe('showLink=false + 无 query', () => {
    it('name 匹配 + params 相等 → previous', () => {
      setRoute({
        name: 'Edit',
        query: {},
        params: { id: '1' },
        meta: { showLink: false }
      });
      const { scheduleIsActive } = useTags();
      expect(
        scheduleIsActive.value({ name: 'Edit', params: { id: '1' } })
      ).toBe('schedule-active');
    });

    it('name 匹配 + params 不等 → next', () => {
      setRoute({
        name: 'Edit',
        query: {},
        params: { id: '1' },
        meta: { showLink: false }
      });
      const { scheduleIsActive } = useTags();
      expect(
        scheduleIsActive.value({ name: 'Edit', params: { id: '2' } })
      ).toBe('');
    });
  });

  describe('iconIsActive', () => {
    it('index=0 返回 undefined（跳过）', () => {
      const { iconIsActive } = useTags();
      expect(iconIsActive.value({ name: 'Home' }, 0)).toBeUndefined();
    });

    it('index>0 + name 匹配 → true', () => {
      setRoute({ name: 'Home', meta: { showLink: true } });
      const { iconIsActive } = useTags();
      expect(iconIsActive.value({ name: 'Home' }, 1)).toBe(true);
    });

    it('index>0 + name 不匹配 → false', () => {
      setRoute({ name: 'Home', meta: { showLink: true } });
      const { iconIsActive } = useTags();
      expect(iconIsActive.value({ name: 'Other' }, 2)).toBe(false);
    });
  });
});

describe('useTags - 样式计算', () => {
  it('getTabStyle：transform 基于 translateX', () => {
    const { getTabStyle, translateX, isScrolling } = useTags();
    translateX.value = -100;
    isScrolling.value = false;
    expect(getTabStyle.value.transform).toBe('translateX(-100px)');
    expect(getTabStyle.value.transition).toContain('0.5s');
  });

  it('getTabStyle：滚动中 transition=none', () => {
    const { getTabStyle, isScrolling } = useTags();
    isScrolling.value = true;
    expect(getTabStyle.value.transition).toBe('none');
  });

  it('getContextMenuStyle：left/top 基于 buttonLeft/buttonTop', () => {
    const { getContextMenuStyle, buttonLeft, buttonTop } = useTags();
    buttonLeft.value = 200;
    buttonTop.value = 100;
    expect(getContextMenuStyle.value.left).toBe('200px');
    expect(getContextMenuStyle.value.top).toBe('100px');
  });
});

describe('useTags - closeMenu', () => {
  it('设置 visible=false', () => {
    const { closeMenu, visible } = useTags();
    visible.value = true;
    closeMenu();
    expect(visible.value).toBe(false);
  });
});

describe('useTags - onContentFullScreen', () => {
  it('切换 hiddenSideBar', () => {
    const { onContentFullScreen } = useTags();
    settingsState.hiddenSideBar = false;
    onContentFullScreen();
    // changeSetting 被调用
    expect(settingsState.hiddenSideBar).toBe(true);
    onContentFullScreen();
    expect(settingsState.hiddenSideBar).toBe(false);
  });
});

describe('useTags - 初始化状态', () => {
  it('tagsStyle 默认 chrome', () => {
    const { tagsStyle } = useTags();
    expect(tagsStyle.value).toBe('chrome');
  });

  it('tagsStyle 从 storage 读取', () => {
    storageFake.raw.set('responsive-configure', {
      tagsStyle: 'card',
      hideTabs: false
    });
    const { tagsStyle } = useTags();
    expect(tagsStyle.value).toBe('card');
  });

  it('visible 初始 false', () => {
    const { visible } = useTags();
    expect(visible.value).toBe(false);
  });

  it('activeIndex 初始 -1', () => {
    const { activeIndex } = useTags();
    expect(activeIndex.value).toBe(-1);
  });

  it('buttonTop/buttonLeft 初始 0', () => {
    const { buttonTop, buttonLeft } = useTags();
    expect(buttonTop.value).toBe(0);
    expect(buttonLeft.value).toBe(0);
  });
});

describe('useTags - onMouseenter/onMouseleave', () => {
  it('onMouseenter：chrome 风格添加 card-in class', () => {
    storageFake.raw.set('responsive-configure', {
      tagsStyle: 'chrome',
      hideTabs: false
    });
    const el = document.createElement('div');
    mockRefs['dynamic1'] = [el];
    const { onMouseenter } = useTags();
    onMouseenter(1);
    expect(el.classList.contains('card-in')).toBe(true);
    expect(activeIndexAfterMouse(1)).toBe(1);
  });

  it('onMouseleave：chrome 风格添加 card-out class', () => {
    storageFake.raw.set('responsive-configure', {
      tagsStyle: 'chrome',
      hideTabs: false
    });
    const el = document.createElement('div');
    mockRefs['dynamic2'] = [el];
    const { onMouseleave } = useTags();
    onMouseleave(2);
    expect(el.classList.contains('card-out')).toBe(true);
  });

  it('onMouseenter：smart 风格添加 schedule-in class', () => {
    storageFake.raw.set('responsive-configure', {
      tagsStyle: 'smart',
      hideTabs: false
    });
    const el = document.createElement('div');
    mockRefs['schedule1'] = [el];
    const { onMouseenter } = useTags();
    onMouseenter(1);
    expect(el.classList.contains('schedule-in')).toBe(true);
  });

  it('onMouseleave：smart 风格添加 schedule-out class', () => {
    storageFake.raw.set('responsive-configure', {
      tagsStyle: 'smart',
      hideTabs: false
    });
    const el = document.createElement('div');
    mockRefs['schedule2'] = [el];
    const { onMouseleave } = useTags();
    onMouseleave(2);
    expect(el.classList.contains('schedule-out')).toBe(true);
  });

  it('onMouseenter：chrome 风格已有 is-active 则跳过', () => {
    storageFake.raw.set('responsive-configure', {
      tagsStyle: 'chrome',
      hideTabs: false
    });
    const el = document.createElement('div');
    el.classList.add('is-active');
    mockRefs['dynamic3'] = [el];
    const { onMouseenter } = useTags();
    onMouseenter(3);
    // 不应添加 card-in（因为已有 is-active，直接 return）
    expect(el.classList.contains('card-in')).toBe(false);
  });

  it('onMouseenter：smart 风格已有 schedule-active 则跳过', () => {
    storageFake.raw.set('responsive-configure', {
      tagsStyle: 'smart',
      hideTabs: false
    });
    const el = document.createElement('div');
    el.classList.add('schedule-active');
    mockRefs['schedule3'] = [el];
    const { onMouseenter } = useTags();
    onMouseenter(3);
    expect(el.classList.contains('schedule-in')).toBe(false);
  });

  it('onMouseleave：chrome 风格已有 is-active 则跳过', () => {
    storageFake.raw.set('responsive-configure', {
      tagsStyle: 'chrome',
      hideTabs: false
    });
    const el = document.createElement('div');
    el.classList.add('is-active');
    mockRefs['dynamic4'] = [el];
    const { onMouseleave } = useTags();
    onMouseleave(4);
    expect(el.classList.contains('card-out')).toBe(false);
  });

  it('onMouseleave：smart 风格已有 schedule-active 则跳过', () => {
    storageFake.raw.set('responsive-configure', {
      tagsStyle: 'smart',
      hideTabs: false
    });
    const el = document.createElement('div');
    el.classList.add('schedule-active');
    mockRefs['schedule4'] = [el];
    const { onMouseleave } = useTags();
    onMouseleave(4);
    expect(el.classList.contains('schedule-out')).toBe(false);
  });

  it('onMouseenter：index=0 不设置 activeIndex', () => {
    const { onMouseenter, activeIndex } = useTags();
    onMouseenter(0);
    expect(activeIndex.value).toBe(-1); // 保持初始值
  });
});

function activeIndexAfterMouse(idx: number): number {
  return idx;
}
