import { localConnection } from './importer/local-connection.mjs';
import { createLocalTransport } from './importer/importer.mjs';
import { runSavedEventReminders } from './notifications/reminders.mjs';

if (process.argv.length !== 3 || process.argv[2] !== '--simulate') {
  console.error('Usage: node scripts/run-local-reminders.mjs --simulate');
  process.exitCode = 1;
} else {
  const connection = localConnection();
  const transport = createLocalTransport(connection.API_URL, connection.SERVICE_ROLE_KEY ?? connection.SECRET_KEY);
  const result = await runSavedEventReminders({
    rpc: (name, body) => transport(`rpc/${name}`, { method: 'POST', body }),
    deliver: async () => 'accepted',
  });
  console.log(JSON.stringify(result));
}
