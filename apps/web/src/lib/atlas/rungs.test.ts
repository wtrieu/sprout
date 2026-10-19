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
  buildRungPrompt,
  ensureRung,
  validateRungBody,
  wordCount,
} from "./rungs";
import type { FetchLike } from "./verify";

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
const DEEPDIVE = ["Origins", "Figures", "Debates", "Influence", "Misreadings"]
  .map((h, i) => `### ${h}\n${words(200, `d${i}`)}`)
  .join("\n\n");
const ELI10 = words(150, "k");

/** Routes on prompt content, so call order is a consequence rather than a script. */
const fakeLlm =
  (calls: string[], overrides: { onepagerBody?: string } = {}): AtlasLlm =>
  (prompt, zschema, opts) => {
    calls.push(opts.label ?? "?");
    let out: unknown;
    if (prompt.includes('"verdict": "approve" | "revise"')) {
      out = { verdict: "approve", problems: [], fixes: [] };
    } else if (prompt.includes("Write the ONE-PAGER")) {
      out = {
        hook: "The only thing in your power is your own mind.",
        body_md: overrides.onepagerBody ?? ONEPAGER,
        readings: [
          { kind: "wikipedia", title: "Stoicism", why: "the overview" },
          { kind: "book", title: "Meditations", author: "Marcus Aurelius", why: "the diary" },
        ],
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
      out = { body_md: ELI10 };
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
  const impl: FetchLike = async (url) => {
    calls.push(url);
    if (url.startsWith(`${WIKI}Stoicism`)) return summary("Stoicism");
    if (url.startsWith(`${WIKI}Zeno_of_Citium`)) return summary("Zeno of Citium");
    if (url.startsWith("https://openlibrary.org/search.json")) {
      return new Response(
        JSON.stringify({
          docs: [{ key: "/works/OL1W", title: "Meditations", author_name: ["Marcus Aurelius"] }],
        }),
        { status: 200 },
      );
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
    expect(calls).toEqual(["onepager draft", "onepager judge", "deepdive draft", "deepdive judge"]);

    const rungs = db.select().from(schema.atlasRungs).where(eq(schema.atlasRungs.nodeId, nodeId)).all();
    expect(rungs.map((r) => `${r.level}:${r.status}`).sort()).toEqual(["deepdive:ready", "onepager:ready"]);

    const onepager = rungs.find((r) => r.level === "onepager")!;
    expect(onepager.hook).toMatch(/your own mind/);
    expect(onepager.wordCount).toBeGreaterThanOrEqual(300);
    expect(onepager.judgeVerdict).toContain('"approve"');

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
    expect(calls).toEqual(["onepager draft", "onepager judge", "eli10 draft"]);
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
