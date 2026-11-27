/**
 * Tiny markdown→HTML (headings, bold, links, lists) — digest emails + UI.
 *
 * Output feeds dangerouslySetInnerHTML and email bodies, so the input is
 * HTML-escaped first: the only tags in the output are the ones produced here.
 */
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Link targets allowed to become <a>: http(s), mailto, #anchors, and relative
 * paths (no scheme before the first / ? #). Anything else — javascript:,
 * data:, vbscript:, … — renders as plain text. Checked on the already-escaped
 * href; entities can't smuggle a scheme because `&` was escaped to `&amp;`.
 */
const isSafeHref = (href: string): boolean => {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h)) return true;
  return !/^[^/?#]*:/.test(h);
};

export const mdToHtml = (md: string): string =>
  escapeHtml(md)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, href: string) =>
      isSafeHref(href) ? `<a href="${href.trim()}">${text}</a>` : text,
    )
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]+?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>")
    .split(/\n{2,}/)
    .map((b) => (/^<(h\d|ul|li)/.test(b.trim()) ? b : `<p>${b.trim()}</p>`))
    .join("\n");
