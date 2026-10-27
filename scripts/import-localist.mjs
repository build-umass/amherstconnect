import { readFile } from 'node:fs/promises';
import { createLocalTransport } from './importer/importer.mjs';
import { localConnection } from './importer/local-connection.mjs';
import { ensureLocalCatalog, importLocalistWindow } from './importer/localist.mjs';

try {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--setup-local-catalog') options.setup = true;
    else if (['--start', '--end', '--mappings', '--page-size'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) options[args[i].slice(2)] = args[++i];
    else throw new Error('Invalid arguments.');
  }
  if (!options.start || !options.end || !options.mappings) throw new Error('Missing arguments.');
  const mappings = JSON.parse(await readFile(options.mappings, 'utf8'));
  const connection = localConnection();
  const transport = createLocalTransport(connection.API_URL, connection.SERVICE_ROLE_KEY ?? connection.SECRET_KEY);
  if (options.setup) await ensureLocalCatalog(mappings, transport);
  const result = await importLocalistWindow({ range: { start: options.start, end: options.end }, mappings, transport,
    pageSize: options['page-size'] === undefined ? 100 : Number(options['page-size']) });
  console.log(JSON.stringify(result, null, 2));
  if (result.counts.rejected || result.counts.failed) process.exitCode = 1;
} catch {
  console.error('Localist import did not complete. Check the local stack, reviewed mappings, provider availability and arguments. No credentials or response bodies logged.');
  console.error('Usage: npm run import:localist -- --start YYYY-MM-DD --end YYYY-MM-DD --mappings <file.json> [--page-size 1..100] [--setup-local-catalog]');
  process.exitCode = 1;
}
