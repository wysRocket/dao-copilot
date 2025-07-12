import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginReact from 'eslint-plugin-react'
import eslintPluginPrettierRecommended from 'eslint-config-prettier'
import reactCompiler from 'eslint-plugin-react-compiler'

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['out/', '.vite/', 'dist/', 'node_modules/']
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    plugins: {
      'react-compiler': reactCompiler
    },
    rules: {
      'react-compiler/react-compiler': 'error'
    }
  },
  {
    // Browser environment for renderer code
    files: [
      'src/renderer.ts',
      'src/App.tsx',
      'src/components/**/*.{ts,tsx}',
      'src/contexts/**/*.{ts,tsx}',
      'src/hooks/**/*.{ts,tsx}',
      'src/layouts/**/*.{ts,tsx}',
      'src/pages/**/*.{ts,tsx}',
      'src/routes/**/*.{ts,tsx}',
      'src/styles/**/*.ts',
      'src/utils/**/*.ts'
    ],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    // Node.js environment for main process, build scripts, and tests
    files: [
      '*.ts',
      '*.mts',
      '*.mjs',
      'src/main.ts',
      'src/preload.ts',
      'src/services/**/*.ts',
      'src/helpers/**/*.ts',
      'src/__tests__/**/*.ts',
      'src/tests/**/*.ts'
    ],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  pluginJs.configs.recommended,
  pluginReact.configs.flat.recommended,
  eslintPluginPrettierRecommended,
  ...tseslint.configs.recommended
]
