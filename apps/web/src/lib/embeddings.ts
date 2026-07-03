const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";

/** Embed a batch of texts. Returns one Float32Array per input. */
export const embed = async (texts: string[]): Promise<Float32Array[]> => {
  if (texts.length === 0) return [];
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`Ollama embed responded ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings.map((e) => Float32Array.from(e));
};

export const embedOne = async (text: string): Promise<Float32Array> =>
  (await embed([text]))[0];

export const toBuffer = (vec: Float32Array): Buffer =>
  Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);

export const fromBuffer = (buf: Buffer): Float32Array =>
  new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);

export const cosine = (a: Float32Array, b: Float32Array): number => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
};

/**
 * Brute-force top-K over candidate rows. At this corpus scale (thousands of
 * chunks) a full scan is <50ms — no vector index needed.
 */
export const cosineTopK = <T extends { embedding: Buffer | null }>(
  query: Float32Array,
  rows: T[],
  k: number,
): Array<T & { score: number }> =>
  rows
    .filter((r) => r.embedding !== null)
    .map((r) => ({ ...r, score: cosine(query, fromBuffer(r.embedding as Buffer)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

/** Rough chunker: ~1200-char pieces split on paragraph boundaries. */
export const chunkText = (text: string, maxLen = 1200): string[] => {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let current = "";
  for (const p of paras) {
    if (current && current.length + p.length + 2 > maxLen) {
      out.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
    // A single oversized paragraph gets hard-split.
    while (current.length > maxLen * 1.5) {
      out.push(current.slice(0, maxLen));
      current = current.slice(maxLen);
    }
  }
  if (current) out.push(current);
  return out;
};
