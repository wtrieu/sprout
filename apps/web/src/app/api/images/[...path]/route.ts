import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const IMAGES_DIR = path.resolve(
  process.cwd(),
  process.env.IMAGES_DIR ?? "../../data/images",
);

export const GET = async (
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) => {
  const { path: parts } = await params;
  const filePath = path.resolve(IMAGES_DIR, ...parts);
  // Path-traversal guard: resolved path must stay inside IMAGES_DIR.
  if (!filePath.startsWith(IMAGES_DIR + path.sep)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!fs.existsSync(filePath) || !filePath.endsWith(".png")) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const buf = fs.readFileSync(filePath);
  return new NextResponse(buf, {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=86400",
    },
  });
};
