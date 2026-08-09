// @ts-check

/** @type {import("prettier").Config} */
export default {
  // 使用单引号而不是双引号（例如：'hello' 而不是 "hello"）
  singleQuote: true,
  // 是否在多行结构（如对象、数组、函数参数）末尾添加逗号。
  // 'none' 表示不添加尾随逗号，保持更传统的风格
  trailingComma: 'none',
  // 箭头函数参数只有一个时是否添加圆括号。
  // 'avoid' 表示尽量省略，例如：x => x
  arrowParens: 'avoid',
  // 文件换行符的处理方式。'auto' 表示遵循系统或现有文件的换行风格，
  // 可避免不同操作系统间的换行差异引起的变更
  endOfLine: 'auto'
};
