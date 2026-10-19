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
import { callClaude, callClaudeForJson, type CallClaude } from "../stories/claudeCli";

/** Per-stage model assignment (env-overridable), mirroring storyModels(). */
export const atlasModels = () => ({
  writer: process.env.ATLAS_MODEL_WRITER ?? "claude-fable-5",
  judge: process.env.ATLAS_MODEL_JUDGE ?? "claude-sonnet-5",
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

/** Build an AtlasLlm over any CallClaude (the real CLI by default). */
export const makeCliLlm =
  (call: CallClaude = callClaude): AtlasLlm =>
  (prompt, schema, opts) => {
    const first = schema.safeParse(callClaudeForJson(prompt, { model: opts.model }, call));
    if (first.success) return first.data;
    const issues = issueList(first.error);
    const repairPrompt = `${prompt}

Your previous response failed validation: ${issues}
Return a corrected JSON object only, no prose.`;
    const second = schema.safeParse(callClaudeForJson(repairPrompt, { model: opts.model }, call));
    if (second.success) return second.data;
    throw new Error(
      `${opts.label ?? "atlas call"}: response failed validation twice (${issues}; then ${issueList(
        second.error,
      )})`,
    );
  };

export const cliLlm: AtlasLlm = makeCliLlm();
