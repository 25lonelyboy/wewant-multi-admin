import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';

export const baseConfig = [js.configs.recommended, eslintConfigPrettier];

export default baseConfig;
