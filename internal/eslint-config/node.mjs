import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';
import { baseConfig } from './base.mjs';
import { typescriptConfig } from './typescript.mjs';

/**
 * Node 端 ESLint 基线（工厂函数），供 nestjs-server 等后端包以薄壳方式消费。
 * 与 vue.mjs 的差异：启用类型感知（type-checked）TS 规则，注入 Node/Jest 全局变量。
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir tsconfig 解析根目录，传 import.meta.dirname
 * @param {Record<string, unknown>} [options.rules] 端专属规则覆盖，追加在基线规则之后
 */
export function nodeConfig({ tsconfigRootDir, rules = {} }) {
  return [
    // ① 公共底座：ESLint 官方推荐 JS 规则
    ...baseConfig,
    // ② 类型感知的 TS 规则集（recommendedTypeChecked + projectService）
    ...typescriptConfig({ tsconfigRootDir }),
    // ③ Node 环境全局变量（process/__dirname 等）+ Jest 测试全局（describe/it 等），
    //    并声明 ES Module 模块体系
    {
      languageOptions: {
        globals: { ...globals.node, ...globals.jest },
        sourceType: 'module'
      }
    },
    // ④ 基线默认规则：类型感知规则对后端存量偏严，降为 warning 渐进收敛；
    //    调用方 rules 在其后覆盖
    {
      rules: {
        // NestJS 生态中 any 常见（装饰器/动态 DI），关闭避免噪声
        '@typescript-eslint/no-explicit-any': 'off',
        // 未处理的 Promise 降级为警告，逐步治理
        '@typescript-eslint/no-floating-promises': 'warn',
        // 不安全参数传递降级为警告，逐步治理
        '@typescript-eslint/no-unsafe-argument': 'warn',
        ...rules
      }
    },
    // ⑤ 必须置于末尾：关闭以上所有与 Prettier 冲突的风格类规则（职责分离模式）
    eslintConfigPrettier
  ];
}
