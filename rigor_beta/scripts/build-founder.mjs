import {build} from 'esbuild';
await build({entryPoints: ['app/founder-client.ts'], outfile: 'app/static/founder.js', bundle: true, format: 'esm', target: 'es2022', minify: true});
