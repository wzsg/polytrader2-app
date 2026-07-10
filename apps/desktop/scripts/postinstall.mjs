import { spawnSync } from 'child_process';

if (process.env.P2_SKIP_POSTINSTALL_REBUILD === '1') {
  process.exit(0);
}

const command = process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild';
const result = spawnSync(command, ['-f', '-o', 'better-sqlite3', '--parallel'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
