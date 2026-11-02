import { describe, expect, it } from "vitest";
import { frontierLinks, renderFrontierEmail, renderMapReadyEmail } from "./email";

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

const note = {
  childName: "Kid",
  map: { id: 1, title: "Philosophy" },
  branch: { id: 2, title: "The Hellenistic schools" },
  node: { id: 7, title: "Stoicism" },
  rung: {
    hook: "What if you only control your judgments?",
    bodyMd: "### The question\nWhat can we control?\n\n[[visual:diagram-one]]\n\n### The move\n- **Judge** less",
  },
  readings: [
    { title: "Stoicism", url: "https://en.wikipedia.org/wiki/Stoicism", why: "the overview" },
    { title: "Meditations", url: "https://openlibrary.org/works/OL1W", author: "Marcus Aurelius" },
  ],
  links: frontierLinks("https://sprout.example/", 1, 7),
  progress: { visited: 3, total: 40 },
};

describe("frontierLinks", () => {
  it("builds the three GET links off the base url", () => {
    expect(frontierLinks("https://sprout.example/", 1, 7)).toEqual({
      open: "https://sprout.example/atlas/1/7?from=note",
      deeper: "https://sprout.example/atlas/1/7?rung=deepdive&from=note",
      skip: "https://sprout.example/atlas/1/7?action=skip&from=note",
    });
  });
});

describe("renderFrontierEmail", () => {
  it("writes the subject, eyebrow, h1, bold hook and the footer count", () => {
    const { subject, html } = renderFrontierEmail(note);
    expect(subject).toBe("Atlas · Stoicism");
    expect(html).toContain("This week in Atlas · Philosophy › The Hellenistic schools");
    expect(html).toContain("<h1");
    expect(html).toContain("<strong>What if you only control your judgments?</strong>");
    expect(html).toContain("3/40 visited");
    expect(html).toContain("max-width:640px");
  });

  it("strips visual markers from the body and renders the markdown subset", () => {
    const { html } = renderFrontierEmail(note);
    expect(html).not.toContain("[[visual");
    expect(html).toContain("<h3>The question</h3>");
    expect(html).toContain("<strong>Judge</strong>");
  });

  it("links Open, Go deeper and Skip, and has no Save link until PR3", () => {
    const { html } = renderFrontierEmail(note);
    expect(html).toContain('href="https://sprout.example/atlas/1/7?from=note"');
    expect(html).toContain('href="https://sprout.example/atlas/1/7?rung=deepdive&amp;from=note"');
    expect(html).toContain('href="https://sprout.example/atlas/1/7?action=skip&amp;from=note"');
    expect(html).not.toContain("action=save");
    expect(html).not.toContain("Kid");
  });

  it("drops Go deeper when the deep dive is not ready", () => {
    const { html } = renderFrontierEmail({ ...note, links: { ...note.links, deeper: null } });
    expect(html).not.toContain("Go deeper");
    expect(html).toContain("Skip this branch");
  });

  it("lists Read next from the given readings only, skipping url-less ones", () => {
    const { html } = renderFrontierEmail({
      ...note,
      readings: [...note.readings, { title: "No link", url: null }],
    });
    expect(html).toContain("Read next");
    expect(html).toContain('href="https://en.wikipedia.org/wiki/Stoicism"');
    expect(html).toContain("Marcus Aurelius");
    expect(html).not.toContain("No link");
    expect(renderFrontierEmail({ ...note, readings: [] }).html).not.toContain("Read next");
  });

  it("omits the branch from the eyebrow for a branch node, and escapes titles", () => {
    const { html } = renderFrontierEmail({
      ...note,
      branch: null,
      node: { id: 7, title: "A <b>risky</b> & title" },
    });
    expect(html).toContain("This week in Atlas · Philosophy</p>");
    expect(html).toContain("A &lt;b&gt;risky&lt;/b&gt; &amp; title");
  });
});
