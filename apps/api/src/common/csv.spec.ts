import { csvSafe, csvSafeRows } from './csv';

describe('csvSafe (spreadsheet formula-injection guard)', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tcmd', '\rx', '=HYPERLINK("http://evil")', `=cmd|'/c calc'!A1`])(
    'prefixes a dangerous leading char: %s',
    (input) => {
      expect(csvSafe(input)).toBe(`'${input}`);
    },
  );

  it.each(['Asha', 'O+', '9800000001', 'already safe', '2026-01-01', 'a=b'])(
    'leaves safe values untouched: %s',
    (input) => {
      expect(csvSafe(input)).toBe(input);
    },
  );

  it('handles null/undefined as empty string', () => {
    expect(csvSafe(null)).toBe('');
    expect(csvSafe(undefined)).toBe('');
  });

  it('neutralises every cell of every row', () => {
    const rows = csvSafeRows([
      { name: '=danger', phone: '9800000001', note: '@cmd' },
    ]);
    expect(rows).toEqual([{ name: "'=danger", phone: '9800000001', note: "'@cmd" }]);
  });
});
