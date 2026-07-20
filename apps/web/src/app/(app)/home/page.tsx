import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { children } from "@/db/schema";
import { ageInMonths, formatAge } from "@/lib/age";

export const dynamic = "force-dynamic";

export default function Home() {
  const child = db.select().from(children).limit(1).get();

  if (!child) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Welcome to Sprout</h1>
        <p className="text-neutral-400">
          Set up your child&apos;s profile to unlock age-aware answers, stories and
          activities.
        </p>
        <Link
          href="/profile"
          className="inline-block rounded-md bg-amber-500 px-4 py-2 font-medium text-neutral-950 hover:bg-amber-400"
        >
          Set up profile
        </Link>
      </div>
    );
  }

  const months = ageInMonths(child.dob);

  // Nearest milestone bucket at or below current age.
  const bucket = db.get<{ age: number } | undefined>(
    sql`SELECT MAX(age_months) as age FROM milestones WHERE age_months <= ${months}`,
  );
  const currentMilestones = bucket?.age
    ? db.all<{ domain: string; description: string }>(
        sql`SELECT domain, description FROM milestones WHERE age_months = ${bucket.age} ORDER BY domain`,
      )
    : [];

  const docCount = db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM documents WHERE relevance != 'irrelevant'`);
  const storyCount = db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM stories WHERE status = 'ready'`);
  const pendingSuggestions = db.get<{ n: number }>(
    sql`SELECT COUNT(*) as n FROM source_suggestions WHERE status = 'pending'`,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h1 className="text-2xl font-semibold">
          {child.name} <span className="text-neutral-500">·</span>{" "}
          <span className="text-amber-400">{formatAge(months)}</span>
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Library: {docCount?.n ?? 0} documents · Stories ready: {storyCount?.n ?? 0}
          {(pendingSuggestions?.n ?? 0) > 0 && (
            <>
              {" "}
              ·{" "}
              <Link href="/sources" className="text-amber-400 hover:underline">
                {pendingSuggestions!.n} source suggestion{pendingSuggestions!.n === 1 ? "" : "s"} to review
              </Link>
            </>
          )}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/chat", label: "Ask a question", desc: "Cited answers for this age" },
          { href: "/stories", label: "Bedtime story", desc: "Generate & read" },
          { href: "/activities", label: "Activities", desc: "This week's ideas" },
          { href: "/growth", label: "Growth check", desc: "WHO percentiles" },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-amber-500/50"
          >
            <div className="font-medium">{c.label}</div>
            <div className="mt-1 text-xs text-neutral-500">{c.desc}</div>
          </Link>
        ))}
      </section>

      {currentMilestones.length > 0 && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="font-medium">
            Milestones — most children can do these by {formatAge(bucket!.age!)}
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            CDC &ldquo;Learn the Signs. Act Early.&rdquo; · not a diagnostic tool
          </p>
          <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {currentMilestones.map((m, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                  {m.domain.replace("_", " ")}
                </span>
                <span className="text-neutral-300">{m.description}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
