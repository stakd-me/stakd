import { describe, expect, it } from "vitest";
import {
  normalizeCsvHeader,
  parseCsvMatrix,
  getCsvField,
  escapeCsvField,
  CSV_HEADER_ALIASES,
  REQUIRED_CSV_COLUMNS,
} from "../csv-parser";

describe("csv-parser (pure)", () => {
  describe("normalizeCsvHeader", () => {
    it("lowercases and strips non-alphanumeric", () => {
      expect(normalizeCsvHeader("Transacted At")).toBe("transactedat");
      expect(normalizeCsvHeader("Price (USD)")).toBe("priceusd");
      expect(normalizeCsvHeader("  Token-Symbol! ")).toBe("tokensymbol");
    });
  });

  describe("parseCsvMatrix", () => {
    it("parses simple unquoted rows", () => {
      const input = "date,symbol,quantity,price\n2026-01-01,BTC,0.5,65000";
      const rows = parseCsvMatrix(input);
      expect(rows).toEqual([
        ["date", "symbol", "quantity", "price"],
        ["2026-01-01", "BTC", "0.5", "65000"],
      ]);
    });

    it("handles commas inside quoted fields", () => {
      const input = 'note,"hello, world",fee\n"test, with comma",123,0.1';
      const rows = parseCsvMatrix(input);
      expect(rows[1][0]).toBe("test, with comma");
    });

    it('handles escaped quotes ("") inside quoted fields', () => {
      const input = 'symbol,name\nBTC,"Bitcoin ""Digital Gold"""';
      const rows = parseCsvMatrix(input);
      expect(rows[1][1]).toBe('Bitcoin "Digital Gold"');
    });

    it("supports \\r\\n line endings and ignores trailing empty lines", () => {
      const input = "a,b\r\n1,2\r\n\r\n";
      const rows = parseCsvMatrix(input);
      expect(rows).toEqual([
        ["a", "b"],
        ["1", "2"],
      ]);
    });

    it('throws exact "CSV_UNCLOSED_QUOTES" on malformed input', () => {
      const input = 'a,"b,c';
      expect(() => parseCsvMatrix(input)).toThrow("CSV_UNCLOSED_QUOTES");
    });

    it("skips completely blank rows", () => {
      const input = "a,b\n\n\n1,2\n";
      const rows = parseCsvMatrix(input);
      expect(rows).toEqual([
        ["a", "b"],
        ["1", "2"],
      ]);
    });
  });

  describe("getCsvField + alias matching", () => {
    it("finds fields via aliases (case/punctuation insensitive)", () => {
      // Real callers (parseCsvFile) build the row object with *already normalized* keys
      const row = {
        transactedat: "2026-01-01",
        tokensymbol: "ETH",
        qty: "1.2",
        priceusd: "2500",
      };
      expect(getCsvField(row, CSV_HEADER_ALIASES.date)).toBe("2026-01-01");
      expect(getCsvField(row, CSV_HEADER_ALIASES.symbol)).toBe("ETH");
      expect(getCsvField(row, CSV_HEADER_ALIASES.quantity)).toBe("1.2");
      expect(getCsvField(row, CSV_HEADER_ALIASES.price)).toBe("2500");
    });

    it("returns empty string for missing columns", () => {
      const row = { foo: "bar" };
      expect(getCsvField(row, CSV_HEADER_ALIASES.note)).toBe("");
    });
  });

  describe("escapeCsvField (export symmetry)", () => {
    it("wraps fields containing comma, quote, or newline", () => {
      expect(escapeCsvField("simple")).toBe("simple");
      expect(escapeCsvField("has,comma")).toBe('"has,comma"');
      expect(escapeCsvField('has"quote')).toBe('"has""quote"');
      expect(escapeCsvField("multi\nline")).toBe('"multi\nline"');
    });
  });

  describe("constants", () => {
    it("REQUIRED_CSV_COLUMNS contains the four mandatory columns", () => {
      expect(REQUIRED_CSV_COLUMNS).toEqual(["date", "symbol", "quantity", "price"]);
    });

    it("CSV_HEADER_ALIASES has entries for all required columns", () => {
      expect(CSV_HEADER_ALIASES.date.length).toBeGreaterThan(0);
      expect(CSV_HEADER_ALIASES.symbol.length).toBeGreaterThan(0);
      expect(CSV_HEADER_ALIASES.quantity.length).toBeGreaterThan(0);
      expect(CSV_HEADER_ALIASES.price.length).toBeGreaterThan(0);
    });
  });
});