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
  // Resend accepted the mail; a body that won't parse must not read as a
  // failed send (callers may retry a "failure" and double-send).
  const data = (await res.json().catch(() => null)) as { id?: string } | null;
  return { sent: true, id: data?.id ?? null };
};

export { mdToHtml } from "./markdown";
