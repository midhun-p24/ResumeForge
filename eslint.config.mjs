import js from '@eslint/js';
import ts from 'typescript-eslint';
import next from 'eslint-config-next/core-web-vitals';
export default [
  { ignores: ['**/.next/**', '**/node_modules/**', '**/next-env.d.ts', '**/dist/**', '**/.vercel/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...next,
  {settings:{next:{rootDir:'apps/web/'}},rules: {'@typescript-eslint/no-explicit-any': 'error', 'react-hooks/set-state-in-effect': 'off', 'no-control-regex':'off'}}
];
