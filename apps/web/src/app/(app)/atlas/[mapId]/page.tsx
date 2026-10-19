"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type RungStatus = "drafting" | "ready" | "failed" | null;
type NodeRow = {
  id: number;
  parentId: number | null;
  position: number;
  title: string;
  blurb: string;
  kind: string;
  skipped: boolean;
  visitedAt: string | null;
  rungs: { eli10: RungStatus; onepager: RungStatus; deepdive: RungStatus };
};
type MapRow = {
  id: number;
  title: string;
  blurb: string | null;
  status: "drafting" | "ready" | "failed";
  error: string | null;
};

const byPosition = (a: NodeRow, b: NodeRow) => a.position - b.position || a.id - b.id;

const Dot = ({ visited }: { visited: boolean }) => (
  <span
    aria-label={visited ? "visited" : "unvisited"}
    className={`mt-2 inline-block h-2 w-2 shrink-0 rounded-full ${
      visited ? "bg-amber-400" : "bg-neutral-700"
    }`}
  />
);

const rungNote = (n: NodeRow): string | null => {
  const r = n.rungs;
  if (r.eli10 === "drafting" || r.onepager === "drafting" || r.deepdive === "drafting")
    return "drafting…";
  const ready = [r.eli10, r.onepager, r.deepdive].filter((s) => s === "ready").length;
  return ready > 0 ? `${ready}/3 rungs` : null;
};

/** The two-level outline of one map: branches, their children, what's been read. */
export default function AtlasMapPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const [map, setMap] = useState<MapRow | null>(null);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/atlas/maps/${mapId}`);
    if (res.status === 404) {
      setMissing(true);
      return;
    }
    const d = await res.json();
    setMap(d.map ?? null);
    setNodes(d.nodes ?? []);
  }, [mapId]);

  // One-pagers are preloaded as soon as the map exists; the map is
  // "preparing" until every node has one.
  const onepagerReady = nodes.filter((n) => n.rungs.onepager === "ready").length;
  const onepagerDrafting = nodes.some((n) => n.rungs.onepager === "drafting");
  const onepagerMissing = nodes.some((n) => n.rungs.onepager === null);
  const onepagerFailed = nodes.some((n) => n.rungs.onepager === "failed");
  const preparing = map?.status === "ready" && (onepagerMissing || onepagerDrafting);

  const drafting =
    map?.status === "drafting" ||
    preparing ||
    nodes.some((n) => Object.values(n.rungs).some((s) => s === "drafting"));

  useEffect(() => {
    load();
    const t = setInterval(load, drafting ? 5000 : 15000);
    return () => clearInterval(t);
  }, [load, drafting]);

  const preloadRest = async () => {
    setBusy(true);
    await fetch(`/api/atlas/maps/${mapId}/preload`, { method: "POST" });
    setBusy(false);
    load();
  };

  const setSkipped = async (n: NodeRow, skipped: boolean) => {
    setBusy(true);
    await fetch(`/api/atlas/nodes/${n.id}/skip`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skipped }),
    });
    setBusy(false);
    load();
  };

  if (missing) {
    return (
      <p className="text-sm text-neutral-500">
        That map is gone. <Link href="/atlas" className="text-amber-400 hover:underline">Back to the atlas</Link>.
      </p>
    );
  }
  if (!map) return <p className="text-sm text-neutral-600">Loading…</p>;

  const branches = nodes.filter((n) => n.parentId === null).sort(byPosition);
  const childrenOf = (id: number) => nodes.filter((n) => n.parentId === id).sort(byPosition);
  const visited = nodes.filter((n) => n.visitedAt).length;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs text-neutral-500">
          <Link href="/atlas" className="hover:text-neutral-300">Atlas</Link>
          <span className="mx-1.5">›</span>
          <span className="text-neutral-400">{map.title}</span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{map.title}</h1>
        {map.blurb && <p className="mt-1 text-sm text-neutral-400">{map.blurb}</p>}
        {map.status === "ready" && nodes.length > 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            {visited}/{nodes.length} visited · amber dots are places you&apos;ve been
          </p>
        )}
        {preparing && (
          <p className="mt-2 text-xs text-amber-400/80">
            Preparing · {onepagerReady} / {nodes.length} one-pagers
          </p>
        )}
        {map.status === "ready" &&
          nodes.length > 0 &&
          (onepagerFailed || onepagerMissing) &&
          !onepagerDrafting && (
            <button
              disabled={busy}
              onClick={preloadRest}
              className="mt-2 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-amber-500/50 disabled:opacity-50"
            >
              Prepare the rest
            </button>
          )}
      </div>

      {map.status === "drafting" && (
        <div className="rounded-xl border border-amber-500/30 bg-neutral-900 p-5 text-sm text-neutral-300">
          Drafting this map — an outline first, then each branch filled in. Usually a few
          minutes. This page refreshes itself.
        </div>
      )}
      {map.status === "failed" && (
        <div className="rounded-xl border border-red-900/60 bg-neutral-900 p-5 text-sm">
          <p className="text-red-400">The draft failed.</p>
          <p className="mt-1 text-xs text-neutral-500">{map.error}</p>
          <p className="mt-2 text-xs text-neutral-500">
            Remove it from the <Link href="/atlas" className="text-amber-400 hover:underline">atlas</Link> and draft it again.
          </p>
        </div>
      )}

      <section className="space-y-4">
        {branches.map((b) => {
          const kids = childrenOf(b.id);
          return (
            <div
              key={b.id}
              className={`rounded-xl border border-neutral-800 bg-neutral-900 p-5 ${
                b.skipped ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <Dot visited={!!b.visitedAt} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/atlas/${map.id}/${b.id}`}
                      className="font-medium text-neutral-100 hover:text-amber-400"
                    >
                      {b.title}
                    </Link>
                    {b.skipped && (
                      <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                        skipped
                      </span>
                    )}
                    {rungNote(b) && <span className="text-xs text-neutral-500">{rungNote(b)}</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-400">{b.blurb}</p>
                </div>
                <button
                  disabled={busy}
                  onClick={() => setSkipped(b, !b.skipped)}
                  className="shrink-0 text-xs text-neutral-600 hover:text-neutral-300 disabled:opacity-50"
                  title={b.skipped ? "Bring this branch back" : "Skip this branch for now"}
                >
                  {b.skipped ? "unskip" : "skip"}
                </button>
              </div>
              {kids.length > 0 && (
                <ul className="mt-4 space-y-2 border-l border-neutral-800 pl-5">
                  {kids.map((c) => (
                    <li key={c.id} className="flex items-start gap-3">
                      <Dot visited={!!c.visitedAt} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/atlas/${map.id}/${c.id}`}
                            className="text-sm text-neutral-200 hover:text-amber-400"
                          >
                            {c.title}
                          </Link>
                          <span className="text-[10px] uppercase tracking-wide text-neutral-600">
                            {c.kind}
                          </span>
                          {rungNote(c) && (
                            <span className="text-xs text-neutral-500">{rungNote(c)}</span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-500">{c.blurb}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
