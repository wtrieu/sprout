"use client";

import { useCallback, useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";

type Citation = { docId: number; title: string; url: string | null; snippet: string };
type Brief = {
  id: number;
  topic: string;
  ageMonths: number;
  contentMd: string;
  citations: Citation[];
  createdAt: string;
};

export default function ResearchPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/research");
    const data = await res.json();
    setBriefs(data.briefs ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: topic.trim() }),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setTopic("");
    setOpenId(data.brief.id);
    load();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Research briefs</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Deep dives on a single topic — the library corpus plus a live PubMed
          sweep, synthesized with citations. Slower than Ask, but thorough.
        </p>
      </div>

      <form onSubmit={generate} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          required
          minLength={5}
          placeholder="e.g. sleep regressions around 18 months — what's normal and what helps"
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || topic.trim().length < 5}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {busy ? "Researching… (a few minutes)" : "Research this"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </form>

      <div className="space-y-3">
        {briefs.map((b) => (
          <div key={b.id} className="rounded-xl border border-neutral-800 bg-neutral-900">
            <button
              onClick={() => setOpenId(openId === b.id ? null : b.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="font-medium">
                {b.topic}
                <span className="ml-2 text-xs font-normal text-neutral-500">
                  at {b.ageMonths}mo · {new Date(b.createdAt).toLocaleDateString()}
                </span>
              </span>
              <span className="text-sm text-neutral-500">{openId === b.id ? "▾" : "▸"}</span>
            </button>
            {openId === b.id && (
              <div className="space-y-4 border-t border-neutral-800 px-4 py-4">
                <Markdown md={b.contentMd} />
                <div className="border-t border-neutral-800 pt-3">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Sources
                  </h3>
                  <ol className="mt-2 space-y-1 text-xs text-neutral-400">
                    {b.citations.map((c, i) => (
                      <li key={i}>
                        [{i + 1}]{" "}
                        {c.url ? (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-amber-400/80 hover:underline"
                          >
                            {c.title}
                          </a>
                        ) : (
                          c.title
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </div>
        ))}
        {briefs.length === 0 && (
          <p className="text-sm text-neutral-600">No briefs yet — research a topic above.</p>
        )}
      </div>
    </div>
  );
}
