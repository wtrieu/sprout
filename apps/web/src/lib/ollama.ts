import { z } from "zod";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:14b";
export const OLLAMA_VLM_MODEL = process.env.OLLAMA_VLM_MODEL ?? "qwen2.5vl:7b";

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
  opts: GenerateOptions & { json?: boolean; model?: string; images?: string[] } = {},
): Promise<string> => {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: opts.model ?? OLLAMA_MODEL,
      prompt,
      stream: false,
      think: opts.think ?? false,
      ...(opts.json ? { format: "json" } : {}),
      ...(opts.images ? { images: opts.images } : {}),
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

/**
 * Vision call (VLM, default qwen2.5vl) with JSON output validated against a
 * zod schema — used by the image QC loop. VLMs here don't think, so the JSON
 * grammar path is safe.
 */
export const callOllamaVisionJson = async <S extends z.ZodTypeAny>(
  prompt: string,
  imagesB64: string[],
  schema: S,
  opts: GenerateOptions & { model?: string } = {},
): Promise<z.infer<S>> => {
  const attempt = async (errorContext?: string) => {
    const fullPrompt = errorContext
      ? `${prompt}\n\nYour previous response failed validation: ${errorContext}\nReturn a corrected JSON object.`
      : prompt;
    const raw = await generate(fullPrompt, {
      ...opts,
      model: opts.model ?? OLLAMA_VLM_MODEL,
      images: imagesB64,
      json: true,
      temperature: opts.temperature ?? 0.1,
    });
    return schema.parse(JSON.parse(extractJson(raw)));
  };
  try {
    return await attempt();
  } catch (firstErr) {
    const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    return attempt(msg);
  }
};

/**
 * First available vision model: the configured one, else gemma3:12b (also
 * multimodal) if it happens to be pulled. Null = skip visual QC.
 */
export const resolveVlmModel = async (): Promise<string | null> => {
  for (const model of [OLLAMA_VLM_MODEL, "gemma3:12b"]) {
    if (await ollamaModelAvailable(model)) return model;
  }
  return null;
};

/** True if a model (e.g. the QC VLM) is pulled and available locally. */
export const ollamaModelAvailable = async (model: string): Promise<boolean> => {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return false;
    const data = (await res.json()) as { models: Array<{ name: string }> };
    const want = model.includes(":") ? model : `${model}:latest`;
    return data.models.some((m) => m.name === want || m.name === model);
  } catch {
    return false;
  }
};

/** Ask Ollama to unload a model (frees memory before an image batch). */
export const unloadOllamaModel = async (model: string = OLLAMA_MODEL): Promise<void> => {
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: "", keep_alive: 0 }),
    });
  } catch {
    // Best-effort; the orchestrator also runs `ollama stop`.
  }
};
