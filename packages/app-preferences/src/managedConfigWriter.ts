import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';

class ManagedConfigWriter {
  public async readTextFile(filePath: string): Promise<string> {
    return this._readText(filePath, '');
  }

  public async readJsonValue(filePath: string, path: string[]): Promise<unknown> {
    const content = await this._readText(filePath, '{}');
    const errors: ParseError[] = [];
    const root = parse(content, errors, {
      allowTrailingComma: true,
      disallowComments: false,
    }) as unknown;
    if (errors.length > 0) throw new Error(`Invalid JSON configuration: ${filePath}`);
    return path.reduce<unknown>((current, key) => {
      if (!this._isRecord(current)) return undefined;
      return current[key];
    }, root);
  }

  public async writeJsonValue(filePath: string, path: string[], value: unknown): Promise<void> {
    const content = await this._readText(filePath, '{}\n');
    const errors: ParseError[] = [];
    parse(content, errors, { allowTrailingComma: true, disallowComments: false });
    if (errors.length > 0) throw new Error(`Invalid JSON configuration: ${filePath}`);
    const edits = modify(content, path, value, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' },
    });
    await this._atomicWrite(filePath, applyEdits(content, edits));
  }

  public async readManagedTomlBlock(
    filePath: string,
    beginMarker: string,
    endMarker: string,
  ): Promise<string | null> {
    const content = await this._readText(filePath, '');
    const start = content.indexOf(beginMarker);
    if (start < 0) return null;
    const end = content.indexOf(endMarker, start);
    if (end < 0) throw new Error(`Incomplete managed TOML block: ${filePath}`);
    return content.slice(start, end + endMarker.length);
  }

  public async writeManagedTomlBlock(
    filePath: string,
    beginMarker: string,
    endMarker: string,
    block: string | null,
  ): Promise<void> {
    const content = await this._readText(filePath, '');
    const start = content.indexOf(beginMarker);
    let next = content;
    if (start >= 0) {
      const end = content.indexOf(endMarker, start);
      if (end < 0) throw new Error(`Incomplete managed TOML block: ${filePath}`);
      const after = end + endMarker.length;
      next = `${content.slice(0, start).trimEnd()}\n${content.slice(after).trimStart()}`.trim();
    }
    if (block) next = `${next.trimEnd()}${next.trim() ? '\n\n' : ''}${block.trim()}\n`;
    else if (next) next = `${next.trimEnd()}\n`;
    await this._atomicWrite(filePath, next);
  }

  private async _readText(filePath: string, fallback: string): Promise<string> {
    try {
      return await readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
      throw error;
    }
  }

  private async _atomicWrite(filePath: string, content: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const timestamp = new Date().toISOString().replaceAll(/[:.]/gu, '-');
    const temporaryPath = `${filePath}.polytrader2.tmp`;
    const backupPath = `${filePath}.polytrader2.${timestamp}.bak`;
    await writeFile(temporaryPath, content, 'utf8');
    if (!existsSync(filePath)) {
      await rename(temporaryPath, filePath);
      return;
    }
    await rename(filePath, backupPath);
    try {
      await rename(temporaryPath, filePath);
    } catch (error) {
      await rename(backupPath, filePath);
      throw error;
    }
  }

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

export { ManagedConfigWriter };
