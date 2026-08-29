import { defineConfig, globalIgnores } from 'eslint/config';
import { vueConfig } from '@multi-admin/eslint-config/vue';
import { tailwindConfig } from '@multi-admin/eslint-config/tailwind';
import vitestPlugin from '@vitest/eslint-plugin';

/**
 * pure-web ESLint 薄壳：一行引入仓库基线 vueConfig，
 * 仅在此声明 pure-admin 模板的存量差异（全局类型/规则放宽），新代码应遵循基线。
 * 职责分离模式：ESLint 只校验，格式化由 Prettier 独占。
 */
export default defineConfig([
  // 不参与 lint 的文件：隐藏文件、构建产物、类型声明、静态资源、字体图标
  globalIgnores([
    '**/.*',
    'dist/*',
    '*.d.ts',
    'public/*',
    'src/assets/**',
    'src/**/iconfont/**'
  ]),
  ...vueConfig({
    // tsconfig 解析根目录：显式传入避免 typescript-eslint 多候选目录推断报错
    tsconfigRootDir: import.meta.dirname,
    globals: {
      // pure-admin 在 types/index.d.ts 中声明的全局类型别名，
      // 注册为 readonly 全局避免 no-undef 误报
      RefType: 'readonly',
      EmitType: 'readonly',
      TargetContext: 'readonly',
      ComponentRef: 'readonly',
      ElRef: 'readonly',
      ForDataType: 'readonly',
      AnyFunction: 'readonly',
      PropType: 'readonly',
      Writable: 'readonly',
      Nullable: 'readonly',
      NonNullable: 'readonly',
      Recordable: 'readonly',
      ReadonlyRecordable: 'readonly',
      Indexable: 'readonly',
      DeepPartial: 'readonly',
      Without: 'readonly',
      Exclusive: 'readonly',
      TimeoutHandle: 'readonly',
      IntervalHandle: 'readonly',
      Effect: 'readonly',
      ChangeEvent: 'readonly',
      WheelEvent: 'readonly',
      ImportMetaEnv: 'readonly',
      Fn: 'readonly',
      PromiseFn: 'readonly',
      ComponentElRef: 'readonly',
      parseInt: 'readonly',
      parseFloat: 'readonly'
    },
    tsRules: {
      // pure-admin 存量放宽，新代码应遵循基线（仅作用于 ts/tsx）
      // 大量使用 @ts-ignore/@ts-nocheck 压制第三方库类型问题
      '@typescript-eslint/ban-ts-comment': 'off',
      // 模板工程 any 遍布（尤其响应式数据与第三方组件），关闭避免大面积击穿
      '@typescript-eslint/no-explicit-any': 'off',
      // 存在空函数占位（回调骨架/生命周期预留）
      '@typescript-eslint/no-empty-function': 'off',
      // 大量使用 ! 断言简化判空
      '@typescript-eslint/no-non-null-assertion': 'off',
      // 存在 a && b() 类短路表达式写法
      '@typescript-eslint/no-unused-expressions': 'off',
      // 存在 Function 类型标注的存量代码
      '@typescript-eslint/no-unsafe-function-type': 'off',
      // as const 断言建议降为警告，渐进治理
      '@typescript-eslint/prefer-as-const': 'warn'
    },
    vueRules: {
      // pure-admin 存量放宽，新代码应遵循基线（作用于 ts/tsx + .vue）
      // 富文本渲染场景使用 v-html
      'vue/no-v-html': 'off',
      // props 未全部设置默认值
      'vue/require-default-prop': 'off',
      // emits 未全部显式声明（部分通过 attrs 透传）
      'vue/require-explicit-emits': 'off',
      // 存在解构 props 的存量写法
      'vue/no-setup-props-reactivity-loss': 'off',
      // pure-admin 存量基于不含 strongly-recommended 的规则集编写，
      // flat/recommended 引入的风格规则在此关闭，避免大面积击穿
      // 模板中属性/事件采用驼峰写法而非短横线
      'vue/attribute-hyphenation': 'off',
      'vue/v-on-event-hyphenation': 'off',
      // v-slot 允许缩写 # 之外的写法
      'vue/v-slot-style': 'off',
      // 组件名大小写不强制（部分函数式组件）
      'vue/component-definition-name-casing': 'off',
      // hooks 文件中定义多个小组件是 pure-admin 惯例
      'vue/one-component-per-file': 'off',
      // 模板中 route 变量遮蔽外层 setup 同名变量的存量写法
      'vue/no-template-shadow': 'off',
      // 部分 props 未标注类型（icon 等透传场景）
      'vue/require-prop-types': 'off'
    }
  }),
  {
    // 根目录构建配置文件运行于 Node 环境
    files: ['*.config.js'],
    languageOptions: {
      globals: {
        process: 'readonly'
      }
    }
  },
  {
    // pure-web 私有块：.vue 模板中的响应式语法糖全局（vite 插件注入），
    // 以及组件模板统一要求自闭合写法
    files: ['**/*.vue'],
    languageOptions: {
      globals: {
        $: 'readonly',
        $$: 'readonly',
        $computed: 'readonly',
        $customRef: 'readonly',
        $ref: 'readonly',
        $shallowRef: 'readonly',
        $toRef: 'readonly'
      }
    },
    rules: {
      // 模板工程惯例：html/svg/math 元素一律自闭合
      'vue/html-self-closing': [
        'error',
        {
          html: {
            void: 'always',
            normal: 'always',
            component: 'always'
          },
          svg: 'always',
          math: 'always'
        }
      ]
    }
  },
  {
    files: ['**/*.spec.ts'],
    ...vitestPlugin.configs.recommended
  },
  // Tailwind 类名一致性校验（warn 级），入口指向本端 tailwind 样式文件
  ...tailwindConfig({ entryPoint: 'src/style/tailwind.css' })
]);
