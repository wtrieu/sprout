import path from "node:path";
import { describe, expect, it } from "vitest";
import { IMAGES_DIR, resolveImagePath } from "./files";

describe("resolveImagePath", () => {
  it("resolves paths inside IMAGES_DIR", () => {
    expect(resolveImagePath("stories/1/page-1.png")).toBe(path.join(IMAGES_DIR, "stories/1/page-1.png"));
  });

  it.each(["../secret.txt", "stories/../../etc/passwd", "/etc/passwd", ""])("rejects %j", (p) => {
    expect(resolveImagePath(p)).toBeNull();
  });
});
