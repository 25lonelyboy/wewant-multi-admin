import globals from 'globals';
import { baseConfig } from './base.mjs';
import { typescriptConfig } from './typescript.mjs';

export function nodeConfig({ tsconfigRootDir, rules = {} }) {
  return [
    ...baseConfig,
    ...typescriptConfig({ tsconfigRootDir }),
    {
      languageOptions: {
        globals: { ...globals.node, ...globals.jest },
        sourceType: 'module',
      },
    },
    {
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'warn',
        '@typescript-eslint/no-unsafe-argument': 'warn',
        ...rules,
      },
    },
  ];
}