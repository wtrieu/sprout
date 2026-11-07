import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The route's db is the in-memory migrated one; the detached `pnpm run
// job:atlas` spawn is a recorder, so nothing real is ever started.
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

import { spawn } from "node:child_process";
import { db } from "@/db/client";
import { atlasMaps } from "@/db/schema";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/atlas/maps", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
// spawn("pnpm", ["run", "job:atlas", ...args]) → just the job args.
const spawnedArgs = () => vi.mocked(spawn).mock.calls.map((c) => (c[1] as string[]).slice(2));

describe("POST /api/atlas/maps", () => {
  beforeEach(() => {
    db.delete(atlasMaps).run();
    vi.mocked(spawn).mockClear();
  });

  it("drafts straight away when nothing is drafting", async () => {
    const res = await post({ title: "Physics" });
    expect(res.status).toBe(202);
    const { map } = await res.json();
    expect(map.status).toBe("drafting");
    expect(spawnedArgs()).toEqual([["draft-map", "--map", String(map.id)]]);
  });

  it("queues instead of refusing when a map is already drafting", async () => {
    const first = (await (await post({ title: "Physics" })).json()).map;
    vi.mocked(spawn).mockClear();

    const res = await post({ title: "Biology", brief: "cells first" });
    expect(res.status).toBe(202);
    const { map } = await res.json();
    expect(map.status).toBe("queued");
    expect(map.title).toBe("Biology");
    expect(spawnedArgs()).toEqual([]);
    expect(db.select().from(atlasMaps).where(eq(atlasMaps.id, first.id)).get()?.status).toBe("drafting");
  });

  it("rejects a body with neither title nor preset", async () => {
    expect((await post({})).status).toBe(400);
  });
});
