import eslint from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import tseslint from 'typescript-eslint'

export default tseslint.config({
	extends: [eslint.configs.recommended, tseslint.configs.recommended, eslintConfigPrettier],
	rules: {
		'@typescript-eslint/no-unused-vars': 'warn',
	},
})
