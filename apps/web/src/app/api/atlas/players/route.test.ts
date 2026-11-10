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
    migrationsFolder: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../db/migrations"),
  });
  return { db, schema };
});
// The caller's identity rides on a test header instead of Cloudflare Access.
vi.mock("@/lib/auth", () => ({
  getAuthenticatedEmail: (req: Request) => req.headers.get("x-test-email"),
}));

import { db } from "@/db/client";
import { atlasEvents, atlasPlayers } from "@/db/schema";
import { parseLoadout } from "@/lib/atlas/game/loadout";
import { POST } from "./route";

const post = (body: unknown, email = "kid@x.y") =>
  POST(
    new NextRequest("http://localhost/api/atlas/players", {
      method: "POST",
      headers: { "x-test-email": email },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/atlas/players", () => {
  beforeEach(() => {
    db.delete(atlasEvents).run();
    db.delete(atlasPlayers).run();
  });

  it("without a look the loadout stays null", async () => {
    const res = await post({ name: "Pip", persona: "cartographer" });
    expect(res.status).toBe(201);
    const { player } = await res.json();
    expect(player.loadout).toBeNull();
  });

  it("a valid look becomes the starting loadout", async () => {
    const res = await post({
      name: "Pip",
      persona: "protege",
      look: { sprite: { body: "body-girl", hair: "hair-long", outfit: "outfit-vest" }, tones: { skin: "deep", hair: "black" } },
    });
    expect(res.status).toBe(201);
    const { player } = await res.json();
    expect(parseLoadout(player.loadout)).toEqual({
      sprite: { body: "body-girl", hair: "hair-long", outfit: "outfit-vest" },
      tones: { skin: "deep", hair: "black" },
    });
    const stored = db.select().from(atlasPlayers).get()!;
    expect(parseLoadout(stored.loadout)).toEqual(parseLoadout(player.loadout));
    // Creation is not a change: no equip event.
    expect(db.select().from(atlasEvents).all().map((e) => e.verb)).not.toContain("equip");
  });

  it.each([
    ["a loot part", { sprite: { hair: "hair-hood" } }],
    ["a part in the wrong slot", { sprite: { outfit: "hair-bob" } }],
    ["an unknown part", { sprite: { hair: "hair-short" } }],
    ["an unknown slot", { sprite: { wings: "hair-bob" } }],
    ["an unknown swap group", { tones: { eyes: "blue" } }],
    ["an unknown tone", { tones: { skin: "green" } }],
    ["an unknown look key", { colors: {} }],
  ])("rejects %s with 400 and creates nothing", async (_label, look) => {
    const res = await post({ name: "Pip", persona: "cartographer", look });
    expect(res.status).toBe(400);
    expect(db.select().from(atlasPlayers).all()).toHaveLength(0);
    expect(db.select().from(atlasEvents).all()).toHaveLength(0);
  });
});
