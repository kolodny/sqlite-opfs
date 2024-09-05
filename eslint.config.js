import eslint from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import markdown from 'eslint-plugin-markdown';
import n from 'eslint-plugin-n';
import packageJson from 'eslint-plugin-package-json/configs/recommended';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['lib', 'node_modules', 'pnpm-lock.yaml', '**/*.snap'],
	},
	{
		linterOptions: {
			reportUnusedDisableDirectives: 'error',
		},
	},
	eslint.configs.recommended,
	...markdown.configs.recommended,
	comments.recommended,
	n.configs['flat/recommended'],
	packageJson,
	...tseslint.config({
		extends: [
			...tseslint.configs.strictTypeChecked,
			...tseslint.configs.stylisticTypeChecked,
		],
		files: ['**/*.js', '**/*.ts'],
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ['*.*s', 'eslint.config.js'],
					defaultProject: './tsconfig.json',
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// These off-by-default rules work well for this repo and we like them on.
			'logical-assignment-operators': [
				'error',
				'always',
				{ enforceForIfStatements: true },
			],
			'operator-assignment': 'error',
			quotes: ['error', 'single', { avoidEscape: true }],

			// These on-by-default rules don't work well for this repo and we like them off.
			'no-constant-condition': 'off',

			// These on-by-default rules work well for this repo if configured
			'@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'all' }],

			// Stylistic concerns that don't interfere with Prettier
			'no-useless-rename': 'error',
			'object-shorthand': 'error',
		},
	}),
	{
		files: ['*.jsonc'],
		rules: {
			'jsonc/comma-dangle': 'off',
			'jsonc/no-comments': 'off',
			'jsonc/sort-keys': 'error',
		},
	},
	{
		extends: [tseslint.configs.disableTypeChecked],
		files: ['**/*.md/*.ts'],
		rules: {
			'n/no-missing-import': ['error', { allowModules: ['sqlite-opfs'] }],
		},
	},
);
