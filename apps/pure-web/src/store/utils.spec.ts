// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));

import * as barrel from './utils';

it('桶 re-export 全键可达（真实实现非 undefined）', () => {
  const keys = [
    'store',
    'routerArrays',
    'router',
    'resetRouter',
    'constantMenus',
    'getConfig',
    'responsiveStorageNameSpace',
    'ascending',
    'filterTree',
    'filterNoPermissionTree',
    'formatFlatteningRoutes',
    'isUrl',
    'isEqual',
    'isNumber',
    'debounce',
    'isBoolean',
    'getKeyList',
    'storageLocal',
    'deviceDetection' as string
  ] as const;
  keys.forEach(k => {
    expect(barrel[k as keyof typeof barrel]).toBeDefined();
  });
  expect(barrel.constantMenus).toBeInstanceOf(Array);
});
