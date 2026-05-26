/**
 * CSV Parser for Portfolio transaction import/export.
 *
 * This module is the single source of truth for the application's CSV dialect:
 * - Alias-based header matching (flexible column names from user exports)
 * - Robust quote-aware matrix parsing (handles commas inside quoted fields, "" escapes, \r\n)
 * - Strict required-column validation for safety
 *
 * All pure, zero side effects, no React/i18n/store dependencies.
 * Used by the Portfolio page for both import (preview + validation) and export (escaping).
 *
 * See plan.md §9 for the approved incremental refactor roadmap (Improvement #1).
 */

export type CsvRequiredColumn = "date" | "symbol" | "quantity" | "price";

export const CSV_HEADER_ALIASES: Record<string, string[]> = {
  date: ["date", "transactedat", "timestamp", "datetime"],
  type: ["type", "txtype", "transactiontype"],
  symbol: ["symbol", "tokensymbol", "token"],
  name: ["name", "tokenname"],
  quantity: ["quantity", "qty", "amount"],
  price: ["price", "priceperunit", "unitprice", "priceusd"],
  fee: ["fee", "fees"],
  note: ["note", "notes"],
  coingeckoId: ["coingeckoid", "coingecko"],
};

export const REQUIRED_CSV_COLUMNS: CsvRequiredColumn[] = ["date", "symbol", "quantity", "price"];

/**
 * Normalizes a header for alias matching.
 * Lowercases + strips everything except a-z0-9.
 */
export function normalizeCsvHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Robust CSV matrix parser (no external deps).
 * Handles:
 * - Fields containing commas when quoted
 * - Escaped quotes ("")
 * - \r\n and \n line endings
 * - Trailing newlines / empty rows
 * - Throws "CSV_UNCLOSED_QUOTES" on malformed input (exact message used by UI)
 */
export function parseCsvMatrix(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      const next = content[i + 1];
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && content[i + 1] === "\n") {
        i++;
      }
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += ch;
  }

  if (inQuotes) {
    throw new Error("CSV_UNCLOSED_QUOTES");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim().length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Looks up a field value using the alias list for a logical column.
 * Returns trimmed string or "" if not found.
 */
export function getCsvField(row: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const normalizedAlias = normalizeCsvHeader(alias);
    if (row[normalizedAlias] !== undefined) {
      return row[normalizedAlias].trim();
    }
  }
  return "";
}

/**
 * Escapes a field for CSV output (used by the export path).
 * Wraps in quotes if it contains comma, quote, or newline.
 */
export function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}