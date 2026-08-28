import type { ValidationError } from 'class-validator';
import { toValidationErrorDetails } from './validation-error-details.js';

/** 构造辅助：仅用于模拟 class-validator 的 ValidationError 结构 */
const leaf = (
  property: string,
  constraints: Record<string, string>
): ValidationError => ({
  property,
  constraints,
  children: []
});

const nested = (
  property: string,
  children: ValidationError[],
  constraints?: Record<string, string>
): ValidationError => ({
  property,
  children,
  ...(constraints ? { constraints } : {})
});

describe('toValidationErrorDetails', () => {
  it('空输入返回空数组', () => {
    expect(toValidationErrorDetails([])).toEqual([]);
  });

  it('顶层约束逐条展开为 { field, message }', () => {
    const errors = [
      leaf('username', { isNotEmpty: '用户名不能为空' }),
      leaf('email', { isEmail: '邮箱格式不正确', maxLength: '邮箱过长' })
    ];
    expect(toValidationErrorDetails(errors)).toEqual([
      { field: 'username', message: '用户名不能为空' },
      { field: 'email', message: '邮箱格式不正确' },
      { field: 'email', message: '邮箱过长' }
    ]);
  });

  it('单层嵌套：父级无 constraints 时递归 children 并以 . 拼接字段路径', () => {
    const errors = [
      nested('meta', [leaf('title', { isNotEmpty: '标题不能为空' })])
    ];
    expect(toValidationErrorDetails(errors)).toEqual([
      { field: 'meta.title', message: '标题不能为空' }
    ]);
  });

  it('多层嵌套：字段路径逐级拼接（a.b.c）', () => {
    const errors = [
      nested('a', [nested('b', [leaf('c', { isInt: '必须是整数' })])])
    ];
    expect(toValidationErrorDetails(errors)).toEqual([
      { field: 'a.b.c', message: '必须是整数' }
    ]);
  });

  it('父节点同时有 constraints 与 children 时两者都输出', () => {
    const errors = [
      nested('meta', [leaf('title', { isNotEmpty: '标题不能为空' })], {
        isNotEmpty: 'meta 不能为空'
      })
    ];
    expect(toValidationErrorDetails(errors)).toEqual([
      { field: 'meta', message: 'meta 不能为空' },
      { field: 'meta.title', message: '标题不能为空' }
    ]);
  });

  it('节点省略 children 属性（undefined）时正常输出顶层约束', () => {
    const errors: ValidationError[] = [
      { property: 'x', constraints: { isNotEmpty: 'x 不能为空' } }
    ];
    expect(toValidationErrorDetails(errors)).toEqual([
      { field: 'x', message: 'x 不能为空' }
    ]);
  });

  it('无 constraints 也无 children 的节点不产生输出', () => {
    const errors: ValidationError[] = [{ property: 'empty', children: [] }];
    expect(toValidationErrorDetails(errors)).toEqual([]);
  });

  it('混合场景：顶层约束 + 嵌套明细 + 空节点共存', () => {
    const errors: ValidationError[] = [
      leaf('name', { isNotEmpty: '名称不能为空' }),
      nested('meta', [
        leaf('title', { isNotEmpty: '标题不能为空' }),
        { property: 'ignored', children: [] }
      ]),
      { property: 'ignored2', children: [] }
    ];
    expect(toValidationErrorDetails(errors)).toEqual([
      { field: 'name', message: '名称不能为空' },
      { field: 'meta.title', message: '标题不能为空' }
    ]);
  });
});
