import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory migrated DB; the detached `pnpm run job:atlas` spawn is a recorder.
vi.mock("@/db/client", async () => {
  const schema = await import("@/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = OFF");
  const db = drizzle(sqlite, { schema });
  migrate(db, {
    migrationsFolder: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../db/migrations"),
  });
  return { db, schema };
});
vi.mock("node:child_process", () => ({ spawn: vi.fn(() => ({ unref: () => {} })) }));

import { spawn } from "node:child_process";
import { db } from "@/db/client";
import { atlasBookmarks, atlasMaps, atlasNodes, children } from "@/db/schema";
import { PATCH } from "./route";

const patch = (id: number, body: unknown) =>
  PATCH(
    new NextRequest(`http://localhost/api/atlas/bookmarks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
const spawnedArgs = () => vi.mocked(spawn).mock.calls.map((c) => (c[1] as string[]).slice(2));
const rowOf = (id: number) => db.select().from(atlasBookmarks).where(eq(atlasBookmarks.id, id)).get()!;

const seedBookmark = (kid: Partial<typeof atlasBookmarks.$inferInsert>) => {
  const child = db.insert(children).values({ name: "Wren", dob: "2023-01-01" }).returning().get();
  const map = db.insert(atlasMaps).values({ title: "Engineering", status: "ready" }).returning().get();
  const node = db
    .insert(atlasNodes)
    .values({ mapId: map.id, parentId: null, position: 0, title: "Bridges", blurb: "b", kind: "concept" })
    .returning()
    .get();
  return db
    .insert(atlasBookmarks)
    .values({ nodeId: node.id, childId: child.id, ...kid })
    .returning()
    .get();
};

describe("PATCH /api/atlas/bookmarks/[id] regenerateKid", () => {
  beforeEach(() => {
    db.delete(atlasBookmarks).run();
    vi.mocked(spawn).mockClear();
  });

  it("claims a failed kid version and spawns one job carrying the claim's stamp", async () => {
    const b = seedBookmark({ kidStatus: "failed", kidError: "old" });
    const res = await patch(b.id, { regenerateKid: true });
    expect(res.status).toBe(200);
    const row = rowOf(b.id);
    expect(row).toMatchObject({ kidStatus: "drafting", kidError: null });
    expect(spawnedArgs()).toEqual([
      ["kid", "--bookmark", String(b.id), "--stamp", String(row.kidStartedAt!.getTime())],
    ]);
  });

  it("answers 409 busy while a fresh kid draft is in flight, spawns nothing, still saves the note", async () => {
    const startedAt = new Date(Math.floor(Date.now() / 1000) * 1000 - 60_000);
    const b = seedBookmark({ kidStatus: "drafting", kidStartedAt: startedAt });
    const res = await patch(b.id, { regenerateKid: true, note: "the cable idea" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Already drafting/);
    expect(body.bookmark).toMatchObject({ id: b.id, kidStatus: "drafting", note: "the cable idea" });
    expect(spawnedArgs()).toEqual([]);
    expect(rowOf(b.id).kidStartedAt).toEqual(startedAt);
  });
});
