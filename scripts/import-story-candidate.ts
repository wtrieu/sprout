/**
 * Manual candidate import for debugging / re-imports:
 *   pnpm --filter web run story:import ./candidate.json [--form refrain] [--art watercolor-soft]
 * The JSON file must match CandidateSchema ({ title, characterName,
 * characterDesc, pages: [{ text, scene }] }).
 */
import "./env";
import fs from "node:fs";
import path from "node:path";
import { db } from "../apps/web/src/db/client";
import { children } from "../apps/web/src/db/schema";
import { resolveStoryAgeMonths } from "../apps/web/src/lib/settings";
import { pickStoryForm } from "../apps/web/src/lib/skills/storyText";
import { artPackKeys, pickArtPack } from "../apps/web/src/lib/skills/storyArt";
import { importCandidate } from "../apps/web/src/lib/stories/importCandidate";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};

if (!file) {
  console.error("usage: story:import <candidate.json> [--form <key>] [--art <key>]");
  process.exit(1);
}

const child = db.select().from(children).limit(1).get();
if (!child) {
  console.error("no child profile — set one up first");
  process.exit(1);
}

const artFlag = flag("art");
if (artFlag && !artPackKeys.includes(artFlag)) {
  console.error(`unknown art pack "${artFlag}" — one of: ${artPackKeys.join(", ")}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
const result = importCandidate(db, raw, {
  childId: child.id,
  ageMonths: resolveStoryAgeMonths(db),
  formKey: flag("form") ?? pickStoryForm(db),
  artPackKey: artFlag ?? pickArtPack(db),
  theme: "manually imported candidate",
});

if (result.ok) {
  console.log(`created draft #${result.storyId}: "${result.title}"`);
} else {
  console.error("candidate rejected:");
  for (const p of result.problems) console.error(`- ${p}`);
  process.exit(1);
}
