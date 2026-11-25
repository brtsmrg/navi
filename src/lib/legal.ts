/**
 * Facts the About & legal screen, the privacy page and the terms page all quote.
 * Anything in square brackets is a placeholder the owner must fill before the app goes to a store.
 * `npm run launch-check` lists every placeholder still left.
 */
export const LEGAL = {
  /** Who runs Navi: a legal name, or "sole proprietor". */
  owner: '[ADD LEGAL NAME]',
  /** Where people write to about privacy, security or support. */
  contact: '[ADD CONTACT EMAIL]',
  /** Province whose law governs the terms. */
  law: '[ADD PROVINCE], Canada',
  /** Date of the current privacy and terms text. */
  updated: '2026-11-25',
} as const;

export const PRIVACY_URL = `${import.meta.env.BASE_URL}privacy.html`;
export const TERMS_URL = `${import.meta.env.BASE_URL}terms.html`;
export const LICENSES_URL = `${import.meta.env.BASE_URL}licenses.txt`;
export const hasPlaceholder = (s: string): boolean => /\[ADD [A-Z ]+\]/.test(s);
