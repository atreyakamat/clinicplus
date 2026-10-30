/**
 * Neutralises spreadsheet formula injection in exported CSV cells: a value that
 * starts with = + - @ (or a tab/CR that Excel treats the same) is prefixed with
 * a single quote so Excel/Sheets render it as text instead of executing it.
 * Patient- and staff-entered free text (names, phones, reasons) ends up in
 * exports, so every exported cell must pass through this.
 */
export const csvSafe = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

/** Applies csvSafe to every value of each row object (shallow). */
export const csvSafeRows = <T extends Record<string, unknown>>(rows: T[]): Record<string, string>[] =>
  rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(row)) out[k] = csvSafe(val);
    return out;
  });
