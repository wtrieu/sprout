/**
 * Tiny markdown→HTML (headings, bold, links, lists) — digest emails + UI.
 *
 * The input is treated as UNTRUSTED: brief bodies are LLM-generated from RAG
 * over crawled pediatric sources, so a malicious source page or a prompt
 * injection could smuggle raw HTML or a `javascript:` link into the string.
 * The output is injected via `dangerouslySetInnerHTML` (see components/Markdown)
 * and into digest email HTML, so we must neutralise those vectors:
 *   1. HTML-escape the whole input first, so any raw `<script>`/`<img onerror>`
 *      becomes inert text before our own safe tags are inserted.
 *   2. Restrict link hrefs to safe schemes (http/https/mailto, relative, and
 *      in-page anchors); anything else renders as plain text, not a link.
 */

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Return the href if its scheme is safe to render, otherwise null. */
const safeHref = (url: string): string | null => {
  const trimmed = url.trim();
  // Relative paths and in-page anchors carry no scheme and are safe.
  if (/^(\/|#|\.)/.test(trimmed)) return trimmed;
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  return null;
};

export const mdToHtml = (md: string): string =>
  escapeHtml(md)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, url: string) => {
      const href = safeHref(url);
      return href ? `<a href="${href}">${text}</a>` : text;
    })
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]+?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>")
    .split(/\n{2,}/)
    .map((b) => (/^<(h\d|ul|li)/.test(b.trim()) ? b : `<p>${b.trim()}</p>`))
    .join("\n");
