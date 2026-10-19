import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const steps = [
  { script: 'supabase:start:ci', label: 'Start local Supabase database' },
  { script: 'supabase:reset', label: 'Apply migrations and configured seed data' },
  { script: 'supabase:test', label: 'Run database tests' },
  { script: 'supabase:lint', label: 'Lint the local database' },
];

function run(script) {
  return spawnSync(npmCommand, ['run', script], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function exitCode(result) {
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

let failureCode = 0;

try {
  for (const step of steps) {
    console.log(`\n==> ${step.label}`);
    const result = run(step.script);
    if (result.error || result.status !== 0) {
      failureCode = exitCode(result);
      break;
    }
  }
} finally {
  console.log('\n==> Stop local Supabase services');
  const result = run('supabase:stop');
  if ((result.error || result.status !== 0) && failureCode === 0) {
    failureCode = exitCode(result);
  }
}

process.exitCode = failureCode;
