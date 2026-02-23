export { default as en } from "./en";
export type { TranslationKeys } from "./en";
export { default as vi } from "./vi";
export { default as es } from "./es";
export { default as de } from "./de";

import en from "./en";
import vi from "./vi";
import es from "./es";
import de from "./de";

export const translations = { en, vi, es, de } as const;
export type Locale = keyof typeof translations;
