import type { BrowserWindowConstructorOptions } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';

function getPlatformIconFile(): string | null {
  if (process.platform === 'win32') return 'icon.ico';
  if (process.platform === 'darwin') return 'icon.icns';
  return null;
}

export function getWindowIcon(): BrowserWindowConstructorOptions['icon'] | undefined {
  const iconFile = getPlatformIconFile();
  if (!iconFile) return undefined;

  const iconPath = join(__dirname, '../../build', iconFile);
  return existsSync(iconPath) ? iconPath : undefined;
}
