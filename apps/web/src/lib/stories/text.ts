/**
 * Couplet separators arrive as " / " (that's how the lullaby form dictates
 * line breaks inline); normalize them to real newlines so the UI never
 * renders a stray slash. Trailing separators are dropped. Applied at import
 * for new stories and at display time for drafts stored before the fix.
 * Pure string logic — safe to import from client components.
 */
export const normalizePageText = (text: string): string =>
  text
    .replace(/\s*\/\s*(?=\S)/g, "\n")
    .replace(/\s*\/\s*$/g, "")
    .trim();
