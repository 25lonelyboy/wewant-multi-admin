import type { EntityId, IsoDateTimeString } from '../common/conventions.js';
import type { PageQuery } from '../common/pagination.js';

export type UserStatus = 'ACTIVE' | 'DISABLED';

/** 用户视图（剔除 password；roles 为角色 code 数组） */
export interface UserVO {
  id: EntityId;
  username: string;
  nickname: string;
  status: UserStatus;
  avatar: string | null;
  phone: string | null;
  email: string | null;
  sex: 0 | 1 | null;
  remark: string | null;
  roles: string[];
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

/** 用户列表查询（GET /api/v1/system/users） */
export interface UserQuery extends PageQuery {
  username?: string;
  status?: UserStatus;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  nickname: string;
  status?: UserStatus;
  avatar?: string;
  phone?: string;
  email?: string;
  sex?: 0 | 1;
  remark?: string;
  roleIds?: EntityId[];
}

/** 护栏 6：不含 username（不可改） */
export interface UpdateUserRequest {
  nickname?: string;
  status?: UserStatus;
  avatar?: string;
  phone?: string;
  email?: string;
  sex?: 0 | 1;
  remark?: string;
  password?: string;
  roleIds?: EntityId[];
}

/** PUT /api/v1/system/users/:id/roles */
export interface SetUserRolesRequest {
  roleIds: EntityId[];
}
