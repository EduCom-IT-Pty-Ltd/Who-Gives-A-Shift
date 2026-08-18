/** RFC 4180 CSV, with a UTF-8 BOM so Excel opens it without mangling names. */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
