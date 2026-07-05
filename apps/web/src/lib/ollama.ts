import { z } from "zod";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:14b";

type GenerateOptions = {
  temperature?: number;
  /** Ollama keep_alive — set to 0 to unload the model after the call. */
  keepAlive?: string | number;
  /**
   * Enable qwen3's thinking mode for steps that need reasoning (judging,
   * planning). Slower but measurably better on small models; off by default
   * for fast structured calls.
   */
  think?: boolean;
  /**
   * Context window. Ollama's default (4096) SILENTLY truncates long RAG
   * prompts from the front — set explicitly for anything stuffed with
   * retrieved chunks. Costs KV-cache memory, so keep it honest.
   */
  numCtx?: number;
};

const generate = async (
  prompt: string,
  opts: GenerateOptions & { json?: boolean } = {},
): Promise<string> => {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      think: opts.think ?? false,
      ...(opts.json ? { format: "json" } : {}),
      ...(opts.keepAlive !== undefined ? { keep_alive: opts.keepAlive } : {}),
      options: {
        temperature: opts.temperature ?? 0.4,
        ...(opts.numCtx ? { num_ctx: opts.numCtx } : {}),
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama responded ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { response: string };
  return data.response;
};

/** Free-text generation (RAG answers, digest prose). */
export const callOllamaText = async (
  prompt: string,
  opts: GenerateOptions = {},
): Promise<string> => generate(prompt, opts);

/** Model output sometimes arrives fenced or with prose; cut to the outermost JSON value. */
export const extractJson = (raw: string): string => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.search(/[{[]/);
  return start === -1 ? body : body.slice(start);
};

/**
 * JSON generation validated against a zod schema, with one retry that feeds
 * the validation error back to the model (Pulse's proven pattern).
 *
 * With think enabled we CANNOT use Ollama's JSON grammar — qwen3 + think +
 * format:"json" instantly returns "{}" (the grammar suppresses the thinking
 * pass). Instead: think freely, demand bare JSON, extract it from the text.
 */
export const callOllamaJson = async <S extends z.ZodTypeAny>(
  prompt: string,
  schema: S,
  opts: GenerateOptions = {},
): Promise<z.infer<S>> => {
  const attempt = async (errorContext?: string) => {
    let fullPrompt = errorContext
      ? `${prompt}\n\nYour previous response failed validation: ${errorContext}\nReturn a corrected JSON object.`
      : prompt;
    if (opts.think) {
      fullPrompt += "\n\nRespond with ONLY the JSON object — no prose before or after it.";
    }
    const raw = await generate(fullPrompt, { ...opts, json: !opts.think });
    return schema.parse(JSON.parse(extractJson(raw)));
  };

  try {
    return await attempt();
  } catch (firstErr) {
    const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    return attempt(msg);
  }
};

/** Ask Ollama to unload the chat model (frees ~9GB before an image batch). */
export const unloadOllamaModel = async (): Promise<void> => {
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt: "", keep_alive: 0 }),
    });
  } catch {
    // Best-effort; the orchestrator also runs `ollama stop`.
  }
};
