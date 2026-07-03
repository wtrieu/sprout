import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { children, digests } from "../db/schema";
import { ageInMonths, formatAge } from "./age";
import { callOllamaText } from "./ollama";
import { sendEmail, mdToHtml } from "./email";

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const weekStartOf = (d: Date): string => {
  const day = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return isoDate(monday);
};

/** Build, store, and send this week's digest. Idempotent per week. */
export const runWeeklyDigest = async (db: DB): Promise<string> => {
  const child = db.select().from(children).limit(1).get();
  if (!child) throw new Error("no child profile — set one up first");
  const months = ageInMonths(child.dob);
  const weekStart = weekStartOf(new Date());

  const already = db.get<{ id: number }>(
    sql`SELECT id FROM digests WHERE child_id = ${child.id} AND week_start = ${weekStart} AND sent_at IS NOT NULL`,
  );
  if (already) return `digest for week ${weekStart} already sent`;

  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const newDocs = db.all<{ title: string; summary: string | null; url: string | null }>(sql`
    SELECT title, summary, url FROM documents
    WHERE relevance = 'relevant' AND fetched_at >= ${weekAgo}
      AND (age_min_months IS NULL OR age_min_months <= ${months + 3})
      AND (age_max_months IS NULL OR age_max_months >= ${months - 3})
    ORDER BY fetched_at DESC LIMIT 12
  `);

  const bucket = db.get<{ age: number } | undefined>(
    sql`SELECT MAX(age_months) as age FROM milestones WHERE age_months <= ${months}`,
  );
  const nextBucket = db.get<{ age: number } | undefined>(
    sql`SELECT MIN(age_months) as age FROM milestones WHERE age_months > ${months}`,
  );
  const upcoming = nextBucket?.age
    ? db.all<{ domain: string; description: string }>(
        sql`SELECT domain, description FROM milestones WHERE age_months = ${nextBucket.age} LIMIT 8`,
      )
    : [];

  const weekActivities = db.all<{ title: string; description: string }>(
    sql`SELECT title, description FROM activities WHERE week_start = ${weekStart} AND status = 'suggested' LIMIT 7`,
  );

  const failedJobs = db.get<{ n: number }>(
    sql`SELECT COUNT(*) as n FROM jobs WHERE status = 'failed' AND created_at >= ${weekAgo}`,
  );

  const prompt = `Write a short, warm weekly email digest for a parent. Their child ${child.name} is ${formatAge(months)} old this week.

Use ONLY the material below. Markdown, ~300 words max. Structure:
- One-line greeting tied to the age.
- "This week in the library" — the new articles (title + one-line takeaway each, keep the links as markdown links).
- "Coming up" — 3-4 upcoming milestones to look forward to (around ${nextBucket?.age ?? months + 3} months).
- "This week's activities" — if any are listed.
Do not invent facts, articles, or milestones not listed below. No medical advice.

NEW ARTICLES:
${newDocs.length ? newDocs.map((d) => `- [${d.title}](${d.url ?? "#"}): ${d.summary ?? ""}`).join("\n") : "(none this week)"}

UPCOMING MILESTONES (~${nextBucket?.age ?? "?"} months):
${upcoming.map((m) => `- (${m.domain}) ${m.description}`).join("\n") || "(none)"}

THIS WEEK'S ACTIVITIES:
${weekActivities.map((a) => `- ${a.title}: ${a.description}`).join("\n") || "(none)"}`;

  const contentMd = await callOllamaText(prompt, { temperature: 0.5 });
  const footer =
    `\n\n---\n*Sprout digest · ${child.name} at ${formatAge(months)} · sources are summarized, not medical advice*` +
    ((failedJobs?.n ?? 0) > 0 ? `\n*⚠️ ${failedJobs!.n} background job(s) failed this week — check the Jobs page.*` : "");

  const { sent, id } = await sendEmail({
    subject: `Sprout weekly — ${child.name} at ${formatAge(months)}`,
    html: mdToHtml(contentMd + footer),
  });

  db.insert(digests)
    .values({
      childId: child.id,
      weekStart,
      ageMonths: months,
      contentMd: contentMd + footer,
      sentAt: sent ? new Date() : null,
      resendId: id,
    })
    .run();

  return sent ? `digest sent for week ${weekStart}` : `digest built (dry-run) for week ${weekStart}`;
};
