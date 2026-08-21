import type { EntityId, IsoDateTimeString } from '../common/conventions.js';
import type { PageQuery } from '../common/pagination.js';

export type RoleStatus = 'ACTIVE' | 'DISABLED';

export interface RoleVO {
  id: EntityId;
  code: string;
  name: string;
  status: RoleStatus;
  remark: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

/** 用户页下拉选项（GET /api/v1/system/roles/all，不分页数组） */
export interface RoleOption {
  id: EntityId;
  name: string;
  code: string;
}

export interface RoleQuery extends PageQuery {
  name?: string;
  code?: string;
  status?: RoleStatus;
}

export interface CreateRoleRequest {
  code: string;
  name: string;
  status?: RoleStatus;
  remark?: string;
  menuIds?: EntityId[];
}

/** 护栏：不含 code（不可改） */
export interface UpdateRoleRequest {
  name?: string;
  status?: RoleStatus;
  remark?: string;
  menuIds?: EntityId[];
}

/** PUT /api/v1/system/roles/:id/menus */
export interface AssignRoleMenusRequest {
  menuIds: EntityId[];
}
