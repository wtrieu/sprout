import { z } from "zod";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:14b";

type GenerateOptions = {
  temperature?: number;
  /** Ollama keep_alive — set to 0 to unload the model after the call. */
  keepAlive?: string | number;
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
      // qwen3 is a thinking model; disable thinking for fast structured calls.
      think: false,
      ...(opts.json ? { format: "json" } : {}),
      ...(opts.keepAlive !== undefined ? { keep_alive: opts.keepAlive } : {}),
      options: { temperature: opts.temperature ?? 0.4 },
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

/**
 * JSON generation validated against a zod schema, with one retry that feeds
 * the validation error back to the model (Pulse's proven pattern).
 */
export const callOllamaJson = async <S extends z.ZodTypeAny>(
  prompt: string,
  schema: S,
  opts: GenerateOptions = {},
): Promise<z.infer<S>> => {
  const attempt = async (errorContext?: string) => {
    const fullPrompt = errorContext
      ? `${prompt}\n\nYour previous response failed validation: ${errorContext}\nReturn a corrected JSON object.`
      : prompt;
    const raw = await generate(fullPrompt, { ...opts, json: true });
    return schema.parse(JSON.parse(raw));
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
