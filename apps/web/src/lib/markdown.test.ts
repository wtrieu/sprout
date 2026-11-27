import { describe, expect, it } from "vitest";
import { mdToHtml } from "./markdown";

describe("mdToHtml escaping", () => {
  it("escapes raw HTML so it renders as text", () => {
    const out = mdToHtml('hi <script>alert("x")</script> <img src=x onerror=alert(1)>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("escapes an ampersand exactly once", () => {
    expect(mdToHtml("Tom & Jerry")).toBe("<p>Tom &amp; Jerry</p>");
  });
});

describe("mdToHtml links", () => {
  it.each([
    ["javascript:alert%281%29"],
    ["JavaScript:alert%281%29"],
    [" javascript:alert%281%29"],
    ["data:text/html;base64,PHNjcmlwdD4="],
    ["vbscript:msgbox"],
  ])("does not link %s", (href) => {
    const out = mdToHtml(`[click](${href})`);
    expect(out).not.toContain("<a");
    expect(out).toBe("<p>click</p>");
  });

  it.each([
    ["https://example.com/a?b=1&c=2", "https://example.com/a?b=1&amp;c=2"],
    ["http://example.com", "http://example.com"],
    ["mailto:me@example.com", "mailto:me@example.com"],
    ["/atlas/1/2?from=note", "/atlas/1/2?from=note"],
    ["sources", "sources"],
    ["#section", "#section"],
  ])("links %s", (href, expected) => {
    expect(mdToHtml(`[go](${href})`)).toBe(`<p><a href="${expected}">go</a></p>`);
  });

  it("cannot break out of the href attribute", () => {
    const out = mdToHtml('[x](https://e.com/" onmouseover="alert(1))');
    expect(out).not.toMatch(/"\s*onmouseover=/);
  });
});

describe("mdToHtml formatting", () => {
  it("renders headers, bold, bullets", () => {
    expect(mdToHtml("# A\n\n## B\n\n### C")).toBe("<h1>A</h1>\n<h2>B</h2>\n<h3>C</h3>");
    expect(mdToHtml("a **b** c")).toBe("<p>a <strong>b</strong> c</p>");
    expect(mdToHtml("- one\n- two")).toBe("<ul><li>one</li>\n<li>two</li></ul>");
  });

  it("renders a representative rung body", () => {
    const md = [
      '## Why toddlers say "no"',
      "",
      "Around **18–24 months**, kids discover they're separate people — and \"no\" is how they test it.",
      "",
      "- Offer two choices you're fine with (red cup or blue cup?)",
      '- Name the feeling: "You\'re mad the park is over."',
      "- Keep limits short & calm",
      "",
      "Read more on the [Sources page](/sources) or at [AAP](https://www.healthychildren.org/English/ages-stages/toddler/Pages/default.aspx).",
    ].join("\n");
    expect(mdToHtml(md)).toMatchInlineSnapshot(`
      "<h2>Why toddlers say &quot;no&quot;</h2>
      <p>Around <strong>18–24 months</strong>, kids discover they&#39;re separate people — and &quot;no&quot; is how they test it.</p>
      <ul><li>Offer two choices you&#39;re fine with (red cup or blue cup?)</li>
      <li>Name the feeling: &quot;You&#39;re mad the park is over.&quot;</li>
      <li>Keep limits short &amp; calm</li></ul>
      <p>Read more on the <a href="/sources">Sources page</a> or at <a href="https://www.healthychildren.org/English/ages-stages/toddler/Pages/default.aspx">AAP</a>.</p>"
    `);
  });
});
