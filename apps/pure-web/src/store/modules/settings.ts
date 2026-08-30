import { defineStore } from 'pinia';
import { type setType, store, getConfig } from '../utils';

export const useSettingStore = defineStore('pure-setting', {
  state: (): setType => ({
    title: getConfig().Title ?? '',
    fixedHeader: getConfig().FixedHeader ?? false,
    hiddenSideBar: getConfig().HiddenSideBar ?? false
  }),
  getters: {
    getTitle(state) {
      return state.title;
    },
    getFixedHeader(state) {
      return state.fixedHeader;
    },
    getHiddenSideBar(state) {
      return state.hiddenSideBar;
    }
  },
  actions: {
    CHANGE_SETTING({ key, value }: { key: string; value: unknown }) {
      if (Reflect.has(this, key)) {
        (this as unknown as Record<string, unknown>)[key] = value;
      }
    },
    changeSetting(data: { key: string; value: unknown }) {
      this.CHANGE_SETTING(data);
    }
  }
});

export function useSettingStoreHook() {
  return useSettingStore(store);
}
