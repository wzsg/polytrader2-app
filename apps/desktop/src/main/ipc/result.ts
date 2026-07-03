import type { ApiResult } from '@polytrader/shared';

export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(err: unknown): ApiResult<T> {
  return { ok: false, error: toErrorMessage(err) };
}

export function wrap<T, Args extends unknown[]>(
  handler: (...args: Args) => T | Promise<T>,
): (_event: Electron.IpcMainInvokeEvent, ...args: Args) => Promise<ApiResult<T>> {
  return async (_event, ...args) => {
    try {
      return ok(await handler(...args));
    } catch (err) {
      return fail(err);
    }
  };
}
