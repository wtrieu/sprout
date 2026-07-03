import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
  index,
  uniqueIndex,
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
  "story_text",
  "story_image",
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

export const stories = sqliteTable("stories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id")
    .notNull()
    .references(() => children.id),
  characterId: integer("character_id")
    .notNull()
    .references(() => characters.id),
  title: text("title"),
  prompt: text("prompt").notNull(), // theme requested by the user
  ageMonths: integer("age_months").notNull(),
  pageCount: integer("page_count").notNull(),
  status: text("status", {
    enum: ["queued", "text_done", "rendering", "ready", "failed"],
  })
    .notNull()
    .default("queued"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

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
    imagePath: text("image_path"),
    imageStatus: text("image_status", { enum: ["pending", "done", "failed"] })
      .notNull()
      .default("pending"),
  },
  (t) => [uniqueIndex("story_pages_story_page_idx").on(t.storyId, t.pageIndex)],
);

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
