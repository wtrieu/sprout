/**
 * Atlas's model adapter. Everything Atlas writes goes through the same
 * headless `claude -p` runner the story engine uses (Max subscription, API
 * key stripped, no local-LLM memory lock), plus the one thing that runner
 * lacks and lib/claude.ts has: zod validation with a single repair pass that
 * feeds the issues back. Never falls back to local qwen3 — the owner is the
 * reader here and prose quality is the product.
 *
 * Every pipeline function takes `deps.llm` so tests inject canned JSON.
 */
import type { ZodTypeAny, z } from "zod";
import { callClaude, extractJsonBlock, extractResultText, type CallClaude } from "../stories/claudeCli";

/** Per-stage model assignment (env-overridable), mirroring storyModels(). */
export const atlasModels = () => ({
  writer: process.env.ATLAS_MODEL_WRITER ?? "claude-fable-5",
  judge: process.env.ATLAS_MODEL_JUDGE ?? "claude-sonnet-5",
  // One-pagers are preloaded in bulk: a faster model, and never judged.
  onepager: process.env.ATLAS_MODEL_ONEPAGER ?? "claude-sonnet-5",
  // Eli10s are drafted at map creation and prefetched too: same fast model,
  // never judged (the judge only ever runs for deep dives).
  eli10: process.env.ATLAS_MODEL_ELI10 ?? "claude-sonnet-5",
});

export type AtlasLlm = <S extends ZodTypeAny>(
  prompt: string,
  schema: S,
  opts: { model: string; label?: string },
) => z.infer<S>;

const issueList = (err: z.ZodError): string =>
  err.issues
    .slice(0, 6)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Escape bare control characters (literal newlines, tabs, anything < 0x20)
 * that sit inside JSON string literals — the most common way a long markdown
 * body breaks JSON.parse ("Bad control character in string literal"). Only
 * the span from the first "{" is touched, and only inside strings, so
 * structure is never altered. Deterministic and free: not a repair call.
 */
export const escapeControlCharsInStrings = (text: string): string => {
  const start = text.indexOf("{");
  if (start === -1) return text;
  let out = text.slice(0, start);
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    if (inString && code < 0x20) {
      const esc = ch === "\n" ? "n" : ch === "\r" ? "r" : ch === "\t" ? "t" : `u${code.toString(16).padStart(4, "0")}`;
      // After a lone backslash ("\<LF>") the backslash is already in `out`:
      // emit only the escape letter, or "\<LF>" would become "\\n" and a
      // corrupted escape would be silently accepted as literal text.
      out += (escaped ? "" : "\\") + esc;
      escaped = false;
      continue;
    }
    if (escaped) escaped = false;
    else if (ch === "\\" && inString) escaped = true;
    else if (ch === '"') inString = !inString;
    out += ch;
  }
  return out;
};

/** Model text → JSON, with one free sanitize retry before giving up. */
const parseModelJson = (stdout: string): unknown => {
  const text = extractResultText(stdout);
  try {
    return extractJsonBlock(text);
  } catch (err) {
    const cleaned = escapeControlCharsInStrings(text);
    if (cleaned === text) throw err;
    try {
      return extractJsonBlock(cleaned);
    } catch (err2) {
      // Report the sanitized parse's failure: the control characters are
      // already fixed, so naming them would send the repair call after an
      // error that no longer exists.
      throw err2;
    }
  }
};

/**
 * Build an AtlasLlm over any CallClaude (the real CLI by default).
 *
 * The raw CLI call and the JSON extraction are separate steps on purpose: a
 * spawn/CLI failure throws immediately (a repair call cannot fix a dead
 * binary), while malformed JSON — a common failure with long bodies — feeds
 * the same single repair budget as a zod failure. There is exactly ONE repair
 * call per request, shared between the two paths.
 */
export const makeCliLlm =
  (call: CallClaude = callClaude): AtlasLlm =>
  (prompt, schema, opts) => {
    const label = opts.label ?? "atlas call";
    const callOpts = { model: opts.model };

    type Attempt = { ok: true; data: z.infer<typeof schema> } | { ok: false; reason: string; parse: boolean };
    const attempt = (p: string): Attempt => {
      const stdout = call(p, callOpts); // a throw here is a CLI failure: propagate, no repair
      let raw: unknown;
      try {
        raw = parseModelJson(stdout);
      } catch (err) {
        return { ok: false, reason: errMsg(err), parse: true };
      }
      const parsed = schema.safeParse(raw);
      return parsed.success
        ? { ok: true, data: parsed.data }
        : { ok: false, reason: issueList(parsed.error), parse: false };
    };

    const first = attempt(prompt);
    if (first.ok) return first.data;

    const repairPrompt = first.parse
      ? `${prompt}

Your previous response was not valid JSON: ${first.reason} — return the complete corrected JSON object only, no prose.`
      : `${prompt}

Your previous response failed validation: ${first.reason}
Return a corrected JSON object only, no prose.`;
    const second = attempt(repairPrompt);
    if (second.ok) return second.data;

    const kind = (a: { parse: boolean }) => (a.parse ? "malformed JSON" : "validation");
    throw new Error(
      `${label}: response failed validation twice (${kind(first)}: ${first.reason}; then ${kind(second)}: ${second.reason})`,
    );
  };

export const cliLlm: AtlasLlm = makeCliLlm();
