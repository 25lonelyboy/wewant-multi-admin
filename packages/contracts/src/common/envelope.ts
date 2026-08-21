/** 统一响应信封（总 spec §5）：所有端点成功响应均为该形状 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}
