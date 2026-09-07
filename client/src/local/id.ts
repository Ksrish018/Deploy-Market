// Prefixed, readable ids (e.g. cyc_ab12cd34ef) — mirrors server/src/ids.js,
// but uses the browser's Web Crypto API instead of the nanoid package so
// the offline build needs no extra dependency for this.
export function id(prefix: string): string {
  let raw: string;
  try {
    raw = crypto.randomUUID().replace(/-/g, '');
  } catch {
    raw = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  return `${prefix}_${raw.slice(0, 10)}`;
}
