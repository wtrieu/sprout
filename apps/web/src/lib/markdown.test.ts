import { describe, expect, it } from "vitest";
import { mdToHtml } from "./markdown";

describe("mdToHtml", () => {
  it("renders basic markdown (headings, bold, lists, links)", () => {
    expect(mdToHtml("# Title")).toContain("<h1>Title</h1>");
    expect(mdToHtml("**bold**")).toContain("<strong>bold</strong>");
    expect(mdToHtml("- one\n- two")).toContain("<ul>");
    expect(mdToHtml("[docs](https://example.com)")).toContain(
      '<a href="https://example.com">docs</a>',
    );
  });

  it("escapes raw HTML so it cannot execute as markup", () => {
    const out = mdToHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("neutralises inline <script> tags", () => {
    const out = mdToHtml("hello <script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("drops javascript: links, keeping only the text", () => {
    const out = mdToHtml("[click](javascript:alert(1))");
    expect(out).not.toContain("href");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("click");
  });

  it("drops data: links", () => {
    const out = mdToHtml("[x](data:text/html,<script>alert(1)</script>)");
    expect(out).not.toContain("<a ");
    expect(out).not.toContain("data:");
  });

  it("still allows http, https, mailto, relative, and anchor links", () => {
    expect(mdToHtml("[a](http://example.com)")).toContain(
      '<a href="http://example.com">',
    );
    expect(mdToHtml("[a](mailto:x@example.com)")).toContain(
      '<a href="mailto:x@example.com">',
    );
    expect(mdToHtml("[a](/library)")).toContain('<a href="/library">');
    expect(mdToHtml("[a](#section)")).toContain('<a href="#section">');
  });
});
