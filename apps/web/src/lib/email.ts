/**
 * Minimal Resend wrapper. EMAIL_DRY_RUN=true (or a missing API key) prints
 * to stdout instead of sending — the digest pipeline works before Resend is
 * configured.
 */
export const sendEmail = async (input: {
  subject: string;
  html: string;
}): Promise<{ sent: boolean; id: string | null }> => {
  const apiKey = process.env.RESEND_API_KEY;
  const dryRun = process.env.EMAIL_DRY_RUN === "true" || !apiKey;

  if (dryRun) {
    console.log(`[email dry-run] subject: ${input.subject}\n${input.html.slice(0, 500)}…`);
    return { sent: false, id: null };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.DIGEST_FROM ?? "Sprout <onboarding@resend.dev>",
      to: (process.env.DIGEST_TO ?? "").split(",").map((e) => e.trim()),
      subject: input.subject,
      html: input.html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return { sent: true, id: data.id };
};

/** Tiny markdown→HTML for digest emails (headings, bold, links, lists). */
export const mdToHtml = (md: string): string =>
  md
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]+?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>")
    .split(/\n{2,}/)
    .map((b) => (/^<(h\d|ul|li)/.test(b.trim()) ? b : `<p>${b.trim()}</p>`))
    .join("\n");
