import { z } from "zod";
import { eq, asc, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import {
  documents,
  chunks,
  stories,
  storyPages,
  characters,
  children,
  materials,
  userMaterials,
  activities,
  milestones,
} from "../db/schema";
import { ageInMonths } from "./age";
import type { JobRow } from "./jobs";
import { enqueue } from "./jobs";
import { callOllamaJson } from "./ollama";
import { callClaudeJson } from "./claude";
import { journalContext, milestonesNotYetAchieved, personalizationLine } from "./skills/journal";
import { embed, toBuffer, chunkText } from "./embeddings";
import { formatAge } from "./age";

// ---------------------------------------------------------------------------
// llm lane: relevance classification
// ---------------------------------------------------------------------------

const RelevanceSchema = z.object({
  relevant: z.boolean(),
  age_min_months: z.number().int().min(0).max(240).nullable(),
  age_max_months: z.number().int().min(0).max(240).nullable(),
  topics: z.array(z.string()).max(8),
});

const runRelevance = async (db: DB, job: JobRow): Promise<void> => {
  const docId = Number(job.payload.documentId);
  const doc = db.select().from(documents).where(eq(documents.id, docId)).get();
  if (!doc) throw new Error(`document ${docId} not found`);

  const prompt = `You classify documents for a parenting research library. The family has one child, currently a toddler.

Document title: ${doc.title}
Document text (truncated):
${doc.content.slice(0, 3000)}

Return STRICT JSON:
{
  "relevant": boolean,        // true if useful to a parent of a child aged 0-5 (nutrition, sleep, development, safety, health, activities, parenting approaches)
  "age_min_months": int|null, // youngest child age (months) this applies to, null if age-generic
  "age_max_months": int|null, // oldest child age (months) this applies to, null if age-generic
  "topics": string[]          // up to 8 short lowercase tags, e.g. "nutrition", "sleep", "milestones"
}`;

  const result = await callOllamaJson(prompt, RelevanceSchema, { temperature: 0.1 });
  db.update(documents)
    .set({
      relevance: result.relevant ? "relevant" : "irrelevant",
      ageMinMonths: result.age_min_months,
      ageMaxMonths: result.age_max_months,
      topics: result.topics,
    })
    .where(eq(documents.id, docId))
    .run();
};

// ---------------------------------------------------------------------------
// llm lane: chunk + embed a document
// ---------------------------------------------------------------------------

const runEmbedDoc = async (db: DB, job: JobRow): Promise<void> => {
  const docId = Number(job.payload.documentId);
  const doc = db.select().from(documents).where(eq(documents.id, docId)).get();
  if (!doc) throw new Error(`document ${docId} not found`);

  const existing = db.select({ id: chunks.id }).from(chunks).where(eq(chunks.documentId, docId)).all();
  if (existing.length > 0) return; // idempotent

  const pieces = chunkText(doc.content);
  const vectors = await embed(pieces);
  pieces.forEach((text, i) => {
    db.insert(chunks)
      .values({ documentId: docId, chunkIndex: i, text, embedding: toBuffer(vectors[i]) })
      .run();
  });
};

// ---------------------------------------------------------------------------
// llm lane: story text generation (Phase 3)
// ---------------------------------------------------------------------------

const StoryTextSchema = z.object({
  title: z.string().min(1).max(120),
  pages: z
    .array(
      z.object({
        text: z.string().min(1).max(400),
        illustration_prompt: z.string().min(10).max(500),
      }),
    )
    .min(4)
    .max(14),
});

const runStoryText = async (db: DB, job: JobRow): Promise<void> => {
  const storyId = Number(job.payload.storyId);
  const story = db.select().from(stories).where(eq(stories.id, storyId)).get();
  if (!story) throw new Error(`story ${storyId} not found`);
  const character = db.select().from(characters).where(eq(characters.id, story.characterId)).get();
  if (!character) throw new Error(`character ${story.characterId} not found`);
  const child = db.select().from(children).where(eq(children.id, story.childId)).get();

  const prompt = `You write bedtime stories for very young children.

Write a ${story.pageCount}-page bedtime story for ${child?.name ?? "a toddler"}, who is ${formatAge(story.ageMonths)} old.
Theme requested by the parent: ${story.prompt}
Main character: ${character.name} — ${character.appearanceDesc}

Rules:
- Language for a ${formatAge(story.ageMonths)}-old: very short sentences, rhythm and repetition, warm and calm (it's bedtime — the story should wind DOWN, ending sleepy and safe).
- 1-3 short sentences per page. No scary elements, no peril.
- Each page needs an "illustration_prompt": a self-contained visual description of THAT page's scene for an illustrator. Describe the setting, what ${character.name} is doing, time of day, mood. Do NOT describe the character's appearance (the illustrator has a character sheet). Never include text/words in the scene.
- Compose scenes the illustrator can nail: ${character.name} alone (or with at most ONE simple animal friend), seen full-body or from a distance. Never build a scene around hands doing something intricate (holding, gripping, pointing close-up), never crowds, never mirrors. Big simple shapes beat busy detail.

EXAMPLE of the quality to match — two pages from a different story (a character named Momo, theme "jumping in puddles"):
{ "text": "Drip, drip, drop. The rain sang on the window. Momo pressed one small nose against the glass.", "illustration_prompt": "Cozy interior by a rain-streaked window, late afternoon grey-blue light, the character kneeling on a window seat looking out at gentle rain, warm lamp glow behind, soft peaceful mood." }
{ "text": "One more jump. A small, sleepy jump. Then home, where warm towels were waiting.", "illustration_prompt": "A quiet lane at dusk with one shallow puddle reflecting orange sky, the character mid-tiny-hop above the puddle, golden porch light visible down the lane, calm winding-down mood." }
Notice: concrete sensory words, rhythm ("drip, drip, drop"), each illustration_prompt states setting + action + time of day + mood and nothing about how the character looks. Match that quality — but never reuse Momo, the rain, or any wording from the example.

Return STRICT JSON:
{ "title": string, "pages": [ { "text": string, "illustration_prompt": string } ] }
Exactly ${story.pageCount} pages.`;

  // Story prose is the one lane where model quality is most visible — use
  // Claude when a key is configured, local qwen3 otherwise.
  const result = await callClaudeJson(prompt, StoryTextSchema, { temperature: 0.8 });

  db.delete(storyPages).where(eq(storyPages.storyId, storyId)).run(); // idempotent retry
  result.pages.forEach((page, i) => {
    db.insert(storyPages)
      .values({
        storyId,
        pageIndex: i,
        text: page.text,
        illustrationPrompt: page.illustration_prompt,
      })
      .run();
    enqueue(db, {
      type: "story_image",
      lane: "imagegen",
      payload: { storyId, pageIndex: i },
      priority: 100 + i,
    });
  });
  db.update(stories)
    .set({ title: result.title, status: "rendering" })
    .where(eq(stories.id, storyId))
    .run();
};

// ---------------------------------------------------------------------------
// llm lane: weekly activity generation (Phase 4)
// ---------------------------------------------------------------------------

const ActivitiesSchema = z.object({
  activities: z
    .array(
      z.object({
        title: z.string().min(3).max(80),
        description: z.string().min(20).max(500),
        materials: z.array(z.string()).max(5),
        milestone_ids: z.array(z.number().int()).max(4),
      }),
    )
    .min(4)
    .max(7),
});

const isoWeekStart = (d: Date): string => {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
};

const runActivities = async (db: DB, _job: JobRow): Promise<void> => {
  const child = db.select().from(children).limit(1).get();
  if (!child) throw new Error("no child profile");
  const months = ageInMonths(child.dob);
  const weekStart = isoWeekStart(new Date());

  const existing = db.get<{ n: number }>(
    sql`SELECT COUNT(*) as n FROM activities WHERE child_id = ${child.id} AND week_start = ${weekStart}`,
  );
  if (existing && existing.n > 0) return; // idempotent per week

  const owned = db
    .select({ slug: materials.slug, name: materials.name })
    .from(userMaterials)
    .innerJoin(materials, eq(userMaterials.materialId, materials.id))
    .all();
  if (owned.length === 0) throw new Error("no materials marked as owned — visit /materials");

  const bucket = db.get<{ age: number } | undefined>(
    sql`SELECT MAX(age_months) as age FROM milestones WHERE age_months <= ${months}`,
  );
  const nextBucket = db.get<{ age: number } | undefined>(
    sql`SELECT MIN(age_months) as age FROM milestones WHERE age_months > ${months}`,
  );
  // Skip goals the journal says are already achieved — practice the frontier.
  const relevantMilestones = milestonesNotYetAchieved(
    db,
    db
      .select({ id: milestones.id, domain: milestones.domain, description: milestones.description })
      .from(milestones)
      .where(
        sql`age_months IN (${bucket?.age ?? months}, ${nextBucket?.age ?? months})`,
      )
      .all(),
  );
  const personal = personalizationLine(journalContext(db));

  const allowedSlugs = new Set(owned.map((m) => m.slug));
  const prompt = `You design simple developmental play activities for a parent and their ${months}-month-old child.
${personal ? `${personal}\n` : ""}
Create 5-6 activities for this week. Rules:
- Use ONLY materials from the AVAILABLE list (reference by slug). Max 3-4 materials each; body/voice-only activities may use none.
- Each activity should practice one or more of the DEVELOPMENT GOALS below; reference them by numeric id in milestone_ids.
- 5-15 minutes each, safe for a ${months}-month-old with adult supervision, no choking hazards.
- Mix domains across the week: movement, language, fine motor, sensory, social.

AVAILABLE MATERIALS (slug — name):
${owned.map((m) => `${m.slug} — ${m.name}`).join("\n")}

DEVELOPMENT GOALS (id: description):
${relevantMilestones.map((m) => `${m.id}: (${m.domain}) ${m.description}`).join("\n")}

Return STRICT JSON:
{ "activities": [ { "title": string, "description": string (how to set up and play, 2-4 sentences), "materials": string[] (slugs), "milestone_ids": int[] } ] }`;

  const result = await callOllamaJson(prompt, ActivitiesSchema, { temperature: 0.7 });
  const validMilestoneIds = new Set(relevantMilestones.map((m) => m.id));

  for (const a of result.activities) {
    const badSlug = a.materials.find((s) => !allowedSlugs.has(s));
    if (badSlug) throw new Error(`activity references unowned material: ${badSlug}`);
    db.insert(activities)
      .values({
        childId: child.id,
        weekStart,
        title: a.title,
        description: a.description,
        materials: a.materials,
        milestoneRefs: a.milestone_ids.filter((id) => validMilestoneIds.has(id)),
        ageMonths: months,
      })
      .run();
  }
};

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

export const executeLlmJob = async (db: DB, job: JobRow): Promise<void> => {
  switch (job.type) {
    case "relevance":
      return runRelevance(db, job);
    case "embed_doc":
      return runEmbedDoc(db, job);
    case "story_text":
      return runStoryText(db, job);
    case "activities":
      return runActivities(db, job);
    default:
      throw new Error(`no llm executor for job type ${job.type}`);
  }
};

/** After an image batch, flip stories to ready/failed based on page status. */
export const reconcileStories = (db: DB): void => {
  const rendering = db.select().from(stories).where(eq(stories.status, "rendering")).all();
  for (const story of rendering) {
    const pages = db
      .select({ imageStatus: storyPages.imageStatus })
      .from(storyPages)
      .where(eq(storyPages.storyId, story.id))
      .orderBy(asc(storyPages.pageIndex))
      .all();
    if (pages.length === 0) continue;
    if (pages.every((p) => p.imageStatus === "done")) {
      db.update(stories).set({ status: "ready" }).where(eq(stories.id, story.id)).run();
    } else if (pages.some((p) => p.imageStatus === "failed")) {
      db.update(stories).set({ status: "failed" }).where(eq(stories.id, story.id)).run();
    }
  }
};
