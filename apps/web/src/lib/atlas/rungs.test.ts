import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import type { AtlasLlm } from "./llm";
import {
  assembleDeepdive,
  buildQuizPrompt,
  buildRungPrompt,
  ensureRung,
  validateQuiz,
  validateRungBody,
  wordCount,
  type QuizQuestion,
} from "./rungs";
import type { FetchLike } from "./verify";
import type { ImageProposal, Visual } from "./visuals";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations",
);

const makeDb = (): DB => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = OFF");
  const db = drizzle(sqlite, { schema }) as unknown as DB;
  migrate(db, { migrationsFolder });
  sqlite.pragma("foreign_keys = ON");
  return db;
};

/** One map, one branch, two children. Returns the first child's id. */
const seed = (db: DB) => {
  const map = db
    .insert(schema.atlasMaps)
    .values({ title: "Philosophy", blurb: "How to live, what is real.", status: "ready" })
    .returning()
    .get();
  const branch = db
    .insert(schema.atlasNodes)
    .values({
      mapId: map.id,
      parentId: null,
      position: 0,
      title: "The Hellenistic schools",
      blurb: "What does a good life look like once the city has stopped mattering?",
      kind: "branch",
    })
    .returning()
    .get();
  const stoicism = db
    .insert(schema.atlasNodes)
    .values({
      mapId: map.id,
      parentId: branch.id,
      position: 0,
      title: "Stoicism",
      blurb: "Can you be unshaken by what you cannot control?",
      kind: "school",
    })
    .returning()
    .get();
  db.insert(schema.atlasNodes)
    .values({
      mapId: map.id,
      parentId: branch.id,
      position: 1,
      title: "Epicureanism",
      blurb: "Is pleasure the point, and if so which pleasures?",
      kind: "school",
    })
    .run();
  return { mapId: map.id, branchId: branch.id, nodeId: stoicism.id };
};

const words = (n: number, prefix = "w") =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");

const ONEPAGER = `### The question\n${words(120)}\n\n### The move\n${words(120, "m")}\n\n### Where it bites\n${words(110, "b")}`;
const QUIZ: QuizQuestion[] = [
  {
    question: "What is the only thing a Stoic says you control?",
    choices: ["Your judgments", "Your reputation", "Your health", "Your family"],
    answer: 0,
    why: "The dichotomy of control puts only your own judgments on your side of the line.",
  },
  {
    question: "What does apatheia mean here?",
    choices: ["Not caring", "Freedom from misjudged passion", "Pleasure", "Silence"],
    answer: 1,
    why: "It is freedom from passions built on bad judgments, not numbness.",
  },
  {
    question: "Which exercise is Stoic?",
    choices: ["Premeditating setbacks", "Fasting for purity", "Oracle reading", "Debate for sport"],
    answer: 0,
    why: "Premeditatio malorum rehearses losses so they find you prepared.",
  },
];
const BAD_QUIZ: QuizQuestion[] = QUIZ.map((q, i) =>
  i === 0 ? { ...q, choices: ["Same", "Same", "Other", "More"] } : q,
);
const DEEPDIVE = ["Origins", "Figures", "Debates", "Influence", "Misreadings"]
  .map((h, i) => `### ${h}\n${words(200, `d${i}`)}`)
  .join("\n\n");
const ELI10 = words(150, "k");

const DIAGRAM: Visual = {
  kind: "diagram",
  slug: "succession",
  title: "Who taught whom",
  nodes: [
    { id: "zeno", label: "Zeno of Citium" },
    { id: "cleanthes", label: "Cleanthes" },
  ],
  edges: [{ from: "zeno", to: "cleanthes" }],
};
const IMAGE_PROPOSAL: ImageProposal = {
  slug: "zeno-bust",
  query: "Zeno of Citium bust",
  caption: "A Roman copy of the school's founder.",
};
const ONEPAGER_WITH_VISUALS = `### The question\n${words(120)}\n\n[[visual:succession]]\n\n### The move\n${words(120, "m")}\n\n[[image:zeno-bust]]\n\n### Where it bites\n${words(110, "b")}`;

/** Routes on prompt content, so call order is a consequence rather than a script. */
const fakeLlm =
  (
    calls: string[],
    overrides: {
      onepagerBody?: string;
      repairedBody?: string;
      quiz?: QuizQuestion[];
      repairedQuiz?: QuizQuestion[];
      visuals?: Visual[];
      repairedVisuals?: Visual[];
      images?: ImageProposal[];
      eli10Body?: string;
    } = {},
    models: string[] = [],
  ): AtlasLlm =>
  (prompt, zschema, opts) => {
    calls.push(opts.label ?? "?");
    models.push(opts.model);
    let out: unknown;
    if (prompt.includes('"verdict": "approve" | "revise"')) {
      out = { verdict: "approve", problems: [], fixes: [] };
    } else if (prompt.includes("Write the ONE-PAGER")) {
      const repairing = prompt.includes("an editor flagged problems");
      out = {
        hook: "The only thing in your power is your own mind.",
        body_md: repairing
          ? (overrides.repairedBody ?? overrides.onepagerBody ?? ONEPAGER)
          : (overrides.onepagerBody ?? ONEPAGER),
        readings: [
          { kind: "wikipedia", title: "Stoicism", why: "the overview" },
          { kind: "book", title: "Meditations", author: "Marcus Aurelius", why: "the diary" },
        ],
        quiz: repairing ? (overrides.repairedQuiz ?? overrides.quiz ?? QUIZ) : (overrides.quiz ?? QUIZ),
        visuals: repairing ? (overrides.repairedVisuals ?? overrides.visuals) : overrides.visuals,
        images: overrides.images,
      };
    } else if (prompt.includes("Write the DEEP DIVE")) {
      out = {
        hook: "Deeper",
        body_md: DEEPDIVE,
        readings: [
          { kind: "wikipedia", title: "Stoicism" },
          { kind: "wikipedia", title: "Zeno of Citium", why: "the founder" },
        ],
      };
    } else if (prompt.includes("LIKE-I'M-10")) {
      out = { body_md: overrides.eli10Body ?? ELI10 };
    } else {
      throw new Error(`unexpected prompt: ${prompt.slice(0, 80)}`);
    }
    return zschema.parse(out);
  };

const WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const summary = (title: string) =>
  new Response(
    JSON.stringify({
      type: "standard",
      title,
      extract: `${title} is a thing. More.`,
      content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}` } },
    }),
    { status: 200 },
  );

const fakeFetch = () => {
  const calls: string[] = [];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const impl: FetchLike = async (url) => {
    calls.push(url);
    if (url.startsWith(`${WIKI}Stoicism`)) return summary("Stoicism");
    if (url.startsWith(`${WIKI}Zeno_of_Citium`)) return summary("Zeno of Citium");
    if (url.startsWith("https://openlibrary.org/search.json")) {
      return json({
        docs: [{ key: "/works/OL1W", title: "Meditations", author_name: ["Marcus Aurelius"] }],
      });
    }
    if (url.startsWith("https://en.wikipedia.org/api/rest_v1/page/media-list/")) {
      return json({
        items: [
          { title: "File:Zeno of Citium bust.jpg", type: "image", caption: { text: "Bust of Zeno" } },
        ],
      });
    }
    if (url.startsWith("https://commons.wikimedia.org/w/api.php?") && url.includes("list=search")) {
      return json({ query: { search: [{ title: "File:Zeno of Citium bust.jpg" }] } });
    }
    if (url.startsWith("https://commons.wikimedia.org/w/api.php?") && url.includes("prop=imageinfo")) {
      return json({
        query: {
          pages: [
            {
              imageinfo: [
                {
                  url: "https://upload.wikimedia.org/zeno.jpg",
                  descriptionurl: "https://commons.wikimedia.org/wiki/File:Zeno.jpg",
                  thumburl: "https://upload.wikimedia.org/thumb/zeno-640.jpg",
                  width: 2000,
                  height: 1500,
                  extmetadata: {
                    Artist: { value: "Paolo Monti" },
                    LicenseShortName: { value: "CC BY-SA 4.0" },
                  },
                },
              ],
            },
          ],
        },
      });
    }
    return new Response("nope", { status: 404 });
  };
  return { impl, calls };
};

const quiet = () => {};

describe("mechanical checks", () => {
  it("counts words without markdown markers", () => {
    expect(wordCount("### Title\n**bold** words\n- a bullet")).toBe(5);
  });

  it("accepts a one-pager inside its budget and flags each forbidden construct", () => {
    expect(validateRungBody("onepager", ONEPAGER)).toEqual([]);
    const bad = `# Big\n${words(100)}\n1. first\n> quoted\n| a | b |\n*ital* and _also_\nsee https://x.y and [this](u)\n### Further reading\nλόγος`;
    const problems = validateRungBody("onepager", bad);
    for (const needle of [
      "too short",
      "headings",
      "numbered",
      "block quotes",
      "tables",
      "italics",
      "links",
      "Further reading",
      "Latin",
    ]) {
      expect(problems.join(" | ")).toContain(needle);
    }
  });

  it("does not mistake bold for italics", () => {
    const body = `### A\n${words(160)}\n\n### B\n**bold** ${words(160, "x")}`;
    expect(validateRungBody("onepager", body)).toEqual([]);
  });

  it("forbids headings and bullets in the like-I'm-10 version", () => {
    expect(validateRungBody("eli10", ELI10)).toEqual([]);
    const problems = validateRungBody("eli10", `### Heading\n- bullet\n${words(150)}`);
    expect(problems.join(" | ")).toMatch(/no headings/);
    expect(problems.join(" | ")).toMatch(/no bullets/);
  });

  it("loosens only the word budget after a repair pass", () => {
    const short = `### A\n${words(120)}\n\n### B\n${words(120, "x")}`; // 242 words: under 255 (15%), over 225 (25%)
    expect(validateRungBody("onepager", short, { tolerance: 0.15 })).not.toEqual([]);
    expect(validateRungBody("onepager", short, { tolerance: 0.25 })).toEqual([]);
  });

  it("assembles Further reading from verified rows only", () => {
    expect(assembleDeepdive("body", [])).toBe("body");
    expect(
      assembleDeepdive("body\n", [
        { title: "Stoicism", url: "https://en.wikipedia.org/wiki/Stoicism", why: "overview" },
        { title: "Meditations", url: "https://openlibrary.org/works/OL1W", why: null },
      ]),
    ).toBe(
      "body\n\n### Further reading\n- [Stoicism](https://en.wikipedia.org/wiki/Stoicism) — overview\n- [Meditations](https://openlibrary.org/works/OL1W)",
    );
  });

  it("gives every rung the shared format rules and the one-pager where it applies", () => {
    const ctx = "MAP: Philosophy\nTHIS NODE (school): Stoicism — ?";
    expect(buildRungPrompt("onepager", { context: ctx })).toContain("No links and no URLs");
    expect(buildRungPrompt("deepdive", { context: ctx, onepagerMd: "ONE" })).toContain("ONE");
    expect(buildRungPrompt("eli10", { context: ctx, onepagerMd: "ONE" })).toContain("never by making things up");
  });

  it("asks for the quiz only in the one-pager prompt, and in the backfill prompt", () => {
    const ctx = "MAP: Philosophy\nTHIS NODE (school): Stoicism — ?";
    expect(buildRungPrompt("onepager", { context: ctx })).toContain("QUIZ:");
    expect(buildRungPrompt("deepdive", { context: ctx, onepagerMd: "ONE" })).not.toContain("QUIZ:");
    expect(buildRungPrompt("eli10", { context: ctx, onepagerMd: "ONE" })).not.toContain("QUIZ:");
    const backfill = buildQuizPrompt({ context: ctx, onepagerMd: "ONE" });
    expect(backfill).toContain("QUIZ:");
    expect(backfill).toContain("ONE");
  });

  it("lints the quiz: exactly three questions, distinct choices, one-sentence why", () => {
    expect(validateQuiz(QUIZ)).toEqual([]);
    expect(validateQuiz(null).join(" | ")).toContain("exactly 3");
    expect(validateQuiz(QUIZ.slice(0, 2)).join(" | ")).toContain("exactly 3");
    expect(validateQuiz(BAD_QUIZ).join(" | ")).toContain("distinct");
    const twoSentences = QUIZ.map((q, i) =>
      i === 1 ? { ...q, why: "First sentence. Second sentence." } : q,
    );
    expect(validateQuiz(twoSentences).join(" | ")).toContain("single sentence");
  });
});

describe("ensureRung", () => {
  it("drafts the one-pager first, verifies readings, and builds the deep dive's reading list from verified rows", async () => {
    const db = makeDb();
    const { nodeId } = seed(db);
    const calls: string[] = [];
    const net = fakeFetch();

    const res = await ensureRung(db, nodeId, "deepdive", {
      llm: fakeLlm(calls),
      fetchImpl: net.impl,
      log: quiet,
      judge: true,
      verifyOptions: { gapMs: 0 },
    });
    expect(res.ok).toBe(true);
    // The one-pager is never judged; only the deep dive sees the editor.
    expect(calls).toEqual(["onepager draft", "deepdive draft", "deepdive judge"]);

    const rungs = db.select().from(schema.atlasRungs).where(eq(schema.atlasRungs.nodeId, nodeId)).all();
    expect(rungs.map((r) => `${r.level}:${r.status}`).sort()).toEqual(["deepdive:ready", "onepager:ready"]);

    const onepager = rungs.find((r) => r.level === "onepager")!;
    expect(onepager.hook).toMatch(/your own mind/);
    expect(onepager.wordCount).toBeGreaterThanOrEqual(300);
    expect(onepager.judgeVerdict).toBeNull();

    const deepdive = rungs.find((r) => r.level === "deepdive")!;
    expect(deepdive.bodyMd).toContain("### Further reading");
    expect(deepdive.bodyMd).toContain("[Stoicism](https://en.wikipedia.org/wiki/Stoicism)");
    expect(deepdive.bodyMd).toContain("[Meditations](https://openlibrary.org/works/OL1W)");
    expect(deepdive.bodyMd).toContain("[Zeno of Citium](https://en.wikipedia.org/wiki/Zeno_of_Citium)");

    const readings = db
      .select()
      .from(schema.atlasReadings)
      .where(eq(schema.atlasReadings.nodeId, nodeId))
      .all();
    expect(readings.filter((r) => r.status === "verified").map((r) => r.title)).toEqual([
      "Stoicism",
      "Meditations",
      "Zeno of Citium",
    ]);
    // The deep dive re-proposed "Stoicism"; it was filtered before any fetch.
    expect(net.calls.filter((u) => u.startsWith(WIKI))).toHaveLength(2);
  });

  it("returns a ready rung without calling the model again", async () => {
    const db = makeDb();
    const { nodeId } = seed(db);
    const net = fakeFetch();
    const first = await ensureRung(db, nodeId, "onepager", {
      llm: fakeLlm([]),
      fetchImpl: net.impl,
      log: quiet,
      judge: false,
      verifyOptions: { gapMs: 0 },
    });
    expect(first).toMatchObject({ ok: true, fresh: true });

    const calls: string[] = [];
    const second = await ensureRung(db, nodeId, "onepager", { llm: fakeLlm(calls), log: quiet });
    expect(second).toMatchObject({ ok: true, fresh: false });
    expect(calls).toEqual([]);
  });

  it("writes the like-I'm-10 version from the one-pager, unjudged and without readings", async () => {
    const db = makeDb();
    const { nodeId } = seed(db);
    const calls: string[] = [];
    const net = fakeFetch();
    const res = await ensureRung(db, nodeId, "eli10", {
      llm: fakeLlm(calls),
      fetchImpl: net.impl,
      log: quiet,
      judge: true,
      verifyOptions: { gapMs: 0 },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["onepager draft", "eli10 draft"]);
    if (!res.ok) return;
    expect(res.rung.bodyMd).not.toMatch(/^###/m);
    expect(res.rung.judgeVerdict).toBeNull();
    const readings = db
      .select()
      .from(schema.atlasReadings)
      .where(eq(schema.atlasReadings.nodeId, nodeId))
      .all();
    expect(readings.every((r) => r.proposedBy === "onepager")).toBe(true);
  });

  it("writes the one-pager on the onepager model, never judges it, and stores the quiz", async () => {
    const db = makeDb();
    const { nodeId } = seed(db);
    const calls: string[] = [];
    const modelsSeen: string[] = [];
    const res = await ensureRung(db, nodeId, "onepager", {
      llm: fakeLlm(calls, {}, modelsSeen),
      fetchImpl: fakeFetch().impl,
      log: quiet,
      judge: true, // even with the judge forced on, a one-pager is never judged
      verifyOptions: { gapMs: 0 },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["onepager draft"]);
    expect(modelsSeen).toEqual(["claude-sonnet-5"]);
    if (!res.ok) return;
    expect(res.rung.model).toBe("claude-sonnet-5");
    expect(res.rung.judgeVerdict).toBeNull();
    expect(JSON.parse(res.rung.quizJson ?? "null")).toEqual(QUIZ);
  });

  it("repairs a bad quiz in the same pass as the body and stores the fixed one", async () => {
    const db = makeDb();
    const { nodeId } = seed(db);
    const calls: string[] = [];
    const res = await ensureRung(db, nodeId, "onepager", {
      llm: fakeLlm(calls, { quiz: BAD_QUIZ, repairedQuiz: QUIZ }),
      fetchImpl: fakeFetch().impl,
      log: quiet,
      verifyOptions: { gapMs: 0 },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["onepager draft", "onepager repair"]);
    if (!res.ok) return;
    expect(JSON.parse(res.rung.quizJson ?? "null")).toEqual(QUIZ);
  });

  it("fails the rung when the quiz stays broken after repair, like a broken body", async () => {
    const db = makeDb();
    const { nodeId } = seed(db);
    const calls: string[] = [];
    const res = await ensureRung(db, nodeId, "onepager", {
      llm: fakeLlm(calls, { quiz: BAD_QUIZ, repairedQuiz: BAD_QUIZ }),
      fetchImpl: fakeFetch().impl,
      log: quiet,
      verifyOptions: { gapMs: 0 },
    });
    expect(res.ok).toBe(false);
    expect(calls).toEqual(["onepager draft", "onepager repair"]);
    const row = db
      .select()
      .from(schema.atlasRungs)
      .where(eq(schema.atlasRungs.nodeId, nodeId))
      .get()!;
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/distinct/);
  });

  it("stores visuals with the body and verifies the proposed image against the article's media", async () => {
    const db = makeDb();
    const { nodeId } = seed(db);
    const calls: string[] = [];
    const net = fakeFetch();
    const res = await ensureRung(db, nodeId, "onepager", {
      llm: fakeLlm(calls, {
        onepagerBody: ONEPAGER_WITH_VISUALS,
        visuals: [DIAGRAM],
        images: [IMAGE_PROPOSAL],
      }),
      fetchImpl: net.impl,
      log: quiet,
      verifyOptions: { gapMs: 0 },
      verifyImageOptions: { gapMs: 0 },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["onepager draft"]);
    if (!res.ok) return;
    expect(res.rung.bodyMd).toContain("[[visual:succession]]");
    expect(res.rung.bodyMd).toContain("[[image:zeno-bust]]");
    expect(JSON.parse(res.rung.visualsJson ?? "null")).toMatchObject([{ kind: "diagram", slug: "succession" }]);
    // Markers never count as words.
    expect(res.rung.wordCount).toBeGreaterThanOrEqual(300);

    const images = db.select().from(schema.atlasImages).where(eq(schema.atlasImages.nodeId, nodeId)).all();
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      slug: "zeno-bust",
      status: "verified",
      fileTitle: "File:Zeno of Citium bust.jpg",
      verifiedVia: "article_media",
      author: "Paolo Monti",
      license: "CC BY-SA 4.0",
      proposedBy: "onepager",
    });
  });

  it("stores a rejected image with its reason, never shown", async () => {
    const db = makeDb();
    const { nodeId } = seed(db);
    const net = fakeFetch();
    const res = await ensureRung(db, nodeId, "onepager", {
      llm: fakeLlm([], {
        onepagerBody: ONEPAGER_WITH_VISUALS,
        visuals: [DIAGRAM],
        images: [{ ...IMAGE_PROPOSAL, query: "completely unrelated subject" }],
      }),
      fetchImpl: net.impl,
      log: quiet,
      verifyOptions: { gapMs: 0 },
      verifyImageOptions: { gapMs: 0 },
    });
    expect(res.ok).toBe(true);
    const images = db.select().from(schema.atlasImages).where(eq(schema.atlasImages.nodeId, nodeId)).all();
    expect(images).toHaveLength(1);
    expect(images[0].status).toBe("rejected");
    expect(images[0].rejectReason).toMatch(/below threshold/);
    // The marker stays in the body; the renderer drops it for lack of a
    // verified row. The rung itself is untouched by the rejection.
    if (!res.ok) return;
    expect(res.rung.bodyMd).toContain("[[image:zeno-bust]]");
  });

  it("repairs broken visuals in the same pass as the body", async () => {
    const db = makeDb();
    const { nodeId } = seed(db);
    const calls: string[] = [];
    const res = await ensureRung(db, nodeId, "onepager", {
      // First draft proposes a visual but never places its marker.
      llm: fakeLlm(calls, {
        visuals: [DIAGRAM],
        repairedBody: ONEPAGER_WITH_VISUALS.replace("[[image:zeno-bust]]\n\n", ""),
        repairedVisuals: [DIAGRAM],
      }),
      fetchImpl: fakeFetch().impl,
      log: quiet,
      verifyOptions: { gapMs: 0 },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["onepager draft", "onepager repair"]);
    if (!res.ok) return;
    expect(res.rung.bodyMd).toContain("[[visual:succession]]");
    expect(JSON.parse(res.rung.visualsJson ?? "null")).toHaveLength(1);
  });

  it("drops visuals still broken after repair instead of failing the rung", async () => {
    const db = makeDb();
    const { nodeId } = seed(db);
    const calls: string[] = [];
    const res = await ensureRung(db, nodeId, "onepager", {
      // A marker with no matching visual, before and after repair.
      llm: fakeLlm(calls, {
        onepagerBody: `${ONEPAGER}\n\n[[visual:ghost]]`,
        visuals: [],
      }),
      fetchImpl: fakeFetch().impl,
      log: quiet,
      verifyOptions: { gapMs: 0 },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["onepager draft", "onepager repair"]);
    if (!res.ok) return;
    expect(res.rung.status).toBe("ready");
    expect(res.rung.bodyMd).not.toContain("[[visual:");
    expect(JSON.parse(res.rung.visualsJson ?? "null")).toEqual([]);
  });

  it("keeps the like-I'm-10 version marker-free", async () => {
    const db = makeDb();
    const { nodeId } = seed(db);
    const calls: string[] = [];
    const res = await ensureRung(db, nodeId, "eli10", {
      llm: fakeLlm(calls, { eli10Body: `${ELI10}\n\n[[visual:ghost]]` }),
      fetchImpl: fakeFetch().impl,
      log: quiet,
      verifyOptions: { gapMs: 0 },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["onepager draft", "eli10 draft", "eli10 repair"]);
    if (!res.ok) return;
    expect(res.rung.bodyMd).not.toContain("[[visual:");
    expect(res.rung.visualsJson).toBeNull();
  });

  it("asks for visuals and images in the one-pager and deep-dive prompts only", () => {
    const ctx = "MAP: Philosophy\nTHIS NODE (school): Stoicism — ?";
    expect(buildRungPrompt("onepager", { context: ctx })).toContain("VISUALS:");
    expect(buildRungPrompt("onepager", { context: ctx })).toContain("IMAGES:");
    expect(buildRungPrompt("deepdive", { context: ctx, onepagerMd: "ONE" })).toContain("VISUALS:");
    expect(buildRungPrompt("eli10", { context: ctx, onepagerMd: "ONE" })).not.toContain("VISUALS:");
  });

  it("marks the rung failed, with the reason, when a draft stays broken after repair", async () => {
    const db = makeDb();
    const { nodeId } = seed(db);
    const calls: string[] = [];
    const linky = `### A\n${words(160)} see https://example.com\n\n### B\n${words(160, "x")}`;
    const res = await ensureRung(db, nodeId, "onepager", {
      llm: fakeLlm(calls, { onepagerBody: linky }),
      fetchImpl: fakeFetch().impl,
      log: quiet,
      judge: true,
      verifyOptions: { gapMs: 0 },
    });
    expect(res.ok).toBe(false);
    expect(calls).toEqual(["onepager draft", "onepager repair"]);
    const row = db
      .select()
      .from(schema.atlasRungs)
      .where(eq(schema.atlasRungs.nodeId, nodeId))
      .get()!;
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/links or URLs/);
  });
});
