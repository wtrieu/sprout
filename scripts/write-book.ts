/**
 * Write one book from a single premise (stages B + C), used by the premise
 * inbox: greenlighting spawns this detached so the full draft is reviewable
 * minutes later. Also usable by hand for debugging:
 *   pnpm --filter web run job:write-book -- --premise 42
 */
import "./env";
import { eq } from "drizzle-orm";
import { db } from "../apps/web/src/db/client";
import { premises } from "../apps/web/src/db/schema";
import { writeBookForPremise } from "../apps/web/src/lib/stories/writeBook";

const args = process.argv.slice(2);
const flagIdx = args.indexOf("--premise");
const premiseId = Number(flagIdx !== -1 ? args[flagIdx + 1] : args[0]);
if (!Number.isInteger(premiseId)) {
  console.error("usage: job:write-book -- --premise <id>");
  process.exit(1);
}

const row = db.select().from(premises).where(eq(premises.id, premiseId)).get();
if (!row) {
  console.error(`premise #${premiseId} not found`);
  process.exit(1);
}
if (!["greenlit", "auto_picked"].includes(row.status) || row.storyId) {
  console.error(`premise #${premiseId} is ${row.status}${row.storyId ? " (already written)" : ""} — nothing to do`);
  process.exit(1);
}

try {
  const result = writeBookForPremise(db, row);
  if (result.ok) {
    console.log(`premise #${premiseId} → draft #${result.storyId} "${result.title}"`);
  } else {
    console.error(`premise #${premiseId} rejected: ${result.reason}`);
    process.exit(2);
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}
