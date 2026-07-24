import type { StrategyAstDocument } from '../types.js';

class StrategyAstCanonicalizer {
  public canonicalize(document: StrategyAstDocument): string {
    return JSON.stringify(this._sortValue(document));
  }

  public async hash(document: StrategyAstDocument): Promise<string> {
    const bytes = new TextEncoder().encode(this.canonicalize(document));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }

  private _sortValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this._sortValue(item));
    if (!value || typeof value !== 'object') return value;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = this._sortValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
}

export { StrategyAstCanonicalizer };
