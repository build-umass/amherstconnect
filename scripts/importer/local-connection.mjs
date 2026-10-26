import { execFileSync } from 'node:child_process';

export function localConnection() {
  const cli = process.platform === 'win32' ? 'node_modules/.bin/supabase.cmd' : 'node_modules/.bin/supabase';
  try {
    const status = JSON.parse(execFileSync(cli, ['status', '--output-format', 'json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32',
    }));
    return status.env;
  } catch {
    throw new Error('Unable to read local Supabase status. Start the local stack first.');
  }
}
