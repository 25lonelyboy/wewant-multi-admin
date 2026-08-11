import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import { baseConfig } from './base.mjs';

// TS 规则仅作用于 ts/tsx（与 pure-web 旧配置的限定范围一致），
// .vue 中的 TS 语法由下方基线规则块按需覆盖
const tsFiles = ['**/*.?([cm])ts', '**/*.?([cm])tsx'];
// 需要 TS parser 的类型感知规则，作用域为 ts/tsx + .vue
// （.vue 由 vue-eslint-parser 转发到 TS parser，可正常运行）
const tsAwareFiles = [...tsFiles, '**/*.vue'];

/**
 * Vue 端 ESLint 基线（工厂函数），供 pure-web / uni-mobile 等 Vue 应用以薄壳方式消费。
 * 职责分离模式：本配置只做质量校验，格式化由 Prettier 独占；
 * 末尾的 eslintConfigPrettier 必须在所有规则之后，用于关闭与之冲突的风格规则。
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir tsconfig 解析根目录，传 import.meta.dirname
 * @param {Record<string, string>} [options.globals]  端专属全局变量（与 browser globals 合并）
 * @param {Record<string, unknown>} [options.tsRules] 端专属 TS 规则放宽，仅作用于 ts/tsx
 * @param {Record<string, unknown>} [options.vueRules] 端专属 vue/* 规则放宽，作用于 ts/tsx + .vue
 */
export function vueConfig({
  tsconfigRootDir,
  globals: extraGlobals = {},
  tsRules = {},
  vueRules = {}
}) {
  return [
    // ① 公共底座：ESLint 官方推荐 JS 规则
    ...baseConfig,
    // ② 全局注册 @typescript-eslint 插件，保证基线 TS 规则在 .vue 文件中可用
    { plugins: { '@typescript-eslint': tseslint.plugin } },
    // ③ 显式声明 tsconfigRootDir：typescript-eslint 8.66 未设置时会走全局候选目录推断，
    //    编辑器单进程同时加载多个包的 eslint.config 时推断出多个候选目录直接抛错，
    //    故调用方必须传入本包根目录（import.meta.dirname）
    {
      languageOptions: {
        parserOptions: { tsconfigRootDir }
      }
    },
    // ④ typescript-eslint 推荐规则集，限定 ts/tsx（不含 .vue，
    //    避免 no-explicit-any 等规则在模板工程存量代码上大面积报错）
    ...tseslint.configs.recommended.map(config => ({
      ...config,
      files: tsFiles
    })),
    // ⑤ eslint-plugin-vue 官方 flat/recommended 预设（essential + strongly-recommended + recommended）
    ...pluginVue.configs['flat/recommended'],
    // ⑥ 浏览器环境全局变量（window/document 等）+ 调用方传入的端专属 globals
    {
      languageOptions: {
        globals: {
          ...globals.browser,
          ...extraGlobals
        }
      }
    },
    // ⑦ .vue 文件解析器：vue-eslint-parser 解析模板，
    //    <script lang="ts"> 块转发给 TS parser 处理
    {
      files: ['**/*.vue'],
      languageOptions: {
        parser: vueParser,
        parserOptions: {
          parser: tseslint.parser,
          extraFileExtensions: ['.vue'],
          sourceType: 'module'
        }
      }
    },
    // ⑧ 全仓统一的基线增强规则（不依赖 TS parser，对所有文件生效）
    {
      rules: {
        // enum 成员必须为字面量，允许位运算表达式（如 1 << 2）
        '@typescript-eslint/prefer-literal-enum-member': [
          'error',
          { allowBitwiseExpressions: true }
        ],
        // 未使用变量报错，以 _ 开头的参数/变量豁免
        'no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
        ],
        // 允许单词组件名（Login、Home 等），全仓统一关闭
        'vue/multi-word-component-names': 'off'
      }
    },
    // ⑨ 类型感知的 TS 规则：不能在 .js 等无 TS parser 的文件上运行
    {
      files: tsAwareFiles,
      rules: {
        // 仅作为类型使用的导入必须改为 import type，修复时采用内联写法
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { disallowTypeAnnotations: false, fixStyle: 'inline-type-imports' }
        ],
        // 禁止只作类型使用的导入产生副作用残留
        '@typescript-eslint/no-import-type-side-effects': 'error',
        // TS 版 no-redeclare（vue 的 script/template 分块场景需要）
        '@typescript-eslint/no-redeclare': 'error',
        // TS 版 no-unused-vars，能正确理解函数类型参数等 TS 语法
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
        ]
      }
    },
    // ⑩ ts/tsx 专属块：调用方 tsRules 放宽在此生效
    {
      files: tsFiles,
      rules: {
        // TS 文件中交由 @typescript-eslint/no-unused-vars 处理，
        // 核心规则对函数类型参数等 TS 语法会误报
        'no-unused-vars': 'off',
        ...tsRules
      }
    },
    // ⑪ eslint-plugin-vue 的部分规则（如 one-component-per-file）
    //    同样作用于 ts/tsx 中的 defineComponent，故放宽范围一并覆盖
    {
      files: tsAwareFiles,
      rules: {
        // 未定义变量由 TS 类型检查接管，避免与 tsc 重复报错
        'no-undef': 'off',
        // .vue/ts/tsx 中统一交由 ⑨ 的 TS 版规则处理
        'no-unused-vars': 'off',
        ...vueRules
      }
    },
    // ⑫ .js/.mjs/.cjs 构建脚本：允许 require 写法（CommonJS 互操作）
    {
      files: ['**/*.?([cm])js'],
      rules: {
        '@typescript-eslint/no-require-imports': 'off'
      }
    },
    // ⑬ 必须置于末尾：关闭以上所有与 Prettier 冲突的风格类规则
    eslintConfigPrettier
  ];
}

export default vueConfig;
