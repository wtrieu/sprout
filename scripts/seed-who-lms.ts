/**
 * Download WHO Child Growth Standards LMS tables from the official WHO
 * `anthro` R-package repository (public domain) and load into growth_lms.
 *
 * File format: TSV with header `sex  age|length  l  m  s` (sex 1=male 2=female;
 * age in days for *anthro age tables, length/height in cm for wfl/wfh).
 */
import { sql } from "drizzle-orm";
import { db } from "../apps/web/src/db/client";
import { growthLms } from "../apps/web/src/db/schema";

const BASE =
  "https://raw.githubusercontent.com/WorldHealthOrganization/anthro/master/data-raw/growthstandards";

const FILES: Array<{ file: string; measure: "weight_age" | "length_age" | "hc_age" | "weight_length" }> = [
  { file: "weianthro.txt", measure: "weight_age" },
  { file: "lenanthro.txt", measure: "length_age" },
  { file: "hcanthro.txt", measure: "hc_age" },
  { file: "wflanthro.txt", measure: "weight_length" },
];

const main = async () => {
  for (const { file, measure } of FILES) {
    const existing = db.get<{ n: number }>(
      sql`SELECT COUNT(*) as n FROM growth_lms WHERE measure = ${measure}`,
    );
    if (existing && existing.n > 0) {
      console.log(`${measure}: already seeded (${existing.n} rows), skipping`);
      continue;
    }

    const res = await fetch(`${BASE}/${file}`);
    if (!res.ok) throw new Error(`WHO fetch failed for ${file}: ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split("\n");
    const header = lines[0].split("\t").map((h) => h.trim().toLowerCase());
    const xCol = header.findIndex((h) => h === "age" || h === "length" || h === "height");
    const sexCol = header.indexOf("sex");
    const lCol = header.indexOf("l");
    const mCol = header.indexOf("m");
    const sCol = header.indexOf("s");
    if ([xCol, sexCol, lCol, mCol, sCol].includes(-1)) {
      throw new Error(`${file}: unexpected header ${header.join(",")}`);
    }

    const rows = lines.slice(1).map((line) => {
      const cols = line.split("\t");
      return {
        sex: (cols[sexCol].trim() === "1" ? "male" : "female") as "male" | "female",
        measure,
        x: Number(cols[xCol]),
        l: Number(cols[lCol]),
        m: Number(cols[mCol]),
        s: Number(cols[sCol]),
      };
    });

    for (let i = 0; i < rows.length; i += 500) {
      db.insert(growthLms).values(rows.slice(i, i + 500)).run();
    }
    console.log(`${measure}: ${rows.length} rows from ${file}`);
  }
  console.log("seed-who-lms done");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
