import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
export default [
  {
    ignores: [
      '**/.next/**',
      '**/.next-test/**',
      '**/node_modules/**',
      '**/next-env.d.ts',
      '**/dist/**',
      '**/.vercel/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  hooks.configs.flat.recommended,
  a11y.flatConfigs.recommended,
  {
    settings: { next: { rootDir: 'apps/web/' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/set-state-in-effect': 'off',
      'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
      'no-control-regex': 'off',
      'jsx-a11y/label-has-associated-control': ['error', { assert: 'nesting', depth: 3 }],
    },
  },
];
