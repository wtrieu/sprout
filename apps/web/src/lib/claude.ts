import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { callOllamaText, callOllamaJson, extractJson } from "./ollama";

// Anthropic API for the heavy synthesis features (visit prep, story arcs,
// research briefs, evals, corpus audit). Everything falls back to local qwen3
// when no key is configured, so the app stays fully functional offline.

const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-fable-5";
const FALLBACK_MODEL = "claude-opus-4-8";
const MAX_TOKENS = 16000;

export const claudeAvailable = (): boolean => !!process.env.ANTHROPIC_API_KEY;

let _client: Anthropic | null = null;
const client = (): Anthropic => (_client ??= new Anthropic());

type ClaudeOptions = {
  /** Passed through to the Ollama fallback only; Claude 4.7+ rejects temperature. */
  temperature?: number;
  system?: string;
  /** Ollama fallback only: enable qwen3 thinking for reasoning-heavy steps. */
  think?: boolean;
  /** Ollama fallback only: context window for long retrieval-stuffed prompts. */
  numCtx?: number;
};

const ollamaOpts = (opts: ClaudeOptions) => ({
  temperature: opts.temperature,
  think: opts.think,
  numCtx: opts.numCtx,
});

const generate = async (prompt: string, opts: ClaudeOptions): Promise<string> => {
  // Fable's safety classifiers can decline benign-adjacent requests; the
  // server-side fallback transparently re-serves those on Opus.
  const stream = client().beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" },
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: CLAUDE_MODEL === FALLBACK_MODEL ? undefined : [{ model: FALLBACK_MODEL }],
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: "user", content: prompt }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(
      `Claude declined the request${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : ""}`,
    );
  }
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
};

/** Free-text generation on Claude; falls back to local qwen3 without a key. */
export const callClaudeText = async (
  prompt: string,
  opts: ClaudeOptions = {},
): Promise<string> => {
  if (!claudeAvailable()) return callOllamaText(prompt, ollamaOpts(opts));
  return generate(prompt, opts);
};

/**
 * JSON generation validated against a zod schema, with one retry that feeds
 * the validation error back to the model (same pattern as callOllamaJson).
 */
export const callClaudeJson = async <S extends z.ZodTypeAny>(
  prompt: string,
  schema: S,
  opts: ClaudeOptions = {},
): Promise<z.infer<S>> => {
  if (!claudeAvailable()) return callOllamaJson(prompt, schema, ollamaOpts(opts));

  const attempt = async (errorContext?: string) => {
    const fullPrompt = errorContext
      ? `${prompt}\n\nYour previous response failed validation: ${errorContext}\nReturn a corrected JSON object only, no prose.`
      : prompt;
    const raw = await generate(fullPrompt, opts);
    return schema.parse(JSON.parse(extractJson(raw)));
  };

  try {
    return await attempt();
  } catch (firstErr) {
    const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    return attempt(msg);
  }
};
