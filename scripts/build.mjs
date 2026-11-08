import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const client = resolve(dist, 'client');
const server = resolve(dist, 'server');
const metadata = resolve(dist, '.openai');
const hosting = JSON.parse(await readFile(resolve(root, '.openai/hosting.json'), 'utf8'));
if (hosting.static || hosting.d1 !== 'DB' || !hosting.project_id) {
  throw new Error('Expected the existing Sites project and DB binding in the Worker manifest.');
}

const html = await readFile(resolve(dist, 'index.html'), 'utf8');
const data = html.match(/<script\b[^>]*\bid="bookdata"[^>]*>([\s\S]*?)<\/script>/);
if (!data) throw new Error('Catalog data (#bookdata) is missing.');
const editionKeys = JSON.parse(data[1]).flatMap(book => book.variants.map(variant => variant.key));
if (!editionKeys.length || new Set(editionKeys).size !== editionKeys.length ||
    editionKeys.some(key => !/^\d{13}(?:-\d{13})?$/.test(key))) {
  throw new Error('The catalog contains missing, malformed, or duplicate edition keys.');
}
await Promise.all([client, server, metadata].map(async directory => {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
}));
const publicFiles = (await readdir(dist, { withFileTypes: true }))
  .filter(entry => entry.isFile() && /^[^.][^/]*\.(?:html|css|js|xlsx|png|jpe?g|webp|svg|ico)$/.test(entry.name))
  .map(entry => entry.name);
for (const name of [...publicFiles, 'covers']) {
  await cp(resolve(dist, name), resolve(client, name), { recursive: true });
}
await build({
  stdin: {
    contents: `import { createWorker } from './worker/index.js'; export default createWorker(${JSON.stringify(editionKeys)});`,
    resolveDir: root, sourcefile: 'bookshelf-worker-entry.js'
  },
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  external: ['node:crypto'], outfile: resolve(server, 'index.js')
});
const config = {
  name: 'baby-bookshelf',
  main: 'index.js',
  compatibility_date: '2026-05-15',
  compatibility_flags: ['nodejs_compat'],
  assets: { directory: '../client', binding: 'ASSETS', run_worker_first: ['/api/*'] },
  d1_databases: [{ binding: 'DB', database_name: 'site-creator-d1', database_id: '00000000-0000-4000-8000-000000000000', migrations_dir: '../../drizzle' }]
};
await writeFile(resolve(server, 'wrangler.json'), JSON.stringify(config, null, 2) + '\n');
await writeFile(resolve(metadata, 'hosting.json'), JSON.stringify(hosting, null, 2) + '\n');
await cp(resolve(root, 'drizzle'), resolve(metadata, 'drizzle'), { recursive: true });
console.log('Built Worker with ' + editionKeys.length + ' edition keys and ' +
  (await readdir(resolve(client, 'covers'))).length + ' separate cover assets.');
