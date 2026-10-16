import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
				/*
				 * `svelte/no-navigation-without-resolve` accepts a value whose type is
				 * `ResolvedPathname` — the type `resolve()` returns. That check needs
				 * the type checker, so the parser must be given the project; without it
				 * the rule can only see literal `resolve(...)` calls and flags every
				 * component that forwards a prop through to an `<a href>`.
				 */
				projectService: true,
				extraFileExtensions: ['.svelte']
			}
		}
	},
	{
		rules: {
			/*
			 * A leading underscore marks a binding that exists only for its position
			 * — an `{#each Array(24) as _, hour}` placeholder, a discarded value in a
			 * destructure, a caught error we deliberately swallow. Without this the
			 * only way to satisfy the rule is to delete a binding the syntax needs.
			 */
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_'
				}
			]
		}
	},
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'dev-dist/',
			'dist/',
			'package/',
			'coverage/',
			'playwright-report/',
			'test-results/',
			'node_modules/'
		]
	}
);
