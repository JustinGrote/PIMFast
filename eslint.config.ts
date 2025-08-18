import eslint from '@eslint/js'
import tanstackQuery from '@tanstack/eslint-plugin-query'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import tseslint from 'typescript-eslint'

export default tseslint.config({
	extends: [
		eslint.configs.recommended,
		tseslint.configs.recommended,
		eslintConfigPrettier,
		tanstackQuery.configs['flat/recommended'],
	],
	rules: {
		'@typescript-eslint/no-unused-vars': 'warn',
		'no-throw-literal': 'error',
	},
})
