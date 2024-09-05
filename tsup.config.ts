import { defineConfig } from 'tsup';

export default defineConfig({
	bundle: false,
	clean: true,
	dts: true,
	entry: ['src/**/*.ts'],
	format: ['cjs', 'esm'],
	outDir: 'lib',
	sourcemap: true,
});
