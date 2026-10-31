import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
  index,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export const children = sqliteTable("children", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // ISO date (YYYY-MM-DD). Age-in-months derived everywhere from this.
  dob: text("dob").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const jobLanes = ["network", "llm", "imagegen"] as const;
export type JobLane = (typeof jobLanes)[number];

export const jobTypes = [
  "crawl_source",
  "relevance",
  "embed_doc",
  "char_reference",
  "digest",
  "activities",
] as const;
export type JobType = (typeof jobTypes)[number];

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: jobTypes }).notNull(),
    lane: text("lane", { enum: jobLanes }).notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["pending", "running", "done", "failed"] })
      .notNull()
      .default("pending"),
    priority: integer("priority").notNull().default(100),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
  },
  (t) => [index("jobs_claim_idx").on(t.status, t.lane, t.priority)],
);

// Single-row lock: the orchestrator claims id=1 before executing any lane.
export const jobLock = sqliteTable("job_lock", {
  id: integer("id").primaryKey(),
  lockedBy: text("locked_by"),
  lockedAt: integer("locked_at", { mode: "timestamp" }),
});

// ---------------------------------------------------------------------------
// Module A — research copilot
// ---------------------------------------------------------------------------

export const sourceKinds = [
  "socrata",
  "who_csv",
  "pubmed",
  "medlineplus",
  "rss",
  "openfoodfacts",
  "web",
] as const;
export type SourceKind = (typeof sourceKinds)[number];

export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind", { enum: sourceKinds }).notNull(),
  // Adapter-specific config (dataset id, query, feed URL, ...).
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  license: text("license"),
  // summary_link_only: store title/summary/deep-link, never full text (AAP RSS).
  fetchPolicy: text("fetch_policy", { enum: ["full_text", "summary_link_only"] })
    .notNull()
    .default("full_text"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  status: text("status", { enum: ["approved", "pending", "rejected"] })
    .notNull()
    .default("approved"),
  lastFetchedAt: integer("last_fetched_at", { mode: "timestamp" }),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const documents = sqliteTable(
  "documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    externalId: text("external_id").notNull(),
    url: text("url"),
    title: text("title").notNull(),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    fetchedAt: integer("fetched_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    contentHash: text("content_hash").notNull(),
    // For summary_link_only sources this holds only the feed summary.
    content: text("content").notNull(),
    summary: text("summary"),
    ageMinMonths: integer("age_min_months"),
    ageMaxMonths: integer("age_max_months"),
    topics: text("topics", { mode: "json" }).$type<string[]>(),
    relevance: text("relevance", { enum: ["pending", "relevant", "irrelevant"] })
      .notNull()
      .default("pending"),
  },
  (t) => [
    uniqueIndex("documents_source_external_idx").on(t.sourceId, t.externalId),
    index("documents_relevance_idx").on(t.relevance),
  ],
);

export const chunks = sqliteTable(
  "chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    // Float32Array bytes from nomic-embed-text (768 dims); null until embedded.
    embedding: blob("embedding", { mode: "buffer" }),
    tokenCount: integer("token_count"),
  },
  (t) => [index("chunks_document_idx").on(t.documentId)],
);

export const milestoneDomains = [
  "motor",
  "language",
  "social",
  "cognitive",
  "self_help",
] as const;

export const milestones = sqliteTable("milestones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain", { enum: milestoneDomains }).notNull(),
  ageMonths: integer("age_months").notNull(),
  description: text("description").notNull(),
  sourceRef: text("source_ref"),
  externalId: text("external_id").unique(),
});

// WHO growth standards LMS parameters. x = age in days (…_age measures) or
// length in cm (weight_length).
export const growthLms = sqliteTable(
  "growth_lms",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sex: text("sex", { enum: ["male", "female"] }).notNull(),
    measure: text("measure", {
      enum: ["weight_age", "length_age", "hc_age", "weight_length"],
    }).notNull(),
    x: real("x").notNull(),
    l: real("l").notNull(),
    m: real("m").notNull(),
    s: real("s").notNull(),
  },
  (t) => [index("growth_lms_lookup_idx").on(t.measure, t.sex, t.x)],
);

export const sourceSuggestions = sqliteTable("source_suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  title: text("title"),
  reason: text("reason"),
  foundInDocumentId: integer("found_in_document_id").references(() => documents.id),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const chatSessions = sqliteTable("chat_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id").references(() => children.id),
  title: text("title"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Citation = {
  docId: number;
  title: string;
  url: string | null;
  snippet: string;
};

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    citations: text("citations", { mode: "json" }).$type<Citation[]>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("chat_messages_session_idx").on(t.sessionId)],
);

export const digests = sqliteTable("digests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id")
    .notNull()
    .references(() => children.id),
  weekStart: text("week_start").notNull(), // ISO date of the Monday
  ageMonths: integer("age_months").notNull(),
  contentMd: text("content_md").notNull(),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  resendId: text("resend_id"),
});

// Longitudinal journal — the only place facts about the child persist.
// Written by the parent (quick notes, milestone toggles, measurements) and by
// nightly extraction from chat; read by stories, activities, visit prep, digest.
export const journalKinds = [
  "note", // free-form parent note ("slept through the night!")
  "observation", // auto-extracted from chat questions (provenance kept)
  "milestone", // milestone marked achieved (milestoneId set)
  "measurement", // data = { sex, weightKg?, lengthCm?, hcCm? }
  "preference", // durable likes/dislikes ("obsessed with diggers")
] as const;
export type JournalKind = (typeof journalKinds)[number];

export const journalEntries = sqliteTable(
  "journal_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    childId: integer("child_id")
      .notNull()
      .references(() => children.id),
    kind: text("kind", { enum: journalKinds }).notNull(),
    content: text("content").notNull(),
    milestoneId: integer("milestone_id").references(() => milestones.id),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
    ageMonths: integer("age_months").notNull(),
    // Provenance for auto-extracted entries.
    sourceMessageId: integer("source_message_id").references(() => chatMessages.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("journal_entries_kind_idx").on(t.kind)],
);

// Pediatrician visit-prep briefs: growth + milestones + recent questions
// synthesized into a one-page "ask the doctor" summary.
export const visitPreps = sqliteTable("visit_preps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id")
    .notNull()
    .references(() => children.id),
  ageMonths: integer("age_months").notNull(),
  // Snapshot of what went into the brief (measurements, concerns).
  inputs: text("inputs", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  contentMd: text("content_md").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// On-demand deep-dive research briefs synthesized from the corpus (+ live
// PubMed search), stored alongside the library.
export const researchBriefs = sqliteTable("research_briefs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id")
    .notNull()
    .references(() => children.id),
  topic: text("topic").notNull(),
  ageMonths: integer("age_months").notNull(),
  contentMd: text("content_md").notNull(),
  citations: text("citations", { mode: "json" }).$type<Citation[]>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const crawlRuns = sqliteTable("crawl_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceId: integer("source_id")
    .notNull()
    .references(() => sources.id),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  docsSeen: integer("docs_seen").notNull().default(0),
  docsNew: integer("docs_new").notNull().default(0),
  error: text("error"),
});

// ---------------------------------------------------------------------------
// Module B — storybook & activities
// ---------------------------------------------------------------------------

export const characters = sqliteTable("characters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // Canonical prompt block prepended to every illustration prompt.
  appearanceDesc: text("appearance_desc").notNull(),
  refImagePath: text("ref_image_path"),
  seed: integer("seed").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// One reference image per (character, style pack) — page renders are
// ref-conditioned, so each art style needs its own character sheet.
export const characterStyleRefs = sqliteTable(
  "character_style_refs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    characterId: integer("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    styleKey: text("style_key").notNull(),
    imagePath: text("image_path"),
    renderAttempts: integer("render_attempts").notNull().default(0),
    qcStatus: text("qc_status", { enum: ["passed", "failed"] }),
    qcNote: text("qc_note"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("character_style_refs_idx").on(t.characterId, t.styleKey)],
);

// A planned series of stories that gently target the child's current
// developmental frontier (one milestone theme per story).
export const storyArcs = sqliteTable("story_arcs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id")
    .notNull()
    .references(() => children.id),
  characterId: integer("character_id")
    .notNull()
    .references(() => characters.id),
  title: text("title").notNull(),
  // Optional parent steer, e.g. "new baby sibling arriving"
  focus: text("focus"),
  // Style-pack key (lib/stylePacks.json); one style across the whole series.
  style: text("style"),
  ageMonths: integer("age_months").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const storyLessons = ["none", "developmental", "cultural", "factual"] as const;
export type StoryLesson = (typeof storyLessons)[number];

export const stories = sqliteTable("stories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id")
    .notNull()
    .references(() => children.id),
  // Legacy FLUX-era stories reference a characters row; curated stories carry
  // their character inline (characterName/characterDesc) instead.
  characterId: integer("character_id").references(() => characters.id),
  arcId: integer("arc_id").references(() => storyArcs.id),
  arcIndex: integer("arc_index"),
  title: text("title"),
  // Style-pack key; null = legacy default (watercolor).
  style: text("style"),
  // Text-form key (lib/skills/storyText.ts); null = legacy free-form.
  form: text("form"),
  prompt: text("prompt").notNull(), // theme requested by the user
  ageMonths: integer("age_months").notNull(),
  pageCount: integer("page_count").notNull(),
  characterName: text("character_name"),
  // Canonical appearance block, pasted verbatim into every page's art prompt.
  characterDesc: text("character_desc"),
  // The book's recurring companion. Deliberately NOT in the page prompts —
  // "hide this small thing" is not something a diffusion model can execute —
  // it lives in artNotes as a selection criterion for the parent instead.
  hiddenFriend: text("hidden_friend"),
  // Guidance shown above the prompt pack (--sref workflow, aspect ratio).
  artNotes: text("art_notes"),
  // The parent's chosen page-1 image URL: pasted once in the review UI, then
  // every later page's displayed prompt carries `--sref <url>` automatically.
  // (--sref, not --cref: character reference is a V6/Niji-6 parameter and is
  // unsupported on the current models, while style reference works on both.)
  styleRefUrl: text("style_ref_url"),
  // Setting-bank key chosen in code with variety memory (null = legacy).
  setting: text("setting"),
  // Genre-lane key (lib/stories/lanes.ts); null = template-era story.
  lane: text("lane"),
  // Topic/motif tags from the premise, for taste memory + interest attribution.
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  lesson: text("lesson", { enum: storyLessons }),
  // Soft-reject taste signal: reason chip + optional note. Text pages are kept
  // (distiller evidence); images are deleted. Rejected stories are invisible
  // in the app.
  rejectReason: text("reject_reason"),
  rejectNote: text("reject_note"),
  // After the 90-day retention window a cleanup step compresses a rejected
  // draft to this one-line epitaph and drops its pages.
  epitaph: text("epitaph"),
  // Which generation engine wrote this story (1 = template era, 2 = premise
  // engine). Taste distillation windows on the current version only.
  engineVersion: integer("engine_version").notNull().default(1),
  premiseId: integer("premise_id"),
  // Read-complete beacons from the reader: re-reads are revealed preference.
  readCount: integer("read_count").notNull().default(0),
  lastReadAt: integer("last_read_at", { mode: "timestamp" }),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  // draft → approved → ready is the curated flow; rejected = soft-deleted
  // draft kept as taste evidence;
  // queued/text_done/rendering/failed are legacy FLUX-pipeline states.
  status: text("status", {
    enum: [
      "draft",
      "approved",
      "queued",
      "text_done",
      "rendering",
      "ready",
      "failed",
      "rejected",
    ],
  })
    .notNull()
    .default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const premiseStatuses = [
  "proposed", // in the inbox, awaiting greenlight/pass
  "greenlit", // parent tapped greenlight; a book write is (or was) underway
  "auto_picked", // picked by the 48h fallback
  "passed", // parent passed (passReason chip) or the premise expired
  "written", // a draft story exists (storyId set)
  "rejected", // the editor-judge rejected the draft (judgeVerdict stored)
] as const;
export type PremiseStatus = (typeof premiseStatuses)[number];

// Stage-A output pool: every premise the engine ever proposed, with its
// outcome. The pool itself is taste-memory raw data (passes and greenlights
// are signal exactly like draft rejections).
export const premises = sqliteTable(
  "premises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    childId: integer("child_id")
      .notNull()
      .references(() => children.id),
    title: text("title").notNull(),
    lane: text("lane").notNull(),
    pitch: text("pitch").notNull(),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
    lesson: text("lesson", { enum: storyLessons }).notNull().default("none"),
    lessonNote: text("lesson_note"),
    // Seed-corpus key (lib/stories/seeds) this premise draws on, if any.
    seedRef: text("seed_ref"),
    // World-bible key (lib/stories/worlds.ts), if the premise is set there.
    worldRef: text("world_ref"),
    // Optional text-form key (lib/skills/storyText.ts) — forms are tools now.
    form: text("form"),
    lengthPages: integer("length_pages").notNull(),
    whyForJun: text("why_for_jun"),
    // Stage-A ranking score, for inbox ordering (higher = more diverse pick).
    score: real("score"),
    status: text("status", { enum: premiseStatuses }).notNull().default("proposed"),
    passReason: text("pass_reason"),
    // Editor-judge verdict JSON, stored on rejection (and kept on revisions).
    judgeVerdict: text("judge_verdict"),
    storyId: integer("story_id").references(() => stories.id),
    engineVersion: integer("engine_version").notNull().default(2),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    decidedAt: integer("decided_at", { mode: "timestamp" }),
  },
  (t) => [index("premises_status_idx").on(t.status)],
);

export const storyPages = sqliteTable(
  "story_pages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storyId: integer("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    pageIndex: integer("page_index").notNull(),
    text: text("text").notNull(),
    illustrationPrompt: text("illustration_prompt").notNull(),
    // The writer's raw illustration layers, kept so illustrationPrompt can be
    // recomposed whenever the composer changes. Null on pre-0011 rows.
    scene: text("scene"),
    background: text("background"),
    // Camera for the page (shot-grammar key in lib/skills/storyArt.ts). World
    // shots (pov/detail) compose WITHOUT the character block. Null = legacy
    // page, treated as a character shot with no camera clause.
    shot: text("shot"),
    imagePath: text("image_path"),
    imageStatus: text("image_status", { enum: ["pending", "done", "failed"] })
      .notNull()
      .default("pending"),
    // Visual QC (VLM grade after each render): null = not yet graded.
    renderAttempts: integer("render_attempts").notNull().default(0),
    qcStatus: text("qc_status", { enum: ["passed", "failed"] }),
    qcNote: text("qc_note"),
    // Ken Burns parameters assigned at finalize; null = static (legacy pages).
    motion: text("motion", { mode: "json" }).$type<PageMotion>(),
  },
  (t) => [uniqueIndex("story_pages_story_page_idx").on(t.storyId, t.pageIndex)],
);

/** Slow pan/zoom for the reader. Scales are ratios; offsets are % of the frame. */
export type PageMotion = {
  scaleFrom: number;
  scaleTo: number;
  xFrom: number;
  xTo: number;
  yFrom: number;
  yTo: number;
  durationS: number;
};

// Preference intake: durable family north stars + lighter decaying interests
// (the "family compass"). North stars are always-on premise context with a
// target share of the library; interests are sampled by weight and decay
// without reinforcement. Suggestions proposed by extraction sit at
// status='suggested' until a parent confirms — never auto-added.
export const interestKinds = ["north-star", "interest"] as const;
export type InterestKind = (typeof interestKinds)[number];

// 'child' is reserved for when Jun can voice their own interests.
export const interestSources = ["manual", "chat", "review", "digest", "child"] as const;
export type InterestSource = (typeof interestSources)[number];

export const interests = sqliteTable(
  "interests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: interestKinds }).notNull(),
    label: text("label").notNull(),
    // The sentence(s) fed to the premise stage.
    brief: text("brief").notNull(),
    // 1..5 sampling weight; north stars ignore weight (always on).
    weight: integer("weight").notNull().default(3),
    // North stars only: target fraction of the library (culture: 0.2).
    share: real("share"),
    source: text("source", { enum: interestSources }).notNull().default("manual"),
    // Attribution tags matched against premise/story tags.
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
    status: text("status", { enum: ["suggested", "active", "archived"] })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastReinforcedAt: integer("last_reinforced_at", { mode: "timestamp" }),
    lastDecayedAt: integer("last_decayed_at", { mode: "timestamp" }),
  },
  (t) => [index("interests_kind_status_idx").on(t.kind, t.status)],
);

// ---------------------------------------------------------------------------
// Settings — single-row-per-key app configuration (Zod-whitelisted in
// lib/settings.ts; values are opaque JSON here).
// ---------------------------------------------------------------------------

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const materials = sqliteTable("materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
});

export const userMaterials = sqliteTable("user_materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  materialId: integer("material_id")
    .notNull()
    .unique()
    .references(() => materials.id),
  addedAt: integer("added_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const activities = sqliteTable("activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id")
    .notNull()
    .references(() => children.id),
  weekStart: text("week_start").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  materials: text("materials", { mode: "json" }).$type<string[]>().notNull(),
  milestoneRefs: text("milestone_refs", { mode: "json" }).$type<number[]>(),
  ageMonths: integer("age_months").notNull(),
  status: text("status", { enum: ["suggested", "done", "skipped"] })
    .notNull()
    .default("suggested"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Module C — Atlas: the parent's own curiosity atlas. A map is a field
// (philosophy) drafted as a two-level tree of nodes; each node carries a
// ladder of rungs (like I'm 10 / one-pager / deep dive) generated on demand
// and cached, plus readings that were machine-verified to exist before they
// are ever shown. Nothing here is child-facing until a bookmark asks for it.
// ---------------------------------------------------------------------------

export const atlasStatuses = ["drafting", "ready", "failed"] as const;
export type AtlasStatus = (typeof atlasStatuses)[number];

export const atlasMaps = sqliteTable("atlas_maps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  blurb: text("blurb"),
  // What the drafter was told: a preset brief and/or the owner's own words.
  brief: text("brief"),
  // The row doubles as the job status the UI polls while drafting.
  status: text("status", { enum: atlasStatuses }).notNull().default("drafting"),
  error: text("error"),
  model: text("model"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  readyAt: integer("ready_at", { mode: "timestamp" }),
  // Set once by the preload shard that found every one-pager ready-or-failed:
  // the atomic claim that makes "map is ready" a single email.
  notifiedAt: integer("notified_at", { mode: "timestamp" }),
});

export const atlasNodeKinds = ["branch", "school", "thinker", "concept", "text"] as const;
export type AtlasNodeKind = (typeof atlasNodeKinds)[number];

// The account-wide spine: a small fixed set of cross-field skills every node
// is tagged to at draft time, so they level as a byproduct of reading.
export const atlasDisciplines = [
  "reasoning",
  "evidence",
  "language",
  "systems",
  "creativity",
] as const;
export type AtlasDiscipline = (typeof atlasDisciplines)[number];

// Two levels only: branches (parentId null) and their children. Depth is
// derived from parentId, never stored.
export const atlasNodes = sqliteTable(
  "atlas_nodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mapId: integer("map_id")
      .notNull()
      .references(() => atlasMaps.id, { onDelete: "cascade" }),
    parentId: integer("parent_id").references((): AnySQLiteColumn => atlasNodes.id, {
      onDelete: "cascade",
    }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    // One line: the live question this node answers.
    blurb: text("blurb").notNull(),
    kind: text("kind", { enum: atlasNodeKinds }).notNull().default("concept"),
    // Discipline tag assigned at draft time (null on maps drafted before
    // PR-C until the `disciplines` backfill runs). Untagged nodes count
    // toward branch and field levels but no discipline.
    discipline: text("discipline", { enum: atlasDisciplines }),
    // "Skip this branch": the subtree drops out of frontier selection.
    skipped: integer("skipped", { mode: "boolean" }).notNull().default(false),
    skippedAt: integer("skipped_at", { mode: "timestamp" }),
    // First open / most recent open — the atlas's memory of where you've been.
    visitedAt: integer("visited_at", { mode: "timestamp" }),
    lastOpenedAt: integer("last_opened_at", { mode: "timestamp" }),
    visitCount: integer("visit_count").notNull().default(0),
    // Set when an owner-captured seed created this node (no FK: seeds also
    // point back at nodes, and the pair would be circular).
    seedId: integer("seed_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("atlas_nodes_map_parent_idx").on(t.mapId, t.parentId, t.position)],
);

export const atlasRungLevels = ["eli10", "onepager", "deepdive"] as const;
export type AtlasRungLevel = (typeof atlasRungLevels)[number];

// One row per (node, level). The row IS the generation status: it is inserted
// as `drafting` before the headless run spawns and flipped to ready/failed
// when the run lands, so the UI only ever polls this table.
export const atlasRungs = sqliteTable(
  "atlas_rungs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nodeId: integer("node_id")
      .notNull()
      .references(() => atlasNodes.id, { onDelete: "cascade" }),
    level: text("level", { enum: atlasRungLevels }).notNull(),
    status: text("status", { enum: atlasStatuses }).notNull().default("drafting"),
    // One-line hook shown above the body (and as the email's bold line).
    hook: text("hook"),
    // Markdown restricted to the subset lib/markdown.ts renders. Never
    // contains links: every link comes from atlas_readings.
    bodyMd: text("body_md"),
    wordCount: integer("word_count"),
    model: text("model"),
    // Editor-judge verdict JSON (deep dive only; one-pagers are never judged).
    judgeVerdict: text("judge_verdict"),
    // One-pager rows only: 3 × { question, choices[4], answer, why }, drafted
    // in the same call as the body. PR-C builds the answering UI.
    quizJson: text("quiz_json"),
    // Model-drawn visuals (lib/atlas/visuals.ts VisualSchema), placed in the
    // body by [[visual:slug]] markers. "[]" means "asked, none wanted" — the
    // backfill only re-asks while this is null. Eli10 rows stay null.
    visualsJson: text("visuals_json"),
    error: text("error"),
    startedAt: integer("started_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    readyAt: integer("ready_at", { mode: "timestamp" }),
    readAt: integer("read_at", { mode: "timestamp" }),
    readCount: integer("read_count").notNull().default(0),
  },
  (t) => [uniqueIndex("atlas_rungs_node_level_idx").on(t.nodeId, t.level)],
);

export const atlasReadingKinds = ["wikipedia", "book", "web"] as const;
export type AtlasReadingKind = (typeof atlasReadingKinds)[number];

// Every reading the model ever proposed, with its verification outcome.
// Only status='verified' rows are shown anywhere; rejected rows are the
// "logged, never shown" record used to tune the verifier.
export const atlasReadings = sqliteTable(
  "atlas_readings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nodeId: integer("node_id")
      .notNull()
      .references(() => atlasNodes.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: atlasReadingKinds }).notNull(),
    title: text("title").notNull(),
    author: text("author"),
    // Canonical URL from the verifier (always set on verified rows); the
    // model's proposed URL, if any, on rejected rows.
    url: text("url"),
    // The model's one-line reason this reading is worth the time.
    why: text("why"),
    status: text("status", { enum: ["verified", "rejected"] }).notNull(),
    verifiedVia: text("verified_via", {
      enum: ["wikipedia_summary", "openlibrary", "url_title"],
    }),
    rejectReason: text("reject_reason"),
    proposedBy: text("proposed_by", { enum: ["onepager", "deepdive", "seed"] }).notNull(),
    // First sentence of the Wikipedia extract, when available.
    snippet: text("snippet"),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("atlas_readings_node_status_idx").on(t.nodeId, t.status)],
);

// Every real image the model ever proposed for a node, with its verification
// outcome — the readings rule again: only status='verified' rows are shown
// (placed in rung bodies by [[image:slug]] markers), rejected rows carry the
// reason and tune the verifier. Always Wikimedia Commons, never generated art.
export const atlasImages = sqliteTable(
  "atlas_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nodeId: integer("node_id")
      .notNull()
      .references(() => atlasNodes.id, { onDelete: "cascade" }),
    // The marker name a rung body references this image by (per node).
    slug: text("slug").notNull(),
    // What the model asked for: the exact subject, as Commons search terms.
    query: text("query").notNull(),
    caption: text("caption"),
    why: text("why"),
    status: text("status", { enum: ["verified", "rejected"] }).notNull(),
    // Verified rows: the Commons file and where it was resolved from.
    fileTitle: text("file_title"),
    verifiedVia: text("verified_via", { enum: ["article_media", "commons_search"] }),
    url: text("url"),
    thumbUrl: text("thumb_url"),
    // The Commons description page — where the attribution line links.
    descUrl: text("desc_url"),
    author: text("author"),
    license: text("license"),
    width: integer("width"),
    height: integer("height"),
    rejectReason: text("reject_reason"),
    proposedBy: text("proposed_by", { enum: ["onepager", "deepdive", "backfill"] }).notNull(),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("atlas_images_node_status_idx").on(t.nodeId, t.status)],
);

export const atlasFrontierReasons = ["child", "sibling", "next-branch", "fallback", "seed"] as const;
export type AtlasFrontierReason = (typeof atlasFrontierReasons)[number];

// The weekly frontier note's log: one node per week, never repeated.
// Idempotency per week is enforced in code (a plain index, not unique) so a
// forced re-run can add a second row; the latest row for a week is current.
export const atlasFrontierPicks = sqliteTable(
  "atlas_frontier_picks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mapId: integer("map_id")
      .notNull()
      .references(() => atlasMaps.id, { onDelete: "cascade" }),
    nodeId: integer("node_id")
      .notNull()
      .references(() => atlasNodes.id, { onDelete: "cascade" }),
    weekStart: text("week_start").notNull(), // ISO date of the Monday
    reason: text("reason", { enum: atlasFrontierReasons }).notNull(),
    deliveredVia: text("delivered_via", { enum: ["email", "digest", "app"] }),
    emailSentAt: integer("email_sent_at", { mode: "timestamp" }),
    resendId: text("resend_id"),
    // Stamped when the parent clicks through from the note.
    openedAt: integer("opened_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("atlas_frontier_picks_week_idx").on(t.weekStart),
    index("atlas_frontier_picks_node_idx").on(t.nodeId),
  ],
);

// "Save for <child>": the node, why it mattered to the parent, an optional
// target age (time capsule), and the kid version generated at save time.
export const atlasBookmarks = sqliteTable(
  "atlas_bookmarks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nodeId: integer("node_id")
      .notNull()
      .references(() => atlasNodes.id, { onDelete: "cascade" }),
    childId: integer("child_id")
      .notNull()
      .references(() => children.id),
    note: text("note"),
    targetAgeYears: integer("target_age_years"),
    kidStatus: text("kid_status", { enum: atlasStatuses }).notNull().default("drafting"),
    kidMd: text("kid_md"),
    // The one question or tiny activity for today.
    kidToday: text("kid_today"),
    kidAgeMonths: integer("kid_age_months"),
    kidError: text("kid_error"),
    // HOOK(atlas-story): set when a later "Make it a story" button commissions
    // a nonfiction book from this bookmark. Unused until then.
    storyId: integer("story_id").references(() => stories.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("atlas_bookmarks_node_idx").on(t.nodeId)],
);

export const atlasSeedKinds = ["title", "url", "idea"] as const;
export type AtlasSeedKind = (typeof atlasSeedKinds)[number];

// "Add to Atlas": something the owner brought (a title, a link, a half-formed
// idea). The next draft attaches it to the right place or starts a new map.
export const atlasSeeds = sqliteTable(
  "atlas_seeds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    text: text("text").notNull(),
    kind: text("kind", { enum: atlasSeedKinds }).notNull(),
    url: text("url"),
    status: text("status", { enum: ["pending", "attached", "new_map", "dismissed"] })
      .notNull()
      .default("pending"),
    // The placer's reason, or the proposed new map title.
    resolution: text("resolution"),
    nodeId: integer("node_id").references(() => atlasNodes.id, { onDelete: "set null" }),
    mapId: integer("map_id").references(() => atlasMaps.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  },
  (t) => [index("atlas_seeds_status_idx").on(t.status)],
);

export const atlasPersonas = ["cartographer", "protege"] as const;
export type AtlasPersona = (typeof atlasPersonas)[number];

// One character per person (Cloudflare Access email). Maps are shared;
// progress, levels and the persona are per player. Household-only: there is
// no public profile and no roles — everyone behind Access is family.
export const atlasPlayers = sqliteTable("atlas_players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  persona: text("persona", { enum: atlasPersonas }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// The typed event log: the single input to every reward (levels, tiers,
// PR-D's achievements and class offers, PR2/PR3 re-bases). Append-only —
// nothing updates or deletes a row, which is what makes "levels never drop"
// true by construction. `verb` is deliberately TEXT with no enum: new verbs
// are data, not code, and no reader may switch exhaustively on it.
export const atlasEvents = sqliteTable(
  "atlas_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    playerId: integer("player_id")
      .notNull()
      .references(() => atlasPlayers.id, { onDelete: "cascade" }),
    verb: text("verb").notNull(),
    // Nullable on purpose: deleting a map keeps the player's history.
    mapId: integer("map_id").references(() => atlasMaps.id, { onDelete: "set null" }),
    nodeId: integer("node_id").references(() => atlasNodes.id, { onDelete: "set null" }),
    // Verb-specific payload (JSON), e.g. { level: "onepager" } on read_rung.
    data: text("data"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("atlas_events_player_idx").on(t.playerId, t.createdAt),
    index("atlas_events_verb_idx").on(t.verb),
  ],
);
