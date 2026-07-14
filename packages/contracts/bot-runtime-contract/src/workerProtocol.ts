export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface SerializedStrategyError {
  name: string;
  message: string;
  stack?: string;
}

export type StrategyWorkerCommand =
  | {
      kind: 'command';
      id: string;
      command: 'start';
      payload: {
        compiledCode: string;
        context: JsonValue;
        memoryLimitMb: number;
        compileTimeoutMs: number;
        callbackTimeoutMs: number;
      };
    }
  | {
      kind: 'command';
      id: string;
      command: 'callback';
      payload: {
        name: string;
        args: JsonValue[];
      };
    }
  | {
      kind: 'command';
      id: string;
      command: 'stop' | 'dispose';
      payload?: null;
    };

export type StrategyWorkerHostResponse =
  | {
      kind: 'host-response';
      id: string;
      ok: true;
      result: JsonValue;
    }
  | {
      kind: 'host-response';
      id: string;
      ok: false;
      error: SerializedStrategyError;
    };

export type StrategyWorkerParentMessage = StrategyWorkerCommand | StrategyWorkerHostResponse;

export type StrategyWorkerCommandResponse =
  | {
      kind: 'command-response';
      id: string;
      ok: true;
      result: JsonValue;
    }
  | {
      kind: 'command-response';
      id: string;
      ok: false;
      error: SerializedStrategyError;
    };

export type StrategyWorkerHostCall = {
  kind: 'host-call';
  id: string;
  method: string;
  args: JsonValue[];
};

export type StrategyWorkerEvent = {
  kind: 'event';
  event: 'ready' | 'stdout' | 'stderr' | 'fatal';
  payload: JsonObject;
};

export type StrategyWorkerChildMessage =
  StrategyWorkerCommandResponse | StrategyWorkerHostCall | StrategyWorkerEvent;

interface JsonSanitizeOptions {
  maxDepth?: number;
}

const DEFAULT_MAX_JSON_DEPTH = 32;

export function serializeStrategyError(error: unknown): SerializedStrategyError {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: error.stack,
    };
  }
  return {
    name: 'Error',
    message: typeof error === 'string' ? error : safeStringify(error),
  };
}

export function toJsonValue(value: unknown, options: JsonSanitizeOptions = {}): JsonValue {
  return sanitizeJsonValue(value, options.maxDepth ?? DEFAULT_MAX_JSON_DEPTH, 0, new WeakSet());
}

export function toJsonArray(value: unknown): JsonValue[] {
  const json = toJsonValue(value);
  return Array.isArray(json) ? json : [];
}

export function toJsonObject(value: unknown): JsonObject {
  const json = toJsonValue(value);
  return json && typeof json === 'object' && !Array.isArray(json) ? json : {};
}

function sanitizeJsonValue(
  value: unknown,
  maxDepth: number,
  depth: number,
  seen: WeakSet<object>,
): JsonValue {
  if (depth > maxDepth) return null;
  if (value == null) return null;

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') return value as string | boolean;
  if (valueType === 'number') {
    const numberValue = value as number;
    return Number.isFinite(numberValue) ? numberValue : null;
  }
  if (valueType === 'bigint') return value.toString();
  if (valueType === 'function' || valueType === 'symbol' || valueType === 'undefined') return null;

  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Error)
    return sanitizeJsonValue(serializeStrategyError(value), maxDepth, depth + 1, seen);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item, maxDepth, depth + 1, seen));
  }

  if (typeof value !== 'object') return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === 'function') {
    try {
      return sanitizeJsonValue(toJSON.call(value), maxDepth, depth + 1, seen);
    } catch {
      return null;
    }
  }

  const output: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
      continue;
    }
    output[key] = sanitizeJsonValue(item, maxDepth, depth + 1, seen);
  }
  return output;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(toJsonValue(value));
  } catch {
    return String(value);
  }
}
