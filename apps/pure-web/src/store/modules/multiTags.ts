import { defineStore } from 'pinia';
import {
  type multiType,
  type positionType,
  store,
  isUrl,
  isEqual,
  isNumber,
  isBoolean,
  getConfig,
  routerArrays,
  storageLocal,
  responsiveStorageNameSpace
} from '../utils';
import { usePermissionStoreHook } from './permission';

export const useMultiTagsStore = defineStore('pure-multiTags', {
  state: (): { multiTags: multiType[]; multiTagsCache: boolean } => {
    const configure = storageLocal().getItem<StorageConfigs>(
      `${responsiveStorageNameSpace()}configure`
    );
    const multiTagsCache = configure?.multiTagsCache ?? false;
    const multiTags: multiType[] = multiTagsCache
      ? (storageLocal().getItem<StorageConfigs>(
          `${responsiveStorageNameSpace()}tags`
        ) as multiType[]) || []
      : ([
          ...routerArrays,
          ...usePermissionStoreHook().flatteningRoutes.filter(
            v => v?.meta?.fixedTag
          )
        ] as multiType[]);
    return { multiTags, multiTagsCache };
  },
  getters: {
    getMultiTagsCache(state) {
      return state.multiTagsCache;
    }
  },
  actions: {
    multiTagsCacheChange(multiTagsCache: boolean) {
      this.multiTagsCache = multiTagsCache;
      if (multiTagsCache) {
        storageLocal().setItem(
          `${responsiveStorageNameSpace()}tags`,
          this.multiTags
        );
      } else {
        storageLocal().removeItem(`${responsiveStorageNameSpace()}tags`);
      }
    },
    tagsCache(multiTags: multiType[]) {
      this.getMultiTagsCache &&
        storageLocal().setItem(
          `${responsiveStorageNameSpace()}tags`,
          multiTags
        );
    },
    handleTags(
      mode: string,
      value?: any,
      position?: positionType
    ): multiType[] | undefined {
      switch (mode) {
        case 'equal':
          this.multiTags = value as multiType[];
          this.tagsCache(this.multiTags);
          return undefined;
        case 'push':
          {
            const tagVal = value as multiType;
            // 不添加到标签页
            if (tagVal?.meta?.hiddenTag) return undefined;
            // 如果是外链无需添加信息到标签页
            if (isUrl(tagVal?.name)) return undefined;
            // 如果title为空拒绝添加空信息到标签页
            if (!tagVal?.meta?.title || tagVal?.meta?.title.length === 0)
              return undefined;
            // showLink:false 不添加到标签页
            if (isBoolean(tagVal?.meta?.showLink) && !tagVal?.meta?.showLink)
              return undefined;
            const tagPath = tagVal.path;
            const tagHasExits = this.multiTags.some((tag: multiType) => {
              return (
                tag.path === tagPath &&
                isEqual(tag?.query, tagVal?.query) &&
                isEqual(tag?.params, tagVal?.params)
              );
            });

            if (tagHasExits) return undefined;

            // 动态路由可打开的最大数量
            const dynamicLevel = tagVal?.meta?.dynamicLevel ?? -1;
            if (dynamicLevel > 0) {
              if (
                this.multiTags.filter((e: multiType) => e?.path === tagPath)
                  .length >= dynamicLevel
              ) {
                // 如果当前已打开的动态路由数大于dynamicLevel，替换第一个动态路由标签
                const index = this.multiTags.findIndex(
                  (item: multiType) => item?.path === tagPath
                );
                index !== -1 && this.multiTags.splice(index, 1);
              }
            }
            this.multiTags.push(value as multiType);
            this.tagsCache(this.multiTags);
            const maxTagsLevel = getConfig()?.MaxTagsLevel;
            if (maxTagsLevel && isNumber(maxTagsLevel)) {
              if (this.multiTags.length > maxTagsLevel) {
                this.multiTags.splice(1, 1);
              }
            }
          }
          return undefined;
        case 'splice':
          if (!position) {
            const index = this.multiTags.findIndex(
              (v: multiType) => v.path === value
            );
            if (index === -1) return undefined;
            this.multiTags.splice(index, 1);
          } else {
            this.multiTags.splice(
              position.startIndex ?? 0,
              position.length ?? 0
            );
          }
          this.tagsCache(this.multiTags);
          return this.multiTags;
        case 'slice':
          return this.multiTags.slice(-1);
        default:
          return undefined;
      }
    }
  }
});

export function useMultiTagsStoreHook() {
  return useMultiTagsStore(store);
}
