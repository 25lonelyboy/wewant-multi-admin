/** 分页查询参数（query 参数；server 端 DTO 做 @Min/@Max 钳制） */
export interface PageQuery {
  page?: number;
  pageSize?: number;
}

/** 分页响应（仅 user/role 列表；menu 全量树与 roles/all 不分页） */
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
