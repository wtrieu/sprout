import { describe, expect, it } from "vitest";
import { z } from "zod";
import { atlasModels, escapeControlCharsInStrings, makeCliLlm } from "./llm";

const Schema = z.object({ body_md: z.string().min(5) });
const GOOD = JSON.stringify({ body_md: "hello world" });
const opts = { model: "m", label: "test call" };

/** A CallClaude that replays canned stdout (or throws an Error) in order. */
const scripted = (replies: Array<string | Error>) => {
  const prompts: string[] = [];
  const call = (prompt: string): string => {
    prompts.push(prompt);
    const next = replies.shift();
    if (next === undefined) throw new Error("no more canned replies");
    if (next instanceof Error) throw next;
    return next;
  };
  return { prompts, call };
};

describe("makeCliLlm", () => {
  it("returns a first response that parses and validates, in one call", () => {
    const { prompts, call } = scripted([GOOD]);
    expect(makeCliLlm(call)("P", Schema, opts)).toEqual({ body_md: "hello world" });
    expect(prompts).toHaveLength(1);
  });

  it("sanitizes a literal newline inside a string with no repair call", () => {
    const bad = '{"body_md": "line one\nline two\tindented"}';
    expect(() => JSON.parse(bad)).toThrow(/control character/i);
    const { prompts, call } = scripted([bad]);
    const out = makeCliLlm(call)("P", Schema, opts);
    expect(out.body_md).toBe("line one\nline two\tindented");
    expect(prompts).toHaveLength(1);
  });

  it("sanitizes inside the claude envelope and around fences/prose", () => {
    const text = 'Here you go:\n```json\n{"body_md": "a\nb c d"}\n```';
    const { prompts, call } = scripted([JSON.stringify({ result: text })]);
    expect(makeCliLlm(call)("P", Schema, opts).body_md).toBe("a\nb c d");
    expect(prompts).toHaveLength(1);
  });

  it("escapes only inside strings and leaves valid JSON alone", () => {
    expect(escapeControlCharsInStrings('{\n"a": "x\ny"\n}')).toBe('{\n"a": "x\\ny"\n}');
    expect(escapeControlCharsInStrings(GOOD)).toBe(GOOD);
    expect(escapeControlCharsInStrings("no json here")).toBe("no json here");
  });

  it("a lone backslash before a control character becomes one escape, not corrupted text", () => {
    // "a\<LF>b": the backslash is already there, so only the letter is added —
    // emitting "\\n" would silently accept a corrupted escape as literal text.
    const bad = '{"body_md": "line a\\\nline b"}';
    expect(escapeControlCharsInStrings(bad)).toBe('{"body_md": "line a\\nline b"}');
    const { prompts, call } = scripted([bad]);
    expect(makeCliLlm(call)("P", Schema, opts).body_md).toBe("line a\nline b");
    expect(prompts).toHaveLength(1);
  });

  it("the repair prompt names the error left after the sanitize, not the fixed one", () => {
    // A control character AND a trailing structural error: the sanitize fixes
    // the first, so the repair prompt must cite the second.
    const bad = '{"body_md": "line a\nline b",}';
    const { prompts, call } = scripted([bad, GOOD]);
    expect(makeCliLlm(call)("P", Schema, opts).body_md).toBe("hello world");
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("was not valid JSON");
    expect(prompts[1]).not.toMatch(/control character/i);
  });

  it("parse failure (unquoted key) then valid: one repair call that names the parse error", () => {
    const { prompts, call } = scripted(['{body_md: "hello world"}', GOOD]);
    expect(makeCliLlm(call)("P", Schema, opts)).toEqual({ body_md: "hello world" });
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toBe("P");
    expect(prompts[1]).toContain("was not valid JSON");
    expect(prompts[1]).toContain("return the complete corrected JSON object only, no prose");
  });

  it("no JSON at all also goes to the repair call", () => {
    const { prompts, call } = scripted(["Sorry, I cannot do that.", GOOD]);
    expect(makeCliLlm(call)("P", Schema, opts).body_md).toBe("hello world");
    expect(prompts).toHaveLength(2);
  });

  it("parse failure twice throws after exactly two calls", () => {
    const { prompts, call } = scripted(['{body_md: "x"}', '{"body_md": "x"']);
    expect(() => makeCliLlm(call)("P", Schema, opts)).toThrow(/test call: response failed validation twice/);
    expect(prompts).toHaveLength(2);
  });

  it("zod failure then valid: the existing validation repair", () => {
    const { prompts, call } = scripted([JSON.stringify({ body_md: "x" }), GOOD]);
    expect(makeCliLlm(call)("P", Schema, opts).body_md).toBe("hello world");
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("failed validation");
  });

  it("zod failure then malformed repair throws cleanly (not a raw SyntaxError)", () => {
    const { prompts, call } = scripted([JSON.stringify({ body_md: "x" }), '{"body_md": oops}']);
    let thrown: unknown;
    try {
      makeCliLlm(call)("P", Schema, opts);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(SyntaxError);
    expect((thrown as Error).message).toContain("test call: response failed validation twice");
    expect((thrown as Error).message).toContain("body_md");
    expect((thrown as Error).message).toContain("malformed JSON");
    expect(prompts).toHaveLength(2);
  });

  it("a spawn-style CLI failure propagates immediately with no repair call", () => {
    const { prompts, call } = scripted([new Error("claude CLI failed to spawn: ENOENT"), GOOD]);
    expect(() => makeCliLlm(call)("P", Schema, opts)).toThrow(/failed to spawn/);
    expect(prompts).toHaveLength(1);
  });

  it("a CLI failure on the repair call propagates as-is", () => {
    const { prompts, call } = scripted(['{body_md: "x"}', new Error("claude CLI exited 1: boom")]);
    expect(() => makeCliLlm(call)("P", Schema, opts)).toThrow(/exited 1/);
    expect(prompts).toHaveLength(2);
  });
});

describe("atlasModels", () => {
  it("puts eli10 on the fast model by default and honours the env override", () => {
    const prev = process.env.ATLAS_MODEL_ELI10;
    delete process.env.ATLAS_MODEL_ELI10;
    expect(atlasModels().eli10).toBe("claude-sonnet-5");
    process.env.ATLAS_MODEL_ELI10 = "other-model";
    expect(atlasModels().eli10).toBe("other-model");
    if (prev === undefined) delete process.env.ATLAS_MODEL_ELI10;
    else process.env.ATLAS_MODEL_ELI10 = prev;
  });
});
