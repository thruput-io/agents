import { spawnSync } from 'node:child_process';

function spawnChecked(command, args, encoding) {
  const result = spawnSync(command, args, { encoding, maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  return result.stdout;
}

export function run(command, args) {
  return spawnChecked(command, args, 'utf8');
}

export function runBuffer(command, args) {
  return spawnChecked(command, args, 'buffer');
}
