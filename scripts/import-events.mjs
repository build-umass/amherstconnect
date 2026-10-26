import { readFile } from 'node:fs/promises';
import { importDrafts, createLocalTransport } from './importer/importer.mjs';
import { localConnection } from './importer/local-connection.mjs';

try {
  const [draftFile, mappingFile] = process.argv.slice(2);
  if (!draftFile || !mappingFile) throw new Error('Usage: npm run import:events -- <draft-array.json> <mappings.json>');
  let drafts; let mappings;
  try {
    drafts = JSON.parse(await readFile(draftFile, 'utf8'));
    mappings = JSON.parse(await readFile(mappingFile, 'utf8'));
  } catch { throw new Error('Unable to read draft or mapping JSON. Check the input files.'); }
  if (!Array.isArray(drafts) || !drafts.length) throw new Error('Provide a nonempty array of F11 drafts from one source.');
  const sourceType = drafts.find(d => ['localist', 'campus_pulse'].includes(d?.sourceType))?.sourceType;
  if (!sourceType) throw new Error('Input must identify an external provider sourceType for the import run.');
  // status only reads the local stack. Never log its output or accept a hosted URL.
  const connection = localConnection();
  const result = await importDrafts({ sourceType, drafts, mappings,
    transport: createLocalTransport(connection.API_URL, connection.SERVICE_ROLE_KEY ?? connection.SECRET_KEY) });
  console.log(JSON.stringify(result, null, 2));
  if (result.outcomes.some(o => ['invalid', 'unresolved', 'failed'].includes(o.outcome))) process.exitCode = 1;
} catch (error) {
  // CLI subprocess failures may embed local connection variables; never print them.
  console.error(error.status !== undefined ? 'Unable to read local Supabase status. Start the local stack first.' : error.message);
  process.exitCode = 1;
}
