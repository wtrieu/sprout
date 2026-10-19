/**
 * Rungs — the ladder on every node.
 *
 *   eli10     like I'm 10      120–220 words, no headings, from the one-pager
 *   onepager  curious adult    300–450 words, 2–4 "###" headings, 2–4 readings
 *   deepdive  the long read    900–1200 words, 4–7 headings, + Further reading
 *
 * ensureRung() is the one entry point: idempotent (a ready rung is returned
 * as-is unless forced), it drafts → validates (+1 repair) → judges (+1
 * revision, one-pager and deep dive only) → verifies the proposed readings →
 * stores. The rung row is the job status the UI polls, so it is flipped to
 * `drafting` first and to `ready`/`failed` last.
 *
 * Body markdown is constrained to the subset lib/markdown.ts renders and may
 * never contain a link: every link shown anywhere comes from atlas_readings.
 */
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import {
  atlasMaps,
  atlasNodes,
  atlasReadings,
  atlasRungs,
  atlasRungLevels,
  type AtlasRungLevel,
} from "../../db/schema";
import { NONFICTION_FLOOR } from "../stories/lanes";
import { atlasModels, cliLlm, type AtlasLlm } from "./llm";
import {
  normalizeTitle,
  verifyReadings,
  type FetchLike,
  type ReadingProposal,
  type RejectedReading,
  type VerifiedReading,
  type VerifyOptions,
} from "./verify";

export const RUNG_LEVELS = atlasRungLevels;
export const isRungLevel = (s: string): s is AtlasRungLevel =>
  (RUNG_LEVELS as readonly string[]).includes(s);

export const RUNG_LABELS: Record<AtlasRungLevel, string> = {
  eli10: "Like I'm 10",
  onepager: "One-pager",
  deepdive: "Deep dive",
};

export const RUNG_BUDGETS: Record<
  AtlasRungLevel,
  { min: number; max: number; headings: [number, number] }
> = {
  eli10: { min: 120, max: 220, headings: [0, 0] },
  onepager: { min: 300, max: 450, headings: [2, 4] },
  deepdive: { min: 900, max: 1200, headings: [4, 7] },
};

/** Word-count slack before a repair pass, and after it. */
export const SOFT_TOLERANCE = 0.15;
export const HARD_TOLERANCE = 0.25;

// --- schemas -----------------------------------------------------------------

export const ReadingProposalSchema = z.object({
  kind: z.enum(["wikipedia", "book", "web"]),
  title: z.string().trim().min(2).max(200),
  author: z.string().trim().max(120).nullish(),
  url: z.string().trim().max(500).nullish(),
  why: z.string().trim().max(240).nullish(),
});

export const RungDraftSchema = z.object({
  hook: z.string().trim().max(240).nullish(),
  body_md: z.string().min(40),
  readings: z.array(ReadingProposalSchema).max(6).nullish(),
});
export type RungDraft = z.infer<typeof RungDraftSchema>;

export const RungJudgeSchema = z.object({
  verdict: z.enum(["approve", "revise"]),
  problems: z.array(z.string()).default([]),
  fixes: z.array(z.string()).default([]),
});
export type RungJudge = z.infer<typeof RungJudgeSchema>;

// --- node context --------------------------------------------------------------

export type NodeContext = {
  map: { id: number; title: string; blurb: string | null };
  node: { id: number; title: string; blurb: string; kind: string; parentId: number | null };
  parent: { id: number; title: string; blurb: string } | null;
  /** Sibling titles for a child node; child titles for a branch. */
  neighbours: string[];
};

export const loadNodeContext = (db: DB, nodeId: number): NodeContext | null => {
  const node = db.select().from(atlasNodes).where(eq(atlasNodes.id, nodeId)).get();
  if (!node) return null;
  const map = db.select().from(atlasMaps).where(eq(atlasMaps.id, node.mapId)).get();
  if (!map) return null;
  const parent =
    node.parentId === null
      ? null
      : (db.select().from(atlasNodes).where(eq(atlasNodes.id, node.parentId)).get() ?? null);
  const neighbours = db
    .select({ id: atlasNodes.id, title: atlasNodes.title })
    .from(atlasNodes)
    .where(
      node.parentId === null
        ? eq(atlasNodes.parentId, node.id)
        : eq(atlasNodes.parentId, node.parentId),
    )
    .orderBy(asc(atlasNodes.position))
    .all()
    .filter((n) => n.id !== node.id)
    .map((n) => n.title);
  return {
    map: { id: map.id, title: map.title, blurb: map.blurb },
    node: { id: node.id, title: node.title, blurb: node.blurb, kind: node.kind, parentId: node.parentId },
    parent: parent ? { id: parent.id, title: parent.title, blurb: parent.blurb } : null,
    neighbours,
  };
};

export const contextBlock = (ctx: NodeContext): string =>
  [
    `MAP: ${ctx.map.title}${ctx.map.blurb ? ` — ${ctx.map.blurb}` : ""}`,
    ctx.parent ? `BRANCH: ${ctx.parent.title} — ${ctx.parent.blurb}` : null,
    ctx.neighbours.length
      ? `NEIGHBOURS (they already have their own pages — point at them by name, never re-explain them): ${ctx.neighbours.join("; ")}`
      : null,
    `THIS NODE (${ctx.node.kind}): ${ctx.node.title} — ${ctx.node.blurb}`,
  ]
    .filter(Boolean)
    .join("\n");

// --- prompts -------------------------------------------------------------------

const VOICE = `You write for a personal atlas of ideas kept by one curious adult. The bar is a great history-of-ideas book with one spread per school: precise, vivid, concrete, no throat-clearing, no "in this section we will". Write the way a brilliant friend talks, not the way an encyclopedia does.`;

const FORMAT_RULES = `FORMAT RULES (hard):
- Markdown limited to "### " headings, **bold**, and "- " bullets. No italics, no numbered lists, no tables, no block quotes, no # or ## headings.
- No links and no URLs anywhere in the body. Readings go in the "readings" field, never in prose.
- Latin script only: romanize names and terms.
- Name a date or an attribution only when you are sure; otherwise say "around" or leave it out.
- Return JSON only, with no prose around it.`;

const readingsRules = (ask: string) => `READINGS: also propose ${ask}. Each is {"kind": "wikipedia" | "book" | "web", "title": string, "author": string | null, "url": string | null, "why": string}.
- "wikipedia": the exact English Wikipedia article title (url null).
- "book": the exact title and the author's name as printed (url null).
- "web": a full https URL to a serious reference page, for example a Stanford Encyclopedia of Philosophy entry; "title" is the page's own title.
- "why" is one short line on what this reading gives that the page above does not.
They are machine-verified against the real source and anything that does not resolve is silently dropped, so prefer the exact title the source itself uses over a paraphrase.`;

export const buildRungPrompt = (
  level: AtlasRungLevel,
  input: { context: string; onepagerMd?: string | null },
): string => {
  const b = RUNG_BUDGETS[level];
  if (level === "onepager") {
    return `${VOICE}

${input.context}

Write the ONE-PAGER for THIS NODE: ${b.min}–${b.max} words, 2 to 4 "###" headings. Shape it as guidance, not as fixed headings: the live question and who was asking → the core move in plain words → one concrete example, text, or thought experiment → the best objection or what came next → one sentence on where it still bites today.

${readingsRules("2 to 4 readings: at least one Wikipedia article, at most one book, optionally one web entry")}

${FORMAT_RULES}

Return: { "hook": string (one line, under 20 words, the sharpest way in), "body_md": string, "readings": [ ... ] }`;
  }
  if (level === "deepdive") {
    return `${VOICE}

${input.context}

THE ONE-PAGER (already written and read — deepen it, do not repeat it):
${input.onepagerMd ?? "(missing)"}

Write the DEEP DIVE for THIS NODE: ${b.min}–${b.max} words, 4 to 7 "###" headings covering origins, the key figures and texts, the internal debates, influence, and the common misreadings. Do NOT write a further-reading section; it is assembled from your readings field.

${readingsRules("up to 3 further readings beyond the one-pager's (books allowed up to 2)")}

${FORMAT_RULES}

Return: { "hook": string (one line, under 20 words), "body_md": string, "readings": [ ... ] }`;
  }
  return `${VOICE}

${input.context}

SOURCE OF TRUTH (the one-pager; say nothing it does not support):
${input.onepagerMd ?? "(missing)"}

Write the LIKE-I'M-10 version of THIS NODE for a bright ten-year-old: ${b.min}–${b.max} words, no headings, no bullets. Start from one everyday situation they know, use one analogy, define any term in the same sentence you use it, and end with one question they could argue about at dinner. ${NONFICTION_FLOOR}

${FORMAT_RULES}

Return: { "body_md": string }`;
};

export const buildJudgePrompt = (
  level: AtlasRungLevel,
  input: { context: string; bodyMd: string },
): string => `You are an exacting editor checking one page of a personal atlas of ideas before its reader sees it. Judge accuracy, not taste.

${input.context}

THE PAGE (${RUNG_LABELS[level]}):
${input.bodyMd}

Check for: factual errors (dates, attributions, who held which position), anachronism, claims stated with more confidence than the record supports, and filler that says nothing. Style preferences are not grounds for revision.

Return JSON only: { "verdict": "approve" | "revise", "problems": [string], "fixes": [string] }
- "revise" only when a reader would be misled; put each concrete fix in "fixes" (what to change, and to what).
- Otherwise "approve" with empty lists.`;

const repairPrompt = (prompt: string, draft: RungDraft, problems: string[]) => `${prompt}

You already wrote a draft, but an editor flagged problems. Fix ONLY these, keeping everything that works:
${problems.map((p) => `- ${p}`).join("\n")}

YOUR PREVIOUS DRAFT:
${JSON.stringify(draft)}

Return the corrected JSON object only, same shape.`;

const revisePrompt = (prompt: string, draft: RungDraft, fixes: string[]) => `${prompt}

You already wrote the draft below. An independent editor asked for exactly these revisions — apply them, keeping everything else that works:
${fixes.map((f) => `- ${f}`).join("\n")}

YOUR PREVIOUS DRAFT:
${JSON.stringify(draft)}

Return the revised JSON object only, same shape.`;

// --- mechanical checks -----------------------------------------------------------

export const wordCount = (md: string): number =>
  md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*-\s+/gm, "")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w)).length;

const NON_LATIN_RE =
  /[Ͱ-ϿЀ-ӿ֐-׿؀-ۿ぀-ヿ㐀-鿿가-힯]/;

/** Everything the renderer can't show or the product forbids. */
export const validateRungBody = (
  level: AtlasRungLevel,
  body: string,
  opts: { tolerance?: number } = {},
): string[] => {
  const tol = opts.tolerance ?? SOFT_TOLERANCE;
  const budget = RUNG_BUDGETS[level];
  const problems: string[] = [];
  const n = wordCount(body);
  const lo = Math.floor(budget.min * (1 - tol));
  const hi = Math.ceil(budget.max * (1 + tol));
  if (n < lo) problems.push(`too short: ${n} words (aim for ${budget.min}–${budget.max})`);
  if (n > hi) problems.push(`too long: ${n} words (aim for ${budget.min}–${budget.max})`);

  const headings = (body.match(/^###\s+\S/gm) ?? []).length;
  const [hmin, hmax] = budget.headings;
  if (level === "eli10") {
    if (headings > 0 || /^#{1,6}\s/m.test(body)) problems.push("no headings in the like-I'm-10 version");
    if (/^\s*-\s+/m.test(body)) problems.push("no bullets in the like-I'm-10 version");
  } else if (headings < hmin || headings > hmax) {
    problems.push(`${headings} "###" headings (aim for ${hmin}–${hmax})`);
  }
  if (/^#{1,2}\s/m.test(body)) problems.push('only "###" headings are allowed (no # or ##)');
  if (/^\s*\d+[.)]\s/m.test(body)) problems.push('no numbered lists (use "- " bullets or prose)');
  if (/^\s*>/m.test(body)) problems.push("no block quotes");
  if (/^\s*\|.*\|\s*$/m.test(body)) problems.push("no tables");
  if (
    /(^|[^*])\*(?!\*)[^*\n]+?\*(?!\*)/m.test(body) ||
    /(^|\s)_[^_\n]+_(?=\s|[.,;:!?)]|$)/m.test(body)
  ) {
    problems.push("no italics (the renderer has none)");
  }
  if (/\]\(|https?:\/\/|www\./i.test(body)) {
    problems.push("no links or URLs in the body (readings go in the readings field)");
  }
  if (/^###\s*further reading/im.test(body)) {
    problems.push("do not write a Further reading section; it is assembled from the readings field");
  }
  if (NON_LATIN_RE.test(body)) problems.push("Latin script only: romanize names and terms");
  return problems;
};

/** The deep dive's reading list is built in code from verified rows only. */
export const assembleDeepdive = (
  bodyMd: string,
  readings: Array<Pick<VerifiedReading, "title" | "url" | "why">>,
): string => {
  const body = bodyMd.trim();
  if (readings.length === 0) return body;
  const list = readings
    .map((r) => `- [${r.title}](${r.url})${r.why ? ` — ${r.why}` : ""}`)
    .join("\n");
  return `${body}\n\n### Further reading\n${list}`;
};

// --- persistence helpers --------------------------------------------------------

export type RungRow = typeof atlasRungs.$inferSelect;
export type ReadingRow = typeof atlasReadings.$inferSelect;

export const rungFor = (db: DB, nodeId: number, level: AtlasRungLevel): RungRow | null =>
  db
    .select()
    .from(atlasRungs)
    .where(and(eq(atlasRungs.nodeId, nodeId), eq(atlasRungs.level, level)))
    .get() ?? null;

export const rungsFor = (db: DB, nodeId: number): RungRow[] =>
  db.select().from(atlasRungs).where(eq(atlasRungs.nodeId, nodeId)).all();

export const verifiedReadingsFor = (db: DB, nodeId: number): ReadingRow[] =>
  db
    .select()
    .from(atlasReadings)
    .where(and(eq(atlasReadings.nodeId, nodeId), eq(atlasReadings.status, "verified")))
    .orderBy(asc(atlasReadings.position), asc(atlasReadings.id))
    .all();

/** Insert (or reset) the rung row as `drafting` — the status the UI polls. */
export const markRungDrafting = (
  db: DB,
  nodeId: number,
  level: AtlasRungLevel,
  model: string | null = null,
): RungRow => {
  const existing = rungFor(db, nodeId, level);
  if (existing) {
    return db
      .update(atlasRungs)
      .set({ status: "drafting", error: null, startedAt: new Date(), model })
      .where(eq(atlasRungs.id, existing.id))
      .returning()
      .get();
  }
  return db.insert(atlasRungs).values({ nodeId, level, status: "drafting", model }).returning().get();
};

const storeReadings = (
  db: DB,
  nodeId: number,
  proposedBy: "onepager" | "deepdive",
  verified: VerifiedReading[],
  rejected: RejectedReading[],
  startPosition: number,
) => {
  verified.forEach((r, i) => {
    db.insert(atlasReadings)
      .values({
        nodeId,
        kind: r.kind,
        title: r.title,
        author: r.author,
        url: r.url,
        why: r.why,
        status: "verified",
        verifiedVia: r.verifiedVia,
        proposedBy,
        snippet: r.snippet,
        position: startPosition + i,
      })
      .run();
  });
  rejected.forEach((r) => {
    db.insert(atlasReadings)
      .values({
        nodeId,
        kind: r.kind,
        title: r.title,
        author: r.author ?? null,
        url: r.url ?? null,
        why: r.why ?? null,
        status: "rejected",
        rejectReason: r.reason.slice(0, 500),
        proposedBy,
        position: 0,
      })
      .run();
  });
};

// --- the pipeline ------------------------------------------------------------------

export type RungDeps = {
  llm?: AtlasLlm;
  fetchImpl?: FetchLike;
  log?: (msg: string) => void;
  /** Regenerate even when a ready rung exists. */
  force?: boolean;
  /** Editor-judge pass for one-pager/deep dive. Default on; ATLAS_JUDGE=false disables. */
  judge?: boolean;
  verifyOptions?: VerifyOptions;
};

export type EnsureRungResult =
  | { ok: true; rung: RungRow; fresh: boolean }
  | { ok: false; error: string; rung: RungRow | null };

const judgeEnabled = (deps: RungDeps): boolean => deps.judge ?? process.env.ATLAS_JUDGE !== "false";

export const ensureRung = async (
  db: DB,
  nodeId: number,
  level: AtlasRungLevel,
  deps: RungDeps = {},
): Promise<EnsureRungResult> => {
  const log = deps.log ?? console.log;
  const existing = rungFor(db, nodeId, level);
  if (existing?.status === "ready" && !deps.force) return { ok: true, rung: existing, fresh: false };

  // Both other rungs are written from the one-pager, so it comes first.
  let onepagerMd: string | null = null;
  if (level !== "onepager") {
    const base = await ensureRung(db, nodeId, "onepager", { ...deps, force: false });
    if (!base.ok) return { ok: false, error: `one-pager first: ${base.error}`, rung: existing };
    onepagerMd = base.rung.bodyMd;
  }

  const models = atlasModels();
  const row = markRungDrafting(db, nodeId, level, models.writer);
  const fail = (message: string): EnsureRungResult => {
    const failed = db
      .update(atlasRungs)
      .set({ status: "failed", error: message.slice(0, 2000) })
      .where(eq(atlasRungs.id, row.id))
      .returning()
      .get();
    log(`rung ${level} #${row.id} failed: ${message}`);
    return { ok: false, error: message, rung: failed };
  };

  const ctx = loadNodeContext(db, nodeId);
  if (!ctx) return fail(`node #${nodeId} not found`);
  const llm = deps.llm ?? cliLlm;
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));

  try {
    const context = contextBlock(ctx);
    const prompt = buildRungPrompt(level, { context, onepagerMd });
    log(`rung ${level} for "${ctx.node.title}" model=${models.writer}`);
    let draft = llm(prompt, RungDraftSchema, { model: models.writer, label: `${level} draft` });

    const problems = validateRungBody(level, draft.body_md, { tolerance: SOFT_TOLERANCE });
    if (problems.length > 0) {
      log(`draft flagged, one repair pass: ${problems.join("; ")}`);
      const repaired = llm(repairPrompt(prompt, draft, problems), RungDraftSchema, {
        model: models.writer,
        label: `${level} repair`,
      });
      const again = validateRungBody(level, repaired.body_md, { tolerance: HARD_TOLERANCE });
      if (again.length > 0) throw new Error(`craft checks failed after repair: ${again.join("; ")}`);
      draft = repaired;
    }

    let verdict: RungJudge | null = null;
    if (level !== "eli10" && judgeEnabled(deps)) {
      const judged: RungJudge = (() => {
        try {
          return llm(buildJudgePrompt(level, { context, bodyMd: draft.body_md }), RungJudgeSchema, {
            model: models.judge,
            label: `${level} judge`,
          });
        } catch (err) {
          // The judge is a quality gate, not a point of failure.
          log(`judge errored (${err instanceof Error ? err.message : err}) — keeping the draft unjudged`);
          return { verdict: "approve", problems: [], fixes: [] };
        }
      })();
      verdict = judged;
      log(`judge: ${judged.verdict}${judged.problems.length ? ` — ${judged.problems.join("; ")}` : ""}`);
      if (judged.verdict === "revise" && judged.fixes.length > 0) {
        try {
          const revised = llm(revisePrompt(prompt, draft, judged.fixes), RungDraftSchema, {
            model: models.writer,
            label: `${level} revision`,
          });
          const rp = validateRungBody(level, revised.body_md, { tolerance: HARD_TOLERANCE });
          if (rp.length === 0) draft = revised;
          else log(`revision came back broken (${rp.join("; ")}) — keeping first draft`);
        } catch (err) {
          log(`revision failed (${err instanceof Error ? err.message : err}) — keeping first draft`);
        }
      }
    }

    // Readings: verify what's new for this node, store both outcomes.
    const already = verifiedReadingsFor(db, nodeId);
    const knownTitles = new Set(already.map((r) => normalizeTitle(r.title)));
    const knownUrls = new Set(already.map((r) => r.url).filter((u): u is string => !!u));
    const proposals: ReadingProposal[] =
      level === "eli10"
        ? []
        : (draft.readings ?? []).filter(
            (p) => !knownTitles.has(normalizeTitle(p.title)) && !(p.url && knownUrls.has(p.url)),
          );
    const { verified, rejected } = await verifyReadings(proposals, fetchImpl, deps.verifyOptions);
    const fresh = verified.filter((v) => !knownUrls.has(v.url));
    if (level !== "eli10") storeReadings(db, nodeId, level, fresh, rejected, already.length);

    const allVerified = verifiedReadingsFor(db, nodeId).filter(
      (r): r is ReadingRow & { url: string } => typeof r.url === "string" && r.url.length > 0,
    );
    const bodyMd =
      level === "deepdive" ? assembleDeepdive(draft.body_md, allVerified) : draft.body_md.trim();
    const words = wordCount(draft.body_md);
    const ready = db
      .update(atlasRungs)
      .set({
        status: "ready",
        hook: draft.hook?.trim() || null,
        bodyMd,
        wordCount: words,
        model: models.writer,
        judgeVerdict: verdict ? JSON.stringify(verdict) : null,
        error: null,
        readyAt: new Date(),
      })
      .where(eq(atlasRungs.id, row.id))
      .returning()
      .get();
    log(
      `rung ${level} ready: ${words} words, ${fresh.length} new readings verified, ${rejected.length} rejected`,
    );
    return { ok: true, rung: ready, fresh: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
};
