import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { cells.push(value.trim()); value = ''; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}

export async function readRows(path) {
  const text = await readFile(path, 'utf8');
  if (extname(path).toLowerCase() === '.json') {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed.rows || parsed.events || parsed.data;
    if (!Array.isArray(rows)) throw new Error('JSON report must contain an array, rows, events, or data.');
    return rows;
  }
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replaceAll(/^_|_$/g, ''));
  return lines.slice(1).map((line) => Object.fromEntries(parseCsvLine(line).map((value, index) => [headers[index], value])));
}

export function pick(row, ...names) {
  for (const name of names) if (row[name] !== undefined && row[name] !== '') return row[name];
  return null;
}
