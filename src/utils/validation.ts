/**
 * Input validation utilities.
 * Ported from vapi-crm-bridge/index.ts — aynı regex ve mantık.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUUID(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`Invalid UUID for field '${field}': ${String(value).slice(0, 40)}`);
  }
  return value;
}

export function sanitizeText(value: unknown, field: string, maxLen = 1000): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`Field '${field}' must be a string`);
  if (value.length > maxLen) throw new Error(`Field '${field}' exceeds max length ${maxLen}`);
  return value;
}
