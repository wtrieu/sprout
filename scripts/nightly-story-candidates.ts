/**
 * Nightly story candidates: generate 2 draft bedtime stories with a LOCAL
 * headless `claude -p` run (billed to the Claude Max subscription — the
 * ANTHROPIC_API_KEY is stripped from the child env so the CLI can never fall
 * back to metered API billing). All deterministic work — ingredient picking,
 * validation, prompt composition, DB writes — happens here in code; Claude
 * only writes the story JSON. Drafts land in the app for review/rejection.
 *
 * Run via: pnpm --filter web run job:stories   (launchd: com.sprout.stories)
 */
import "./env";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { sql } from "drizzle-orm";
import { db } from "../apps/web/src/db/client";
import { children } from "../apps/web/src/db/schema";
import { ageInMonths, formatAge } from "../apps/web/src/lib/age";
import { resolveStoryAgeMonths } from "../apps/web/src/lib/settings";
import { ageBand, pickStoryForm, storyForms } from "../apps/web/src/lib/skills/storyText";
import { artPacks, pickArtPack } from "../apps/web/src/lib/skills/storyArt";
import { importCandidate } from "../apps/web/src/lib/stories/importCandidate";
import { pickMilestoneTheme, seasonalFlavor } from "../apps/web/src/lib/stories/planning";
import { journalContext, personalizationLine } from "../apps/web/src/lib/skills/journal";

const CANDIDATES_PER_DAY = 2;
const MAX_PENDING_DRAFTS = 4;
const PAGE_COUNT = 8;
const CLAUDE_TIMEOUT_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// headless claude
// ---------------------------------------------------------------------------

const callClaude = (prompt: string): string => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // Max-subscription OAuth only — never the API
  const bin = process.env.CLAUDE_BIN ?? "claude";
  const args = ["-p", prompt, "--output-format", "json"];
  if (process.env.STORY_CLAUDE_MODEL) args.push("--model", process.env.STORY_CLAUDE_MODEL);
  const res = spawnSync(bin, args, {
    cwd: os.tmpdir(), // keep repo CLAUDE.md / loop playbooks out of context
    env,
    encoding: "utf8",
    timeout: CLAUDE_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (res.error) throw new Error(`claude CLI failed to spawn: ${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(`claude CLI exited ${res.status}: ${(res.stderr || res.stdout).slice(0, 2000)}`);
  }
  return res.stdout;
};

/** stdout → the model's text: `--output-format json` envelope, or raw text. */
const extractResultText = (stdout: string): string => {
  try {
    const envelope = JSON.parse(stdout);
    if (envelope && typeof envelope.result === "string") return envelope.result;
  } catch {
    // envelope shape drifted — fall through to raw stdout
  }
  return stdout;
};

/** The model's text → the first balanced JSON object (fences tolerated). */
const extractJsonBlock = (text: string): unknown => {
  const cleaned = text.replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error(`no JSON object in claude output: ${cleaned.slice(0, 300)}`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
    } else if (ch === "\\" && inString) {
      escaped = true;
    } else if (ch === '"') {
      inString = !inString;
    } else if (!inString && ch === "{") {
      depth += 1;
    } else if (!inString && ch === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error(`unbalanced JSON in claude output: ${cleaned.slice(0, 300)}`);
};

// ---------------------------------------------------------------------------
// the craft prompt
// ---------------------------------------------------------------------------

type Ingredients = {
  childName: string;
  targetMonths: number;
  formKey: string;
  theme: string;
  season: string;
  personal: string;
  avoidCharacters: string[];
};

const buildPrompt = (ing: Ingredients): string => {
  const form = storyForms[ing.formKey];
  const band = ageBand(ing.targetMonths);
  return `You write bedtime picture books in the tradition of the great read-aloud classics. Write a ${PAGE_COUNT}-page book for ${ing.childName}, ${formatAge(ing.targetMonths)} old.

Story theme to gently model: ${ing.theme}
Season right now: ${ing.season} — let it color the setting naturally, don't force it.
${ing.personal ? `${ing.personal}\n` : ""}
INVENT the main character: a simple, warm animal character.${
    ing.avoidCharacters.length > 0
      ? ` Recent books already starred ${ing.avoidCharacters.join(", ")} — pick a different species and name.`
      : ""
  }
- "characterName": the character's short friendly name.
- "characterDesc": a canonical appearance block of AT MOST 40 words (species, colors, size, one distinctive clothing item or accessory). It will be pasted verbatim into every illustration prompt, so it must fully describe the character on its own.

THE FORM — this book is a ${form.name} book:
${form.spec}

${form.exemplar}
(Shape and craft only — never reuse the example's characters, refrain, objects, or wording.)

READING LEVEL:
${band.language}
Hard limit: at most ${band.maxWordsPerPage} words of story text per page.

CRAFT RULES:
- The theme lives in what the character DOES — never name it, never state a moral.
- One "join in" beat somewhere in the middle: a sound to make together or something to find in the picture. Never on the last two pages.
- The last two pages decelerate: shorter, softer, quieter, ending asleep and safe. No exclamation marks there.
- No peril, nothing scary, nothing sad. It's the last thing the child hears before sleep.
- Each page needs a "scene": a self-contained visual description of THAT page's moment (setting, what the character is doing, time of day, mood, lighting). Do NOT describe the character's appearance (characterDesc covers it) and do NOT name an art style. Never include text or words in the scene. Compose simply: the character alone or with ONE animal friend, full-body or distant views, no crowds, no mirrors, nothing hand-intricate.

Return ONLY a JSON object, no prose before or after, exactly this shape:
{ "title": string, "characterName": string, "characterDesc": string, "pages": [ { "text": string, "scene": string } ] }
Exactly ${PAGE_COUNT} pages.`;
};

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const main = async () => {
  console.log(`story candidates starting ${new Date().toISOString()}`);
  const child = db.select().from(children).limit(1).get();
  if (!child) {
    console.log("no child profile — skipping");
    return;
  }

  // Idempotency: don't pile drafts on top of unreviewed drafts.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const madeToday =
    db.get<{ n: number }>(
      sql`SELECT COUNT(*) as n FROM stories WHERE status = 'draft' AND created_at >= ${Math.floor(todayStart.getTime() / 1000)}`,
    )?.n ?? 0;
  const pending =
    db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM stories WHERE status = 'draft'`)?.n ?? 0;
  if (madeToday >= CANDIDATES_PER_DAY) {
    console.log(`already ${madeToday} candidate(s) today — skipping`);
    return;
  }
  if (pending >= MAX_PENDING_DRAFTS) {
    console.log(`${pending} drafts already waiting for review — skipping`);
    return;
  }

  const targetMonths = resolveStoryAgeMonths(db);
  const actualMonths = ageInMonths(child.dob);
  const season = seasonalFlavor();
  const personal = personalizationLine(journalContext(db));
  const avoidCharacters = db
    .all<{ name: string }>(
      sql`SELECT DISTINCT character_name as name FROM stories WHERE character_name IS NOT NULL ORDER BY id DESC LIMIT 6`,
    )
    .map((r) => r.name);

  const toMake = Math.min(CANDIDATES_PER_DAY - madeToday, MAX_PENDING_DRAFTS - pending);
  const usedForms: string[] = [];
  const usedPacks: string[] = [];
  let created = 0;

  for (let i = 0; i < toMake; i++) {
    const formKey = pickStoryForm(db, usedForms);
    const artPackKey = pickArtPack(db, usedPacks);
    // Track at pick time (not on success) so the day's two candidates differ
    // even if the first attempt errors out.
    usedForms.push(formKey);
    usedPacks.push(artPackKey);
    // Developmental theme follows the child's real age; reading level follows
    // the (possibly manual) target setting.
    const theme = pickMilestoneTheme(db, actualMonths);
    const themeText = theme
      ? `(${theme.domain}) ${theme.description}`
      : "a small, cozy everyday discovery";

    const ingredients: Ingredients = {
      childName: child.name,
      targetMonths,
      formKey,
      theme: themeText,
      season,
      personal,
      avoidCharacters,
    };
    const prompt = buildPrompt(ingredients);
    console.log(
      `candidate ${i + 1}/${toMake}: form=${formKey} art=${artPacks[artPackKey].name} theme="${themeText.slice(0, 70)}"`,
    );

    try {
      let raw = extractJsonBlock(extractResultText(callClaude(prompt)));
      let result = importCandidate(db, raw, {
        childId: child.id,
        ageMonths: targetMonths,
        formKey,
        artPackKey,
        theme: themeText,
      });

      if (!result.ok) {
        console.log(`draft flagged, retrying once: ${result.problems.join("; ")}`);
        const retryPrompt = `${prompt}

You already wrote a draft, but an editor flagged problems. Fix ONLY these, keeping everything that works:
${result.problems.map((p) => `- ${p}`).join("\n")}

YOUR PREVIOUS DRAFT:
${JSON.stringify(raw)}

Return the corrected JSON object only, same shape, exactly ${PAGE_COUNT} pages.`;
        raw = extractJsonBlock(extractResultText(callClaude(retryPrompt)));
        result = importCandidate(db, raw, {
          childId: child.id,
          ageMonths: targetMonths,
          formKey,
          artPackKey,
          theme: themeText,
        });
      }

      if (result.ok) {
        created += 1;
        console.log(`created draft #${result.storyId}: "${result.title}"`);
      } else {
        console.error(`candidate rejected after retry: ${result.problems.join("; ")}`);
      }
    } catch (err) {
      console.error(
        `candidate ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`story candidates done — ${created}/${toMake} created`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
