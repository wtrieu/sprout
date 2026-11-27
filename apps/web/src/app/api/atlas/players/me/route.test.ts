import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const schema = await import("@/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = OFF");
  const db = drizzle(sqlite, { schema });
  migrate(db, {
    migrationsFolder: path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../../db/migrations",
    ),
  });
  return { db, schema };
});
// The caller's identity rides on a test header instead of Cloudflare Access.
vi.mock("@/lib/auth", () => ({
  getAuthenticatedEmail: (req: Request) => req.headers.get("x-test-email"),
}));

import { db } from "@/db/client";
import { atlasEvents, atlasItems, atlasPlayers } from "@/db/schema";
import { createPlayer } from "@/lib/atlas/players";
import { PATCH } from "./route";

const patch = (body: unknown, email = "kid@x.y") =>
  PATCH(
    new NextRequest("http://localhost/api/atlas/players/me", {
      method: "PATCH",
      headers: { "x-test-email": email },
      body: JSON.stringify(body),
    }),
  );

describe("PATCH /api/atlas/players/me", () => {
  beforeEach(() => {
    db.delete(atlasItems).run();
    db.delete(atlasEvents).run();
    db.delete(atlasPlayers).run();
  });

  it("a loadout-only patch saves and answers 200", async () => {
    const created = createPlayer(db, { email: "kid@x.y", name: "Pip", persona: "protege" });
    if (!created.ok) throw new Error(created.error);
    const res = await patch({ loadout: { sprite: { hair: "hair-crop" }, tones: { skin: "tan" } } });
    expect(res.status).toBe(200);
    const { player } = await res.json();
    expect(player.loadout).toEqual({
      sprite: { hair: "hair-crop" },
      tones: { skin: "tan" },
    });
  });

  it("an unowned frame is a 400 with a reason", async () => {
    const created = createPlayer(db, { email: "kid@x.y", name: "Pip", persona: "protege" });
    if (!created.ok) throw new Error(created.error);
    const res = await patch({ loadout: { frame: "frame-ivy" } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/do not own/);
  });
});
