import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import type { DB } from "../db/client";
import { documents, chunks, stories, storyPages, characters, children } from "../db/schema";
import type { JobRow } from "./jobs";
import { enqueue } from "./jobs";
import { callOllamaJson } from "./ollama";
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

Return STRICT JSON:
{ "title": string, "pages": [ { "text": string, "illustration_prompt": string } ] }
Exactly ${story.pageCount} pages.`;

  const result = await callOllamaJson(prompt, StoryTextSchema, { temperature: 0.8 });

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
