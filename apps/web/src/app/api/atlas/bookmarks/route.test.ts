import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

// In-memory migrated DB; the detached `pnpm run job:atlas` spawn is a recorder.
vi.mock("@/db/client", async () => {
  const schema = await import("@/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = OFF");
  const db = drizzle(sqlite, { schema });
  migrate(db, {
    migrationsFolder: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../db/migrations"),
  });
  return { db, schema };
});
vi.mock("node:child_process", () => ({ spawn: vi.fn(() => ({ unref: () => {} })) }));

import { db } from "@/db/client";
import { atlasBookmarks, atlasMaps, atlasNodes, children } from "@/db/schema";
import { KID_STALE_MS } from "@/lib/atlas/runner";
import { GET } from "./route";

describe("GET /api/atlas/bookmarks", () => {
  it("reaps a kid draft that died silently: stale drafting turns failed, a fresh one stays drafting", async () => {
    const child = db.insert(children).values({ name: "Wren", dob: "2023-01-01" }).returning().get();
    const map = db.insert(atlasMaps).values({ title: "Engineering", status: "ready" }).returning().get();
    const bookmark = (title: string, kidStartedAt: Date) => {
      const node = db
        .insert(atlasNodes)
        .values({ mapId: map.id, parentId: null, position: 0, title, blurb: "b", kind: "concept" })
        .returning()
        .get();
      return db
        .insert(atlasBookmarks)
        .values({ nodeId: node.id, childId: child.id, kidStatus: "drafting", kidStartedAt })
        .returning()
        .get();
    };
    const stale = bookmark("Dead", new Date(Date.now() - KID_STALE_MS - 60_000));
    const live = bookmark("Live", new Date(Date.now() - 60_000));

    const res = GET(new NextRequest("http://localhost/api/atlas/bookmarks"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const byId = new Map(body.bookmarks.map((b: { id: number; kidStatus: string }) => [b.id, b.kidStatus]));
    expect(byId.get(stale.id)).toBe("failed");
    expect(byId.get(live.id)).toBe("drafting");
    const row = db.select().from(atlasBookmarks).where(eq(atlasBookmarks.id, stale.id)).get()!;
    expect(row.kidError).toMatch(/Try again/);
  });
});
