import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { children, digests } from "../db/schema";
import { ageInMonths, formatAge } from "./age";
import { callClaudeText } from "./claude";
import { sendEmail, mdToHtml } from "./email";

const BASE_URL = process.env.SPROUT_BASE_URL ?? "http://localhost:3100";

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
  const activitiesDone = db.get<{ n: number }>(
    sql`SELECT COUNT(*) as n FROM activities WHERE status = 'done' AND created_at >= ${weekAgo}`,
  );

  // Family highlights: what Sprout made this week.
  const weekStories = db.all<{ id: number; title: string | null; style: string | null; status: string }>(sql`
    SELECT id, title, style, status FROM stories WHERE created_at >= ${weekAgo} ORDER BY id DESC LIMIT 10
  `);
  const weekBriefs = db.all<{ id: number; topic: string }>(
    sql`SELECT id, topic FROM research_briefs WHERE created_at >= ${weekAgo} ORDER BY id DESC LIMIT 5`,
  );
  const pendingSuggestions = db.get<{ n: number }>(
    sql`SELECT COUNT(*) as n FROM source_suggestions WHERE status = 'pending'`,
  );
  const weekWins = db.all<{ content: string }>(sql`
    SELECT content FROM journal_entries
    WHERE kind IN ('milestone', 'note') AND created_at >= ${weekAgo}
    ORDER BY id DESC LIMIT 6
  `);

  const failedJobs = db.get<{ n: number }>(
    sql`SELECT COUNT(*) as n FROM jobs WHERE status = 'failed' AND created_at >= ${weekAgo}`,
  );

  const prompt = `Write a short, warm weekly email digest for a parent. Their child ${child.name} is ${formatAge(months)} old this week.

Use ONLY the material below. Markdown, ~350 words max. Structure:
- One-line greeting tied to the age.
- "This week's wins" — if journal entries are listed, celebrate them warmly in 1-2 lines.
- "New bedtime stories" — if any are listed, each as a markdown link with its art style in parentheses; invite the parent to read tonight's.
- "This week in the library" — the new articles (title + one-line takeaway each, keep the links as markdown links).
- "Coming up" — 3-4 upcoming milestones to look forward to (around ${nextBucket?.age ?? months + 3} months).
- "This week's activities" — if any are listed${(activitiesDone?.n ?? 0) > 0 ? `; celebrate the ${activitiesDone!.n} completed` : ""}.
- "Research corner" — if research briefs are listed, one line each with the link.
Do not invent facts, articles, stories, or milestones not listed below. No medical advice.

JOURNAL THIS WEEK (milestones reached, notes):
${weekWins.length ? weekWins.map((w) => `- ${w.content}`).join("\n") : "(none)"}

NEW STORIES THIS WEEK:
${weekStories.length ? weekStories.map((s) => `- [${s.title ?? "Untitled"}](${BASE_URL}/stories/${s.id}) (style: ${s.style ?? "watercolor"}${s.status !== "ready" ? ", still illustrating" : ""})`).join("\n") : "(none this week)"}

NEW ARTICLES:
${newDocs.length ? newDocs.map((d) => `- [${d.title}](${d.url ?? "#"}): ${d.summary ?? ""}`).join("\n") : "(none this week)"}

UPCOMING MILESTONES (~${nextBucket?.age ?? "?"} months):
${upcoming.map((m) => `- (${m.domain}) ${m.description}`).join("\n") || "(none)"}

THIS WEEK'S ACTIVITIES (${activitiesDone?.n ?? 0} marked done):
${weekActivities.map((a) => `- ${a.title}: ${a.description}`).join("\n") || "(none)"}

RESEARCH BRIEFS THIS WEEK:
${weekBriefs.length ? weekBriefs.map((b) => `- [${b.topic}](${BASE_URL}/research)`).join("\n") : "(none)"}`;

  const contentMd = await callClaudeText(prompt, { temperature: 0.5 });
  const footer =
    `\n\n---\n*Sprout digest · ${child.name} at ${formatAge(months)} · sources are summarized, not medical advice*` +
    ((pendingSuggestions?.n ?? 0) > 0
      ? `\n*${pendingSuggestions!.n} discovered source(s) await approval on the [Sources page](${BASE_URL}/sources).*`
      : "") +
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
