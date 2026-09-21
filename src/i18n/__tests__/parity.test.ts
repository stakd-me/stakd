import { readFileSync } from "node:fs";
import { join } from "node:path";

const LOCALES = ["en", "vi", "es", "de"] as const;
type Locale = (typeof LOCALES)[number];

/**
 * Read the dictionaries as text rather than importing them: the point is
 * to check what is in the files, including duplicate keys, which an
 * imported object would silently collapse.
 */
function readDictionary(locale: Locale): Map<string, string> {
  const source = readFileSync(
    join(process.cwd(), "src", "i18n", `${locale}.ts`),
    "utf8"
  );
  const entries = new Map<string, string>();
  const pattern = /^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)",\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    entries.set(match[1], match[2]);
  }
  return entries;
}

const dictionaries = Object.fromEntries(
  LOCALES.map((locale) => [locale, readDictionary(locale)])
) as Record<Locale, Map<string, string>>;

/**
 * Strings still carrying the English text. `Record<TranslationKeys, string>`
 * makes a *missing* key a compile error, but a key filled in with the
 * English sentence type-checks fine, so these baselines are the only
 * thing stopping that pile from growing. Lower them; never raise them.
 */
const UNTRANSLATED_BASELINE: Record<Exclude<Locale, "en">, number> = {
  vi: 2,
  es: 329,
  de: 331,
};

describe("i18n dictionaries", () => {
  it("parses every locale", () => {
    for (const locale of LOCALES) {
      expect(dictionaries[locale].size).toBeGreaterThan(900);
    }
  });

  it("has the same keys in every locale", () => {
    const englishKeys = [...dictionaries.en.keys()].sort();
    for (const locale of LOCALES) {
      if (locale === "en") continue;
      const localeKeys = [...dictionaries[locale].keys()].sort();
      const missing = englishKeys.filter((key) => !dictionaries[locale].has(key));
      const extra = localeKeys.filter((key) => !dictionaries.en.has(key));
      expect({ locale, missing, extra }).toEqual({
        locale,
        missing: [],
        extra: [],
      });
    }
  });

  it("keeps the same interpolation placeholders as English", () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

    for (const locale of LOCALES) {
      if (locale === "en") continue;
      const mismatches: string[] = [];
      for (const [key, english] of dictionaries.en) {
        const translated = dictionaries[locale].get(key);
        if (translated === undefined) continue;
        const expected = placeholders(english);
        const actual = placeholders(translated);
        if (expected.join(",") !== actual.join(",")) {
          mismatches.push(`${key}: expected {${expected}} got {${actual}}`);
        }
      }
      expect({ locale, mismatches }).toEqual({ locale, mismatches: [] });
    }
  });

  it("does not add more untranslated strings", () => {
    for (const locale of LOCALES) {
      if (locale === "en") continue;
      let untranslated = 0;
      for (const [key, english] of dictionaries.en) {
        const translated = dictionaries[locale].get(key);
        // Short strings are often legitimately identical (symbols, units).
        if (translated === english && english.length > 12) untranslated += 1;
      }
      expect({ locale, untranslated }).toEqual({
        locale,
        untranslated: UNTRANSLATED_BASELINE[locale],
      });
    }
  });

  it("has no duplicate keys within a locale", () => {
    for (const locale of LOCALES) {
      const source = readFileSync(
        join(process.cwd(), "src", "i18n", `${locale}.ts`),
        "utf8"
      );
      const keys = [...source.matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]);
      const seen = new Set<string>();
      const duplicates = keys.filter((key) => {
        if (seen.has(key)) return true;
        seen.add(key);
        return false;
      });
      expect({ locale, duplicates }).toEqual({ locale, duplicates: [] });
    }
  });
});
