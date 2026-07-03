import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { app } from 'electron';

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex <= 0) return null;
  const key = trimmed.slice(0, separatorIndex).trim();
  const rawValue = trimmed.slice(separatorIndex + 1).trim();
  if (!key) return null;
  const value =
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue.slice(1, -1)
      : rawValue;
  return [key, value];
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const pair = parseEnvLine(line);
    if (!pair) continue;
    const [key, value] = pair;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv(): void {
  const mode = process.env.NODE_ENV;
  const filenames = mode ? [`.env.${mode}`, '.env'] : ['.env'];
  const candidates = filenames.flatMap((filename) => [
    resolve(process.cwd(), filename),
    resolve(app.getAppPath(), filename),
  ]);
  for (const candidate of candidates) {
    loadEnvFile(candidate);
  }
}

export { loadLocalEnv };
