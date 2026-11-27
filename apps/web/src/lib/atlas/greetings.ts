/**
 * Model-written map greetings: one call per map, after the draft, writes a
 * handful of lines in each persona's voice about *this* field — its schools,
 * thinkers and arguments — so Bread greets you with bread and Stoicism with
 * Stoics. Stored on the map row; persona.ts mixes them with the hand-written
 * template lines (which carry the live, progress-aware jokes).
 *
 * Best-effort everywhere: a failed call leaves `greetings` null and the
 * templates speak alone. Backfill older maps with
 * `job:atlas greetings --map <id>` or `--missing`.
 */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../../db/client";
import { atlasMaps, atlasNodes, type AtlasPersona } from "../../db/schema";
import { atlasModels, cliLlm, type AtlasLlm } from "./llm";
import { PERSONA_LABELS } from "./persona";

export const GREETINGS_PER_PERSONA = 6;

const Line = z
  .string()
  .trim()
  .min(15)
  .max(220)
  // Placeholders or markup would render verbatim on the map page.
  .refine((s) => !/[{}<>*_`#]/.test(s), "plain text only: no markup, braces or placeholders");

const Lines = z.array(Line).min(4).max(8);

export const MapGreetingsSchema = z.object({ cartographer: Lines, protege: Lines });
export type MapGreetings = z.infer<typeof MapGreetingsSchema>;

/** The stored column → one persona's lines; anything malformed reads as none. */
export const greetingsFor = (raw: string | null | undefined, persona: AtlasPersona): string[] => {
  if (!raw) return [];
  try {
    const parsed = MapGreetingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data[persona] : [];
  } catch {
    return [];
  }
};

type MapOutlineForPrompt = {
  title: string;
  blurb: string | null;
  branches: Array<{ title: string; children: string[] }>;
};

export const buildGreetingsPrompt = (map: MapOutlineForPrompt): string => `You write the greeting lines two characters say when a player opens a map in a family learning app. A map is one field of knowledge; the player has been here before and is coming back to keep exploring.

MAP: ${map.title}${map.blurb ? ` — ${map.blurb}` : ""}
WHAT'S ON IT (branches, with some of their entries):
${map.branches.map((b) => `- ${b.title}${b.children.length ? `: ${b.children.join(", ")}` : ""}`).join("\n")}

THE CHARACTERS:
- cartographer — ${PERSONA_LABELS.cartographer.title}. ${PERSONA_LABELS.cartographer.pitch} Dry, fussy, fond of ink, ledgers, stamps and margins.
  Voice sample (from another map): "Nothing verified yet. A map of rumors is not a map; it is gossip with coordinates."
- protege — ${PERSONA_LABELS.protege.title}. ${PERSONA_LABELS.protege.pitch} Eager, sweet, takes things too literally.
  Voice sample (from another map): "So far I know nothing from this map. Teach me one thing and I'll repeat it to everyone, forever."

Return JSON only:
{ "cartographer": [string, ...], "protege": [string, ...] }

Rules:
- Exactly ${GREETINGS_PER_PERSONA} lines per character, each one or two short sentences, under 180 characters.
- Every line is about THIS field: name a real branch, entry, idea, tool or famous detail from it. A line that would work on any other map is wrong.
- Jokes land on the material and on the character's own quirks — never on the player. Warm, never mocking.
- Family-friendly: a young child may be reading over a parent's shoulder.
- Don't mention progress, counts, levels, quizzes or the player's name; you don't know them.
- Vary the shapes: not every line starts with "Back to" or a greeting word.
- Plain text: no markdown, emoji, braces or placeholders. Quotation marks around a name are fine.`;

/** The map and its tree, shaped for the prompt (children capped per branch). */
const loadOutline = (db: DB, mapId: number): MapOutlineForPrompt | null => {
  const map = db.select().from(atlasMaps).where(eq(atlasMaps.id, mapId)).get();
  if (!map) return null;
  const nodes = db
    .select({ id: atlasNodes.id, parentId: atlasNodes.parentId, title: atlasNodes.title })
    .from(atlasNodes)
    .where(eq(atlasNodes.mapId, mapId))
    .orderBy(asc(atlasNodes.position), asc(atlasNodes.id))
    .all();
  const branches = nodes
    .filter((n) => n.parentId === null)
    .map((b) => ({
      title: b.title,
      children: nodes.filter((n) => n.parentId === b.id).slice(0, 4).map((n) => n.title),
    }));
  return { title: map.title, blurb: map.blurb, branches };
};

export type DraftGreetingsResult =
  | { ok: true; status: "drafted"; count: number }
  | { ok: true; status: "exists" }
  | { ok: false; error: string };

/**
 * Draft and store one map's greetings. Skips a map that already has them
 * unless `force`; a map with no nodes yet is an error (nothing to be about).
 */
export const draftMapGreetings = (
  db: DB,
  mapId: number,
  deps: { llm?: AtlasLlm; log?: (msg: string) => void; force?: boolean } = {},
): DraftGreetingsResult => {
  const llm = deps.llm ?? cliLlm;
  const log = deps.log ?? console.log;
  const existing = db
    .select({ greetings: atlasMaps.greetings })
    .from(atlasMaps)
    .where(eq(atlasMaps.id, mapId))
    .get();
  if (!existing) return { ok: false, error: `map #${mapId} not found` };
  if (existing.greetings && !deps.force) return { ok: true, status: "exists" };

  const outline = loadOutline(db, mapId);
  if (!outline || outline.branches.length === 0) {
    return { ok: false, error: `map #${mapId} has no nodes to greet about` };
  }
  try {
    const model = atlasModels().greetings;
    log(`greetings: map #${mapId} "${outline.title}" model=${model}`);
    const lines = llm(buildGreetingsPrompt(outline), MapGreetingsSchema, {
      model,
      label: "map greetings",
    });
    db.update(atlasMaps)
      .set({ greetings: JSON.stringify(lines) })
      .where(eq(atlasMaps.id, mapId))
      .run();
    const count = lines.cartographer.length + lines.protege.length;
    log(`greetings: map #${mapId} stored ${count} lines`);
    return { ok: true, status: "drafted", count };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log(`greetings: map #${mapId} failed (${error})`);
    return { ok: false, error };
  }
};

/** Ready maps that have never had greetings drafted: the backfill's work list. */
export const mapsMissingGreetings = (db: DB): number[] =>
  db
    .select({ id: atlasMaps.id, status: atlasMaps.status, greetings: atlasMaps.greetings })
    .from(atlasMaps)
    .orderBy(asc(atlasMaps.id))
    .all()
    .filter((m) => m.status === "ready" && !m.greetings)
    .map((m) => m.id);
