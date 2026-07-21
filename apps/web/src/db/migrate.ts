import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import fs from "node:fs";

const dbUrl = process.env.DATABASE_URL ?? "../../data/sprout.db";
const dbPath = path.isAbsolute(dbUrl) ? dbUrl : path.resolve(process.cwd(), dbUrl);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
// FKs must be OFF while migrations run: table-recreate migrations DROP the old
// table, and with FKs on that cascade-deletes child rows (a PRAGMA inside the
// migrator's transaction is a no-op, so it must be set here, at the connection
// level, before the transaction starts).
sqlite.pragma("foreign_keys = OFF");

const db = drizzle(sqlite);

migrate(db, { migrationsFolder: path.resolve(process.cwd(), "src/db/migrations") });

sqlite.pragma("foreign_keys = ON");
const violations = sqlite.pragma("foreign_key_check") as unknown[];
if (violations.length > 0) {
  console.error("foreign_key_check violations after migration:", violations);
  process.exit(1);
}

console.log(`Migrated database at ${dbPath}`);
sqlite.close();
