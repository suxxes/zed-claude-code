import process from 'node:process';
import builtins from 'builtin-modules';
import esbuild, { type BuildOptions } from 'esbuild';

const isProduction = process.env.NODE_ENV === 'production';
const isWatch = process.argv.includes('--watch');

const config: BuildOptions = {
	entryPoints: ['src/index.ts'],
	outfile: 'dist/cli.cjs',
	bundle: true,
	platform: 'node',
	format: 'cjs',
	sourcemap: isProduction ? false : 'external',
	minify: isProduction,
	external: [
		'@anthropic-ai/claude-code',
		'@zed-industries/agent-client-protocol',
		'@modelcontextprotocol/sdk',
		'uuid',
		'zod',
		...builtins,
	],
};

(async () => {
	try {
		const context = await esbuild.context(config);

		if (isWatch) {
			await context.watch();
			console.log(`Watching ${config.outfile}...`);
		} else {
			await context.rebuild();
			console.log(`Built ${config.outfile}`);
			process.exit(0);
		}
	} catch (error) {
		console.error('Build failed:', error);
		process.exit(1);
	}
})();
