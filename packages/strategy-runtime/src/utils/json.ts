function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));
}

function parseConfig(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Strategy config must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Strategy config JSON is invalid: ${message}`, { cause: err });
  }
}

function extractOrderId(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const record = response as Record<string, unknown>;
  return String(record.orderID || record.orderId || record.order_id || record.id || '') || null;
}

function extractStatus(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const record = response as Record<string, unknown>;
  return String(record.status || record.errorMsg || record.error || '') || null;
}

export { extractOrderId, extractStatus, parseConfig, serialize };
