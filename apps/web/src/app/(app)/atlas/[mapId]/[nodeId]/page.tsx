"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";

type Level = "eli10" | "onepager" | "deepdive";
const LEVELS: Level[] = ["eli10", "onepager", "deepdive"];
const LABEL: Record<Level, string> = {
  eli10: "Like I'm 10",
  onepager: "One-pager",
  deepdive: "Deep dive",
};

type Rung = {
  id: number;
  level: Level;
  status: "drafting" | "ready" | "failed";
  hook: string | null;
  bodyMd: string | null;
  wordCount: number | null;
  error: string | null;
  startedAt: string;
};
type Reading = {
  id: number;
  kind: "wikipedia" | "book" | "web";
  title: string;
  author: string | null;
  url: string | null;
  why: string | null;
  snippet: string | null;
};
type NodeLite = { id: number; title: string; blurb: string; kind: string; skipped: boolean };
type Detail = {
  node: NodeLite & { parentId: number | null; mapId: number; visitedAt: string | null };
  map: { id: number; title: string } | null;
  parent: NodeLite | null;
  siblings: NodeLite[];
  children: NodeLite[];
  rungs: Record<Level, Rung | null>;
  readings: Reading[];
  adjacent: Array<{ nodeId: number; title: string; reason: string }>;
};

const KIND_LABEL: Record<Reading["kind"], string> = {
  wikipedia: "Wikipedia",
  book: "Book",
  web: "Web",
};

const isLevel = (s: string | null): s is Level => !!s && (LEVELS as string[]).includes(s);

function NodePageInner() {
  const { mapId, nodeId } = useParams<{ mapId: string; nodeId: string }>();
  const search = useSearchParams();
  const initialLevel: Level = isLevel(search.get("rung")) ? (search.get("rung") as Level) : "onepager";
  const fromNote = search.get("from") === "note";

  const [data, setData] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [level, setLevel] = useState<Level>(initialLevel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(search.get("action") === "skip");
  const visitedOnce = useRef(false);
  const readLevels = useRef(new Set<string>());

  const load = useCallback(async () => {
    const res = await fetch(`/api/atlas/nodes/${nodeId}`);
    if (res.status === 404) {
      setMissing(true);
      return;
    }
    setData(await res.json());
  }, [nodeId]);

  const drafting = !!data && LEVELS.some((l) => data.rungs[l]?.status === "drafting");

  useEffect(() => {
    load();
    const t = setInterval(load, drafting ? 5000 : 15000);
    return () => clearInterval(t);
  }, [load, drafting]);

  // One visit beacon per page load (strict mode re-runs effects in dev).
  useEffect(() => {
    if (visitedOnce.current) return;
    visitedOnce.current = true;
    fetch(`/api/atlas/nodes/${nodeId}/visit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fromNote ? { from: "note" } : {}),
    });
  }, [nodeId, fromNote]);

  // One read beacon per rung actually shown ready.
  useEffect(() => {
    const rung = data?.rungs[level];
    if (!rung || rung.status !== "ready" || readLevels.current.has(level)) return;
    readLevels.current.add(level);
    fetch(`/api/atlas/nodes/${nodeId}/visit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rung: level }),
    });
  }, [data, level, nodeId]);

  const draftRung = useCallback(
    async (l: Level, force = false) => {
      setBusy(true);
      setError(null);
      const res = await fetch(`/api/atlas/nodes/${nodeId}/rungs/${l}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(force ? { force: true } : {}),
      });
      setBusy(false);
      if (!res.ok && res.status !== 409) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "Couldn't start the draft.");
      }
      load();
    },
    [nodeId, load],
  );

  // The preload writes every one-pager up front; when this node still lacks
  // one (an older map, a failed or reaped row), start it without a click.
  const autoDrafted = useRef(false);
  useEffect(() => {
    if (!data || autoDrafted.current) return;
    const onepager = data.rungs.onepager;
    if (onepager && (onepager.status === "ready" || onepager.status === "drafting")) return;
    autoDrafted.current = true;
    draftRung("onepager");
  }, [data, draftRung]);

  const skipBranch = async (skipped: boolean) => {
    if (!data) return;
    const target = data.node.parentId ?? data.node.id;
    setBusy(true);
    await fetch(`/api/atlas/nodes/${target}/skip`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skipped }),
    });
    setBusy(false);
    setConfirmSkip(false);
    load();
  };

  if (missing) {
    return (
      <p className="text-sm text-neutral-500">
        That node is gone.{" "}
        <Link href={`/atlas/${mapId}`} className="text-amber-400 hover:underline">
          Back to the map
        </Link>
        .
      </p>
    );
  }
  if (!data) return <p className="text-sm text-neutral-600">Loading…</p>;

  const { node, map, parent } = data;
  const rung = data.rungs[level];
  const branchSkipped = parent ? parent.skipped : node.skipped;
  const branchTitle = parent ? parent.title : node.title;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs text-neutral-500">
          <Link href="/atlas" className="hover:text-neutral-300">Atlas</Link>
          <span className="mx-1.5">›</span>
          <Link href={`/atlas/${mapId}`} className="hover:text-neutral-300">
            {map?.title ?? "Map"}
          </Link>
          {parent && (
            <>
              <span className="mx-1.5">›</span>
              <Link href={`/atlas/${mapId}/${parent.id}`} className="hover:text-neutral-300">
                {parent.title}
              </Link>
            </>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{node.title}</h1>
          <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
            {node.kind}
          </span>
          {branchSkipped && (
            <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
              branch skipped
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-400">{node.blurb}</p>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="flex border-b border-neutral-800 text-sm">
          {LEVELS.map((l) => {
            const s = data.rungs[l]?.status ?? null;
            return (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`flex-1 px-3 py-2.5 transition ${
                  level === l
                    ? "border-b-2 border-amber-500 text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {LABEL[l]}
                <span className="ml-1.5 text-xs text-neutral-600">
                  {s === "ready" ? "●" : s === "drafting" ? "…" : s === "failed" ? "!" : "○"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-4 px-5 py-5">
          {rung?.status === "ready" && rung.bodyMd && (
            <>
              {rung.hook && <p className="text-base font-medium text-neutral-100">{rung.hook}</p>}
              <Markdown md={rung.bodyMd} />
              <div className="flex items-center justify-between pt-2 text-xs text-neutral-600">
                <span>{rung.wordCount ? `${rung.wordCount} words` : ""}</span>
                <button
                  disabled={busy}
                  onClick={() => draftRung(level, true)}
                  className="hover:text-neutral-300 disabled:opacity-50"
                >
                  Regenerate
                </button>
              </div>
            </>
          )}
          {rung?.status === "drafting" && (
            <p className="text-sm text-neutral-400">
              {level === "onepager"
                ? "Writing this page… (about a minute). This page refreshes itself."
                : "Drafting… usually about a minute (write, fact-check, verify links). This page refreshes itself."}
            </p>
          )}
          {rung?.status === "failed" && (
            <div className="space-y-2">
              <p className="text-sm text-red-400">The draft failed.</p>
              <p className="text-xs text-neutral-500">{rung.error}</p>
              <button
                disabled={busy}
                onClick={() => draftRung(level, true)}
                className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-amber-500/50 disabled:opacity-50"
              >
                Try again
              </button>
            </div>
          )}
          {!rung && (
            <div className="space-y-2">
              <p className="text-sm text-neutral-400">
                {level === "onepager"
                  ? "Not written yet."
                  : "Not written yet — the one-pager is written first if it doesn't exist."}
              </p>
              <button
                disabled={busy}
                onClick={() => draftRung(level)}
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
              >
                Draft this (~1 min)
              </button>
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>

      {data.readings.length > 0 && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Read next
          </h2>
          <ul className="mt-3 space-y-3">
            {data.readings.map((r) => (
              <li key={r.id} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                    {KIND_LABEL[r.kind]}
                  </span>
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-400 hover:underline"
                    >
                      {r.title}
                    </a>
                  ) : (
                    <span>{r.title}</span>
                  )}
                  {r.author && <span className="text-xs text-neutral-500">{r.author}</span>}
                </div>
                {(r.why || r.snippet) && (
                  <p className="mt-0.5 text-xs text-neutral-500">{r.why ?? r.snippet}</p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-neutral-600">
            Every link here was checked to exist before it was shown.
          </p>
        </section>
      )}

      {data.adjacent.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Next door
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.adjacent.map((a) => (
              <Link
                key={a.nodeId}
                href={`/atlas/${mapId}/${a.nodeId}`}
                className="rounded-full border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-amber-500/50 hover:text-amber-400"
              >
                {a.title}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-wrap items-center gap-3 border-t border-neutral-900 pt-4 text-xs">
        {confirmSkip ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-neutral-400">
              {branchSkipped ? `Bring back the ${branchTitle} branch?` : `Skip the ${branchTitle} branch?`}
            </span>
            <button
              disabled={busy}
              onClick={() => skipBranch(!branchSkipped)}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:border-amber-500/50 disabled:opacity-50"
            >
              {branchSkipped ? "Bring it back" : "Skip it"}
            </button>
            <button onClick={() => setConfirmSkip(false)} className="px-2 py-1.5 text-neutral-500 hover:text-neutral-300">
              Keep
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmSkip(true)} className="text-neutral-600 hover:text-neutral-300">
            {branchSkipped ? "Bring this branch back" : "Skip this branch"}
          </button>
        )}
      </section>
    </div>
  );
}

export default function NodePage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-600">Loading…</p>}>
      <NodePageInner />
    </Suspense>
  );
}
