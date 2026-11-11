// CSV con separador ";" y BOM (abre bien en Excel con configuración de Chile).
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((c) => {
          const text = c === null || c === undefined ? '' : String(c);
          return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(';')
    )
    .join('\r\n');
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const blob = new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
