export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 10;

/**
 * 软删除过滤片段：system 域所有列表/详情/子资源查询必须追加。
 * 统一走本工厂，防止过滤遗漏产生幽灵数据（分设计 §4.2/§10）。
 */
export function alive(): { deletedAt: null } {
  return { deletedAt: null };
}

export interface PageQueryInput {
  page?: number;
  pageSize?: number;
}

export interface NormalizedPage {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** service 层兜底钳制（controller 层 DTO 已用 @Min/@Max 约束） */
export function normalizePageQuery(query: PageQueryInput): NormalizedPage {
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE))
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function pageResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): PageResult<T> {
  return { items, total, page, pageSize };
}

/**
 * 菜单前端路由元数据（meta Json 单列收纳的 12 个纯展示字段）：
 * 后端零查询/排序/过滤诉求，写路径校验、读路径透传（分设计 §3.3）。
 * showLink 不在此列——visible 为单一语义源，路由树输出 showLink = visible。
 */
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
