"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { AtlasPersona } from "@/db/schema";
import { CharacterCard, classTitleOf } from "@/components/atlas/CharacterCard";
import {
  MAP_STYLE_ACCENTS,
  accentFor,
  parseLoadout,
  type NextGate,
  type Pending,
} from "@/components/atlas/loadout";
import { ChestBanner, RevealModal } from "@/components/atlas/RevealModal";

type RungStatus = "drafting" | "ready" | "failed" | null;
type NodeRow = {
  id: number;
  parentId: number | null;
  position: number;
  title: string;
  blurb: string;
  kind: string;
  discipline: string | null;
  skipped: boolean;
  /** Marked by the engine; hints at a glint in the fog. */
  rare?: boolean;
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
type Tier = {
  seen: boolean;
  eli10: boolean;
  onepager: boolean;
  deepdive: boolean;
  mastered: boolean;
};
type Progress = {
  tiers: Record<number, Tier>;
  revealed: number[];
  branches: Array<{ nodeId: number; level: number; xp: number; maxXp: number }>;
  field: { total: number; max: number; capeEarned: boolean };
  disciplines: Record<string, { xp: number; level: number }>;
  totalLevel: number;
};

type PlayerInfo = {
  id: number;
  name: string;
  persona: AtlasPersona;
  loadout?: unknown;
  class?: unknown;
};

/** Marks a node the parent saved for the child. */
const Saved = () => (
  <span aria-label="saved for the child" title="Saved for the child" className="text-xs">
    🔖
  </span>
);

/** A rare node shows through the fog as a faint glint. */
const Glint = () => (
  <span aria-label="something rare" title="Something rare glints here" className="text-amber-300/80">
    ✧
  </span>
);

const byPosition = (a: NodeRow, b: NodeRow) => a.position - b.position || a.id - b.id;

const NO_TIER: Tier = { seen: false, eli10: false, onepager: false, deepdive: false, mastered: false };

/** The Balatro stickers: one dot per rung read, a ring once mastered. */
const Stamps = ({ tier }: { tier: Tier }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 ${
      tier.mastered ? "border-amber-400/70" : "border-transparent"
    }`}
    title={
      tier.mastered
        ? "mastered — quiz passed"
        : "stamps: like-I'm-10 · one-pager · deep dive"
    }
  >
    {([tier.eli10, tier.onepager, tier.deepdive] as const).map((on, i) => (
      <span
        key={i}
        className={`inline-block h-1.5 w-1.5 rounded-full ${on ? "bg-amber-400" : "bg-neutral-700"}`}
      />
    ))}
    {tier.mastered && <span className="text-[10px] leading-none text-amber-400">★</span>}
  </span>
);

const Dot = ({ visited }: { visited: boolean }) => (
  <span
    aria-label={visited ? "visited" : "unvisited"}
    className={`mt-2 inline-block h-2 w-2 shrink-0 rounded-full ${
      visited ? "bg-amber-400" : "bg-neutral-700"
    }`}
  />
);

const draftingNote = (n: NodeRow): string | null => {
  const r = n.rungs;
  if (r.eli10 === "drafting" || r.onepager === "drafting" || r.deepdive === "drafting")
    return "drafting…";
  return null;
};

/** The two-level map: a skill tree with fog, as an outline or a collection grid. */
export default function AtlasMapPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const [map, setMap] = useState<MapRow | null>(null);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [quizlessCount, setQuizlessCount] = useState(0);
  const [view, setView] = useState<"outline" | "grid">("outline");
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [nextGate, setNextGate] = useState<NextGate>(null);
  // Snapshot taken when the chest opens, so the modal survives refetches.
  const [reveal, setReveal] = useState<Pending | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch(`/api/atlas/maps/${mapId}`);
    if (res.status === 404) {
      setMissing(true);
      return;
    }
    const d = await res.json();
    setMap(d.map ?? null);
    setNodes(d.nodes ?? []);
    setProgress(d.progress ?? null);
    setGreeting(d.greeting ?? null);
    setQuizlessCount(d.quizlessCount ?? 0);
    // PR-D payload; every field is optional until its route lands.
    setPlayer(d.player ? { ...d.player, class: d.player.class ?? d.class, loadout: d.player.loadout ?? d.loadout } : null);
    setPending(d.pending ?? null);
    setNextGate(d.nextGate ?? null);
    // Optional until the route change lands.
    setBookmarked(new Set<number>((d as { bookmarkedNodeIds?: number[] }).bookmarkedNodeIds ?? []));
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

  const openChest = async () => {
    if (!pending) return;
    setReveal(pending);
    setOfferError(null);
    // Marks the queued loot revealed; the modal already holds its snapshot.
    await fetch("/api/atlas/reveals", { method: "POST" }).catch(() => null);
  };

  const chooseClass = async (offerId: number, classId: string) => {
    setBusy(true);
    setOfferError(null);
    const res = await fetch(`/api/atlas/offers/${offerId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choice: classId }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setOfferError("Couldn't save that choice — try again.");
      return;
    }
    setReveal(null);
    load();
  };

  const closeReveal = () => {
    setReveal(null);
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

  const tierOf = (id: number): Tier => progress?.tiers[id] ?? NO_TIER;
  const revealed = progress ? new Set(progress.revealed) : null;
  // No character yet → no fog, no stamps: today's shared view.
  const isFogged = (n: NodeRow) => !!revealed && n.parentId !== null && !revealed.has(n.id);
  const branchLevel = (id: number) => progress?.branches.find((b) => b.nodeId === id) ?? null;
  const loadout = parseLoadout(player?.loadout);
  const mapAccent = accentFor(MAP_STYLE_ACCENTS, loadout.mapStyle);
  const hasPending = !!pending && (pending.achievements.length > 0 || !!pending.offer);
  const masteredCount = progress
    ? Object.values(progress.tiers).filter((t) => t.mastered).length
    : 0;

  const showPreloadButton =
    map.status === "ready" &&
    nodes.length > 0 &&
    !onepagerDrafting &&
    (onepagerFailed || onepagerMissing || quizlessCount > 0);

  return (
    <div className="space-y-8">
      {hasPending && pending && <ChestBanner pending={pending} onOpen={openChest} />}
      {reveal && player && (
        <RevealModal
          pending={reveal}
          persona={player.persona}
          name={player.name}
          seed={`${map.id}`}
          onClose={closeReveal}
          onChoose={chooseClass}
          busy={busy}
          error={offerError}
        />
      )}
      <div className={mapAccent ? `rounded-xl p-4 ${mapAccent}` : ""}>
        {player && progress && (
          <div className="mb-3">
            <CharacterCard
              name={player.name}
              loadout={loadout}
              classTitle={classTitleOf(player.class)}
              totalLevel={progress.totalLevel}
              nextGate={nextGate}
              scale={2}
            />
          </div>
        )}
        <p className="text-xs text-neutral-500">
          <Link href="/atlas" className="hover:text-neutral-300">Atlas</Link>
          <span className="mx-1.5">›</span>
          <span className="text-neutral-400">{map.title}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold">{map.title}</h1>
          {progress && (
            <span className="text-sm text-amber-400/90" title="sum of branch levels / 99 per branch">
              {progress.field.total} / {progress.field.max}
              {progress.field.capeEarned && " · field cape"}
            </span>
          )}
        </div>
        {map.blurb && <p className="mt-1 text-sm text-neutral-400">{map.blurb}</p>}
        {greeting && <p className="mt-2 text-sm italic text-neutral-500">“{greeting}”</p>}
        {map.status === "ready" && nodes.length > 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            {visited}/{nodes.length} visited
            {progress && <> · {masteredCount} mastered</>}
            {!progress && <> · amber dots are places you&apos;ve been</>}
          </p>
        )}
        {preparing && (
          <p className="mt-2 text-xs text-amber-400/80">
            Preparing · {onepagerReady} / {nodes.length} one-pagers
          </p>
        )}
        {showPreloadButton && (
          <button
            disabled={busy}
            onClick={preloadRest}
            className="mt-2 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-amber-500/50 disabled:opacity-50"
          >
            {onepagerFailed || onepagerMissing
              ? "Prepare the rest"
              : `Prepare quizzes (${quizlessCount} missing)`}
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

      {map.status === "ready" && nodes.length > 0 && (
        <div className="flex items-center gap-1 text-xs">
          {(["outline", "grid"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 capitalize transition ${
                view === v
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {v === "outline" ? "Outline" : "Collection"}
            </button>
          ))}
          {progress && (
            <span className="ml-auto text-neutral-600">
              fog: unexplored places show as ? — everything stays clickable
            </span>
          )}
        </div>
      )}

      {view === "grid" && map.status === "ready" ? (
        <section className="space-y-5">
          {branches.map((b) => {
            const lvl = branchLevel(b.id);
            return (
              <div key={b.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    href={`/atlas/${map.id}/${b.id}`}
                    className="font-medium text-neutral-100 hover:text-amber-400"
                  >
                    {b.title}
                  </Link>
                  {lvl && (
                    <span className="text-xs text-amber-400/90" title={`${lvl.xp}/${lvl.maxXp} XP`}>
                      Lv {lvl.level}
                    </span>
                  )}
                  {b.skipped && <span className="text-xs text-neutral-600">skipped</span>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {[b, ...childrenOf(b.id)].map((n) => {
                    const fog = isFogged(n);
                    const t = tierOf(n.id);
                    return (
                      <Link
                        key={n.id}
                        href={`/atlas/${map.id}/${n.id}`}
                        className={`rounded-lg border p-3 transition hover:border-amber-500/50 ${
                          t.mastered
                            ? "border-amber-400/60 bg-amber-500/5"
                            : "border-neutral-800 bg-neutral-950"
                        } ${n.skipped || b.skipped ? "opacity-60" : ""}`}
                      >
                        <div className="truncate text-sm text-neutral-200">
                          {fog ? (
                            <span className="text-neutral-600">
                              ? {n.rare && <Glint />}
                            </span>
                          ) : (
                            n.title
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          {progress ? <Stamps tier={t} /> : <span />}
                          {!fog && (
                            <span className="text-[10px] uppercase tracking-wide text-neutral-700">
                              {n.parentId === null ? "branch" : n.kind}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="space-y-4">
          {branches.map((b) => {
            const kids = childrenOf(b.id);
            const lvl = branchLevel(b.id);
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
                      {bookmarked.has(b.id) && <Saved />}
                      {lvl && (
                        <span
                          className="text-xs text-amber-400/90"
                          title={`${lvl.xp}/${lvl.maxXp} XP — levels never drop`}
                        >
                          Lv {lvl.level}
                        </span>
                      )}
                      {progress && <Stamps tier={tierOf(b.id)} />}
                      {b.skipped && (
                        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                          skipped
                        </span>
                      )}
                      {draftingNote(b) && (
                        <span className="text-xs text-neutral-500">{draftingNote(b)}</span>
                      )}
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
                    {kids.map((c) => {
                      const fog = isFogged(c);
                      return (
                        <li key={c.id} className="flex items-start gap-3">
                          <Dot visited={!!c.visitedAt} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/atlas/${map.id}/${c.id}`}
                                className={`text-sm hover:text-amber-400 ${
                                  fog ? "text-neutral-600" : "text-neutral-200"
                                }`}
                                title={fog ? "Unexplored — open it to find out" : undefined}
                              >
                                {fog ? "? — somewhere unexplored" : c.title}
                              </Link>
                              {bookmarked.has(c.id) && <Saved />}
                              {fog && c.rare && <Glint />}
                              {!fog && (
                                <span className="text-[10px] uppercase tracking-wide text-neutral-600">
                                  {c.kind}
                                </span>
                              )}
                              {progress && !fog && <Stamps tier={tierOf(c.id)} />}
                              {draftingNote(c) && (
                                <span className="text-xs text-neutral-500">{draftingNote(c)}</span>
                              )}
                            </div>
                            {!fog && <p className="text-xs text-neutral-500">{c.blurb}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
