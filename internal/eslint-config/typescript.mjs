import tseslint from 'typescript-eslint';

export function typescriptConfig({ tsconfigRootDir }) {
  return [
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir
        }
      }
    }
  ];
}
