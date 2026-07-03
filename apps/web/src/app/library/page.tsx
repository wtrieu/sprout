import Link from "next/link";
import { desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { documents, sources } from "@/db/schema";

export const dynamic = "force-dynamic";

export default function LibraryPage() {
  const docs = db
    .select({
      id: documents.id,
      title: documents.title,
      url: documents.url,
      summary: documents.summary,
      ageMin: documents.ageMinMonths,
      ageMax: documents.ageMaxMonths,
      topics: documents.topics,
      relevance: documents.relevance,
      sourceName: sources.name,
    })
    .from(documents)
    .innerJoin(sources, eq(documents.sourceId, sources.id))
    .where(ne(documents.relevance, "irrelevant"))
    .orderBy(desc(documents.fetchedAt))
    .limit(100)
    .all();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Library</h1>
        <Link href="/sources" className="text-sm text-amber-400 hover:underline">
          Manage sources →
        </Link>
      </div>

      {docs.length === 0 ? (
        <p className="text-neutral-400">
          Nothing here yet — the nightly crawler fills the library, or hit “Crawl
          now” on the Sources page.
        </p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-neutral-100 hover:text-amber-400"
                  >
                    {d.title}
                  </a>
                ) : (
                  <span className="font-medium">{d.title}</span>
                )}
                {d.relevance === "pending" && (
                  <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500">
                    unclassified
                  </span>
                )}
              </div>
              {d.summary && (
                <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{d.summary}</p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-neutral-500">
                <span className="rounded bg-neutral-800 px-1.5 py-0.5">{d.sourceName}</span>
                {d.ageMin !== null && (
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5">
                    {d.ageMin}–{d.ageMax ?? "?"} mo
                  </span>
                )}
                {(d.topics ?? []).map((t) => (
                  <span key={t} className="rounded bg-neutral-800 px-1.5 py-0.5">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
