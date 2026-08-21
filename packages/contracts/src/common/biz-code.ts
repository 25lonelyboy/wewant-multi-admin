/**
 * 统一业务错误码（总 spec §5）。码段规则：前 3 位对齐 HTTP 语义，
 * httpStatus = Math.floor(code / 100)。
 */
export const BizCode = {
  SUCCESS: 0,
  VALIDATION_FAILED: 40001,
  UNAUTHORIZED: 40101,
  ACCESS_TOKEN_EXPIRED: 40102,
  REFRESH_TOKEN_INVALID: 40103,
  FORBIDDEN: 40301,
  NOT_FOUND: 40404,
  CONFLICT: 40900,
  RATE_LIMITED: 42901,
  INTERNAL_ERROR: 50000
} as const;

export type BizCodeValue = (typeof BizCode)[keyof typeof BizCode];
