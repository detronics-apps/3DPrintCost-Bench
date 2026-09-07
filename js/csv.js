/**
 * A small, forgiving CSV reader. Pure.
 *
 * It is the format a spreadsheet, an old system or an accountant exports, so the
 * owner can bring in what existed before the app. It handles quoted fields with
 * embedded commas, quotes and newlines, a leading BOM, and either line ending;
 * it does not try to guess types — every value comes back as a trimmed string
 * for the importer to interpret.
 */

/** Parse CSV text into { headers, rows } where each row is a header→value map. */
export function parseCsv(text) {
  const s = String(text ?? '').replace(/^﻿/, '');
  const table = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); table.push(row); field = ''; row = [];
    } else if (c === '\r') {
      // handled by the \n that follows in \r\n; a lone \r is treated as a break
      if (s[i + 1] !== '\n') { row.push(field); table.push(row); field = ''; row = []; }
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); table.push(row); }

  const nonEmpty = table.filter((r) => r.some((v) => String(v).trim() !== ''));
  if (!nonEmpty.length) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => String(h).trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = String(r[idx] ?? '').trim(); });
    return obj;
  });
  return { headers, rows };
}

/**
 * Read a field from a parsed row by any of several header aliases,
 * case-insensitively. Returns '' when none of the aliases is present or filled.
 */
export function field(row, ...aliases) {
  if (!row) return '';
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const k = keys.find((key) => key.toLowerCase() === String(alias).toLowerCase());
    if (k != null && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  return '';
}

/** Turn an array of objects into CSV text, for the downloadable sample templates. */
export function toCsv(headers, rows = []) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(cell).join(',')];
  for (const row of rows) lines.push(headers.map((h) => cell(row[h])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
