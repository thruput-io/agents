import { spawnSync } from 'node:child_process';

const MAX_BUFFER = 1 << 28;

export function runCommand(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: MAX_BUFFER });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  }
  return result.stdout;
}

export function runCommandBuffer(command, args) {
  const result = spawnSync(command, args, { encoding: 'buffer', maxBuffer: MAX_BUFFER });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: ${result.stderr.toString('utf8')}${result.stdout.toString('utf8')}`,
    );
  }
  return result.stdout;
}

export function runCommandInDir(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  }
  return result.stdout;
}
