import type { EntityId, IsoDateTimeString } from '../common/conventions.js';

/** 菜单类型（后端枚举为事实源；前端数字映射见 pure-web 常量） */
export const MenuType = {
  MENU: 'MENU',
  IFRAME: 'IFRAME',
  EXTERNAL: 'EXTERNAL',
  BUTTON: 'BUTTON'
} as const;

export type MenuTypeValue = (typeof MenuType)[keyof typeof MenuType];

/** 前端路由元数据（meta Json 单列的 12 个纯展示字段） */
export interface MenuMeta {
  redirect?: string;
  extraIcon?: string;
  enterTransition?: string;
  leaveTransition?: string;
  activePath?: string;
  auths?: string[];
  frameSrc?: string;
  frameLoading?: boolean;
  keepAlive?: boolean;
  hiddenTag?: boolean;
  fixedTag?: boolean;
  showParent?: boolean;
}

/** 菜单视图（= Menu 行全字段 JSON 序列化形态 + children） */
export interface MenuVO {
  id: EntityId;
  parentId: EntityId | null;
  type: MenuTypeValue;
  name: string;
  title: string;
  icon: string | null;
  path: string | null;
  component: string | null;
  permission: string | null;
  sort: number;
  visible: boolean;
  meta: MenuMeta | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
  deletedAt: IsoDateTimeString | null;
  children: MenuVO[];
}

export interface CreateMenuRequest {
  type: MenuTypeValue;
  parentId?: EntityId | null;
  name: string;
  title: string;
  icon?: string;
  path?: string;
  component?: string;
  permission?: string;
  sort?: number;
  visible?: boolean;
  meta?: MenuMeta;
}

export interface UpdateMenuRequest {
  type?: MenuTypeValue;
  parentId?: EntityId | null;
  name?: string;
  title?: string;
  icon?: string;
  path?: string;
  component?: string;
  permission?: string | null;
  sort?: number;
  visible?: boolean;
  meta?: MenuMeta | null;
}
