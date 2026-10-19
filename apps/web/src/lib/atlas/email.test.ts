import { describe, expect, it } from "vitest";
import { renderMapReadyEmail } from "./email";

const input = {
  map: { id: 1, title: "Philosophy", blurb: "How to live, what is real." },
  branchCount: 12,
  nodeCount: 43,
  readyCount: 43,
  failedCount: 0,
  starts: [
    { nodeId: 5, title: "Thales & the first naturalists", hook: "What if everything is one thing?" },
    { nodeId: 9, title: "Socrates", hook: "Why is being refuted a favor?" },
    { nodeId: 14, title: "Stoicism", hook: null },
  ],
  baseUrl: "https://sprout.example",
};

describe("renderMapReadyEmail", () => {
  it("writes the subject from the map title", () => {
    expect(renderMapReadyEmail(input).subject).toBe("Atlas · Philosophy is ready");
  });

  it("links the three suggested starts and the map, with hooks and counts", () => {
    const { html } = renderMapReadyEmail(input);
    expect(html).toContain('href="https://sprout.example/atlas/1/5"');
    expect(html).toContain('href="https://sprout.example/atlas/1/9"');
    expect(html).toContain('href="https://sprout.example/atlas/1/14"');
    expect(html).toContain('href="https://sprout.example/atlas/1"');
    expect(html).toContain("What if everything is one thing?");
    expect(html).toContain("43 of 43 one-pagers ready across 12 branches");
    expect(html).toContain("max-width:640px");
    expect(html).not.toContain("failed");
  });

  it("says so when some one-pagers failed", () => {
    const { html } = renderMapReadyEmail({ ...input, readyCount: 41, failedCount: 2 });
    expect(html).toContain("41 of 43 one-pagers ready across 12 branches");
    expect(html).toContain("2 failed — regenerate them from the map page");
  });

  it("escapes model-written titles and hooks", () => {
    const { html } = renderMapReadyEmail({
      ...input,
      starts: [{ nodeId: 5, title: "A <b>bold</b> & risky title", hook: '"Quote" <script>' }],
    });
    expect(html).toContain("A &lt;b&gt;bold&lt;/b&gt; &amp; risky title");
    expect(html).toContain("&quot;Quote&quot; &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
