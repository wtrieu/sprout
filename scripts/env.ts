import fs from "node:fs";
import path from "node:path";

/**
 * Scripts run outside Next.js, which is what normally loads .env.local — pull
 * it in on import (`import "./env"` must come before any db/lib import).
 * Real env always wins: launchd plists keep setting production values.
 */
for (const file of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}
