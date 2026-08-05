import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import { baseConfig } from './base.mjs';

export const vueConfig = [
  ...baseConfig,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/vue3-recommended'],
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
  }
];

export default vueConfig;
