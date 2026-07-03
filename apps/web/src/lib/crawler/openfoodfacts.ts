import type { CrawlAdapter, FetchedDoc } from "./types";

/** OpenFoodFacts category search (open license). Off by default — noisy. */
export const openfoodfactsAdapter: CrawlAdapter = async (source) => {
  const categories = String(source.config.categories ?? "baby-foods");
  const pageSize = Number(source.config.pageSize ?? 50);

  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/search?categories_tags=${encodeURIComponent(categories)}&fields=code,product_name,nutriscore_grade,allergens_tags,brands&page_size=${pageSize}`,
    { headers: { "user-agent": "sprout-home-server/1.0 (personal use)" } },
  );
  if (!res.ok) throw new Error(`openfoodfacts ${res.status}`);
  const data = (await res.json()) as {
    products: Array<{
      code: string;
      product_name?: string;
      nutriscore_grade?: string;
      allergens_tags?: string[];
      brands?: string;
    }>;
  };

  const docs: FetchedDoc[] = data.products
    .filter((p) => p.product_name)
    .map((p) => ({
      externalId: `off-${p.code}`,
      url: `https://world.openfoodfacts.org/product/${p.code}`,
      title: `${p.product_name}${p.brands ? ` (${p.brands})` : ""}`,
      content: [
        `Product: ${p.product_name}`,
        p.brands ? `Brand: ${p.brands}` : null,
        p.nutriscore_grade ? `Nutri-Score: ${p.nutriscore_grade.toUpperCase()}` : null,
        p.allergens_tags?.length
          ? `Allergens: ${p.allergens_tags.map((a) => a.replace(/^en:/, "")).join(", ")}`
          : "Allergens: none listed",
      ]
        .filter(Boolean)
        .join("\n"),
    }));

  return { docs, suggestions: [] };
};
