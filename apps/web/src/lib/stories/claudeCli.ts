/**
 * Headless `claude -p` runner for the story engine. Runs on the Claude Max
 * subscription: ANTHROPIC_API_KEY is stripped from the child env so the CLI
 * can never fall back to metered API billing, and cwd is a tmpdir so repo
 * CLAUDE.md / loop playbooks stay out of context. Every call pins its model
 * explicitly (per-stage assignment lives in storyModels below) with a loud
 * fallback to opus when a pinned model is unavailable.
 *
 * Node-only (spawnSync) — import from scripts and API routes, never from
 * client components.
 */
import { spawnSync } from "node:child_process";
import os from "node:os";

const CLAUDE_TIMEOUT_MS = 10 * 60 * 1000;

/** Model unavailable / not found / deprecated — the only errors we fall back on. */
const MODEL_ERROR_RE = /model|not_found|invalid[_ ]request|permission|access/i;

export const FALLBACK_MODEL = "claude-opus-5";

/**
 * Per-stage model assignment (env-overridable). Premise generation, book
 * writing, and taste distillation are the highest-leverage tokens in the
 * system → frontier writer model. The editor-judge wants an independent,
 * cheaper perspective.
 */
export const storyModels = () => ({
  writer: process.env.STORY_MODEL_WRITER ?? "claude-fable-5",
  judge: process.env.STORY_MODEL_JUDGE ?? "claude-sonnet-5",
});

const run = (prompt: string, model: string): string => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // Max-subscription OAuth only — never the API
  const bin = process.env.CLAUDE_BIN ?? "claude";
  const args = ["-p", prompt, "--output-format", "json", "--model", model];
  const res = spawnSync(bin, args, {
    cwd: os.tmpdir(),
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

export type CallClaude = (prompt: string, opts: { model: string }) => string;

/** One headless call, model pinned; falls back fable → opus loudly. */
export const callClaude: CallClaude = (prompt, opts) => {
  try {
    return run(prompt, opts.model);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.model !== FALLBACK_MODEL && MODEL_ERROR_RE.test(msg)) {
      console.error(
        `⚠️  model "${opts.model}" unavailable (${msg.slice(0, 200)}) — FALLING BACK to ${FALLBACK_MODEL}`,
      );
      return run(prompt, FALLBACK_MODEL);
    }
    throw err;
  }
};

/** stdout → the model's text: `--output-format json` envelope, or raw text. */
export const extractResultText = (stdout: string): string => {
  try {
    const envelope = JSON.parse(stdout);
    if (envelope && typeof envelope.result === "string") return envelope.result;
  } catch {
    // envelope shape drifted — fall through to raw stdout
  }
  return stdout;
};

/** The model's text → the first balanced JSON object (fences tolerated). */
export const extractJsonBlock = (text: string): unknown => {
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

/** call → text → first JSON object, in one step. */
export const callClaudeForJson = (
  prompt: string,
  opts: { model: string },
  call: CallClaude = callClaude,
): unknown => extractJsonBlock(extractResultText(call(prompt, opts)));
