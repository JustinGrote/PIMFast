import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tanstackQuery from '@tanstack/eslint-plugin-query'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default defineConfig(
	eslint.configs.recommended,
	tseslint.configs.recommended,
	tanstackQuery.configs['flat/recommended'],
	eslintConfigPrettier,
	reactPlugin.configs.flat.recommended,
	reactPlugin.configs.flat['jsx-runtime'],
	reactHooks.configs['recommended-latest'],
	reactRefresh.configs.vite,
	{
		files: ['**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}'],
    ...reactPlugin.configs.flat.recommended,
    languageOptions: {
      ...reactPlugin.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
		ignores: ['node_modules', 'dist', 'worker-configuration.d.ts', 'src/api/generated'
		],
		rules: {
			'@typescript-eslint/no-unused-vars': 'warn',
			'no-throw-literal': 'error',
			'@tanstack/query/exhaustive-deps': 'warn'
		}
	},
)