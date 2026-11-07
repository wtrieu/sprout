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
import { atlasMaps } from "@/db/schema";
import { DELETE } from "./route";

const del = (id: number) =>
  DELETE(new NextRequest(`http://localhost/api/atlas/maps/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: String(id) }),
  });
const spawnedArgs = () => vi.mocked(spawn).mock.calls.map((c) => (c[1] as string[]).slice(2));
const statusOf = (id: number) => db.select().from(atlasMaps).where(eq(atlasMaps.id, id)).get()?.status;
const add = (title: string, status: "queued" | "drafting" | "ready", createdAt = new Date()) =>
  db.insert(atlasMaps).values({ title, status, createdAt }).returning().get();

describe("DELETE /api/atlas/maps/[id]", () => {
  beforeEach(() => {
    db.delete(atlasMaps).run();
    vi.mocked(spawn).mockClear();
  });

  it("promotes the next queued map after deleting a drafting one", async () => {
    const t = Date.now();
    const drafting = add("Dead", "drafting", new Date(t));
    const next = add("Next", "queued", new Date(t + 1000));
    const later = add("Later", "queued", new Date(t + 2000));

    const res = await del(drafting.id);
    expect(res.status).toBe(200);
    expect(statusOf(drafting.id)).toBeUndefined();
    expect(statusOf(next.id)).toBe("drafting");
    expect(statusOf(later.id)).toBe("queued");
    expect(spawnedArgs()).toEqual([["draft-map", "--map", String(next.id)]]);
  });

  it("does not start a second draft while another map is still drafting", async () => {
    const busy = add("Busy", "drafting");
    const ready = add("Done", "ready");
    const q = add("Waiting", "queued");

    expect((await del(ready.id)).status).toBe(200);
    expect(statusOf(busy.id)).toBe("drafting");
    expect(statusOf(q.id)).toBe("queued");
    expect(spawnedArgs()).toEqual([]);
  });
});
