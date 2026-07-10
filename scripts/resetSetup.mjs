import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const bootstrapConfigPath = join(resolveAppDataDirectory(), 'Polytrader2', 'bootstrap.json');

if (!existsSync(bootstrapConfigPath)) {
  console.log(`Initial setup is already reset: ${bootstrapConfigPath}`);
  process.exit(0);
}

rmSync(bootstrapConfigPath);
console.log(`Initial setup reset. Restart the app to open the setup window: ${bootstrapConfigPath}`);

function resolveAppDataDirectory() {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support');
  }
  if (process.platform === 'win32') {
    if (!process.env.APPDATA) throw new Error('APPDATA is not set');
    return process.env.APPDATA;
  }
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
}
