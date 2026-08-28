import type { ValidationError } from 'class-validator';

/** 校验错误字段级明细：field 为点分路径（如 `meta.title`），message 为对应约束信息。 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
}

/**
 * 将 class-validator 的 ValidationError[] 递归展开为扁平明细数组：
 * - 有 constraints 的节点：每条约束输出一项，field 为当前点分路径
 * - 有 children 的节点：递归下钻，路径以 `.` 拼接（如 `meta.title`）
 * - 两者并存时都输出；无 constraints 且无 children 的节点不产生输出
 */
export function toValidationErrorDetails(
  errors: ValidationError[]
): ValidationErrorDetail[] {
  const details: ValidationErrorDetail[] = [];
  const walk = (errs: ValidationError[], prefix: string): void => {
    for (const err of errs) {
      const field = prefix ? `${prefix}.${err.property}` : err.property;
      for (const message of Object.values(err.constraints ?? {})) {
        details.push({ field, message });
      }
      if (err.children?.length) {
        walk(err.children, field);
      }
    }
  };
  walk(errors, '');
  return details;
}
