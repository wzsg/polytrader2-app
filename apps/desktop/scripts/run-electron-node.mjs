import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const electronBin =
  process.platform === 'win32'
    ? path.join(workspaceRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
    : path.join(workspaceRoot, 'node_modules', '.bin', 'electron');

const launcherArgs = process.argv.slice(2);
const [script = 'scripts/crypto-events-smoke.mjs', ...rawArgs] = launcherArgs;
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const scriptPath = path.isAbsolute(script) ? script : path.resolve(__dirname, '..', script);

const child = spawn(electronBin, [scriptPath, ...args], {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
