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
import { DisciplineAssignmentsSchema, assignDisciplines, buildDisciplinePrompt } from "./disciplines";

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

const seed = (db: DB) => {
  const map = db
    .insert(schema.atlasMaps)
    .values({ title: "Philosophy", status: "ready" })
    .returning()
    .get();
  const node = (parentId: number | null, position: number, title: string, discipline: schema.AtlasDiscipline | null = null) =>
    db
      .insert(schema.atlasNodes)
      .values({
        mapId: map.id,
        parentId,
        position,
        title,
        blurb: `${title} — the live question.`,
        kind: parentId === null ? "branch" : "school",
        discipline,
      })
      .returning()
      .get();
  const branch = node(null, 0, "Logic");
  const kid1 = node(branch.id, 0, "The syllogism");
  const kid2 = node(branch.id, 1, "Rhetoric", "language"); // already tagged
  return { map, branch, kid1, kid2 };
};

describe("assignDisciplines", () => {
  it("tags untagged nodes by exact title, ignores unknown titles, skips tagged ones", () => {
    const db = makeDb();
    const { map, branch, kid1, kid2 } = seed(db);
    const prompts: string[] = [];
    const llm: AtlasLlm = (prompt, zodSchema) => {
      prompts.push(prompt);
      return zodSchema.parse({
        assignments: [
          { title: "Logic", discipline: "reasoning" },
          { title: "The Syllogism", discipline: "reasoning" }, // case-insensitive match
          { title: "A node that does not exist", discipline: "systems" },
        ],
      });
    };
    const res = assignDisciplines(db, map.id, { llm, log: () => {} });
    expect(res.tagged).toBe(2);
    expect(res.unknownTitles).toEqual(["A node that does not exist"]);
    const get = (id: number) =>
      db.select().from(schema.atlasNodes).where(eq(schema.atlasNodes.id, id)).get()!;
    expect(get(branch.id).discipline).toBe("reasoning");
    expect(get(kid1.id).discipline).toBe("reasoning");
    expect(get(kid2.id).discipline).toBe("language");
    // The already-tagged node was not in the batch the model saw.
    expect(prompts[0]).not.toContain("Rhetoric");

    // A second run has nothing left to tag and makes no calls.
    const again = assignDisciplines(db, map.id, { llm: () => {
      throw new Error("should not be called");
    }, log: () => {} });
    expect(again.tagged).toBe(0);
  });

  it("the prompt lists entries and the five definitions; the schema rejects junk", () => {
    const prompt = buildDisciplinePrompt({
      mapTitle: "Philosophy",
      branch: { title: "Logic", blurb: "What follows from what?" },
      nodes: [{ title: "The syllogism", blurb: "Why does it compel?" }],
    });
    expect(prompt).toContain("The syllogism");
    expect(prompt).toContain('"reasoning"');
    expect(prompt).toContain("creativity");
    expect(
      DisciplineAssignmentsSchema.safeParse({
        assignments: [{ title: "x", discipline: "vibes" }],
      }).success,
    ).toBe(false);
  });
});
