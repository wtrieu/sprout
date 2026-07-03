/**
 * Seed the crawlable source registry. Idempotent (slug unique).
 * Sources marked enabled:false need verification or config before first crawl
 * — flip them on from the /sources UI.
 */
import { db } from "../apps/web/src/db/client";
import { sources } from "../apps/web/src/db/schema";

type SourceSeed = typeof sources.$inferInsert;

const rows: SourceSeed[] = [
  {
    slug: "pubmed-toddler-nutrition",
    name: "PubMed — toddler nutrition & feeding",
    kind: "pubmed",
    config: {
      query:
        '("infant nutrition"[MeSH] OR "toddler feeding" OR "complementary feeding") AND (review[pt] OR guideline[pt])',
      retmax: 20,
    },
    license: "public domain (abstracts)",
    fetchPolicy: "full_text",
    enabled: true,
  },
  {
    slug: "pubmed-toddler-development",
    name: "PubMed — early childhood development & sleep",
    kind: "pubmed",
    config: {
      query:
        '("child development"[MeSH] OR "infant sleep" OR "toddler sleep" OR "developmental milestones") AND (review[pt] OR guideline[pt])',
      retmax: 20,
    },
    license: "public domain (abstracts)",
    fetchPolicy: "full_text",
    enabled: true,
  },
  {
    slug: "medlineplus-toddler",
    name: "MedlinePlus — toddler health topics",
    kind: "medlineplus",
    config: {
      topics: ["toddlerhealth", "toddlerdevelopment", "toddlernutrition", "childsafety"],
    },
    license: "public domain (NLM)",
    fetchPolicy: "full_text",
    enabled: true,
  },
  {
    slug: "healthychildren-rss",
    name: "HealthyChildren.org (AAP) — ages & stages",
    kind: "rss",
    config: {
      // Verify the live feed URL before enabling (AAP reorganizes periodically).
      feedUrl: "https://www.healthychildren.org/SiteCollectionDocuments/RSS/AapNewsFeed.xml",
    },
    license: "AAP copyright — summary + link only, no republication",
    fetchPolicy: "summary_link_only",
    enabled: false,
  },
  {
    slug: "openfoodfacts-toddler",
    name: "OpenFoodFacts — baby/toddler foods",
    kind: "openfoodfacts",
    config: { categories: "baby-foods", pageSize: 50 },
    license: "ODbL / CC0",
    fetchPolicy: "full_text",
    enabled: false, // nice-to-have; noisy — enable when wanted
  },
];

for (const row of rows) {
  db.insert(sources).values(row).onConflictDoNothing().run();
}
console.log(`seed-sources done (${rows.length} sources ensured)`);
