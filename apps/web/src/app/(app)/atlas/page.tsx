"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FrontierCard } from "@/components/atlas/FrontierCard";
import { CharacterCard, classTitleOf } from "@/components/atlas/CharacterCard";
import {
  AchievementGallery,
  Inventory,
  LoadoutPicker,
  type MeAchievement,
  type MeItem,
} from "@/components/atlas/Collection";
import { parseLoadout, type NextGate } from "@/components/atlas/loadout";
import { useSpriteManifest } from "@/components/atlas/sprite/SpriteCanvas";

type MapRow = {
  id: number;
  title: string;
  blurb: string | null;
  status: "drafting" | "ready" | "failed";
  error: string | null;
  createdAt: string;
  nodeCount: number;
  visitedCount: number;
  onepagerReadyCount: number;
};

type Persona = "cartographer" | "protege";
type PlayerSummary = {
  player: { id: number; name: string; persona: Persona; createdAt: string };
  disciplines: Record<string, { xp: number; level: number }>;
  totalLevel: number;
};
type Me = {
  player: { id: number; name: string; persona: Persona; loadout?: unknown; class?: unknown } | null;
  // PR-D additions, optional until the routes land.
  achievements?: MeAchievement[];
  items?: MeItem[];
  class?: unknown;
  nextGate?: NextGate;
  canCreate: boolean;
  players: PlayerSummary[];
};

const PERSONAS: Record<Persona, { title: string; pitch: string }> = {
  cartographer: {
    title: "The obsessive cartographer",
    pitch:
      "A fussy archivist who has charted this field forever and cannot finish alone. Your finds fill its map; it grumbles at the unexplored regions.",
  },
  protege: {
    title: "The protégé",
    pitch:
      "A naive apprentice you are teaching. Its skill tree is what you've taught it; it misapplies concepts in funny ways and gets things right only when you did.",
  },
};

type Seed = {
  id: number;
  text: string;
  kind: "url" | "title" | "idea";
  url: string | null;
  status: "pending" | "attached" | "new_map" | "dismissed";
  resolution: string | null;
  nodeId: number | null;
  mapId: number | null;
  createdAt: string;
};

const DISCIPLINE_ORDER = ["reasoning", "evidence", "language", "systems", "creativity"];

/**
 * The atlas: your maps, their progress, and the form that drafts a new one.
 * Drafting is minutes of model work in a detached run, so the page polls
 * while anything is drafting.
 */
export default function AtlasPage() {
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [presets, setPresets] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [charName, setCharName] = useState("");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [charError, setCharError] = useState<string | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const manifest = useSpriteManifest();
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [pendingSeeds, setPendingSeeds] = useState(0);
  const [seedText, setSeedText] = useState("");
  const [seedError, setSeedError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ childName: string | null; count: number } | null>(null);

  const load = useCallback(async () => {
    const [d, m, sd, bk] = await Promise.all([
      fetch("/api/atlas/maps").then((r) => r.json()),
      fetch("/api/atlas/me").then((r) => r.json()),
      // Capture and bookmarks are additive; a failed fetch just hides them.
      fetch("/api/atlas/seeds").then((r) => r.json()).catch(() => null),
      fetch("/api/atlas/bookmarks").then((r) => r.json()).catch(() => null),
    ]);
    setSeeds(sd?.seeds ?? []);
    setPendingSeeds(sd?.pendingCount ?? 0);
    setSaved(bk ? { childName: bk.childName ?? null, count: (bk.bookmarks ?? []).length } : null);
    setMaps(d.maps ?? []);
    setPresets(d.presets ?? []);
    setMe(m ?? null);
    setLoaded(true);
  }, []);

  const createCharacter = async () => {
    if (!persona) return;
    setBusy(true);
    setCharError(null);
    const res = await fetch("/api/atlas/players", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: charName.trim(), persona }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setCharError(d?.error ?? "Couldn't create the character.");
      return;
    }
    load();
  };

  const switchPersona = async (to: Persona) => {
    setBusy(true);
    await fetch("/api/atlas/players/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ persona: to }),
    });
    setBusy(false);
    load();
  };

  const consumeItem = async (item: MeItem) => {
    setBusy(true);
    setGameError(null);
    const res = await fetch(`/api/atlas/items/${item.id}/use`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const d = await res?.json().catch(() => null);
      setGameError(d?.error ?? "That didn't work — try again.");
    }
    load();
  };

  const saveLoadout = async (loadout: unknown) => {
    setBusy(true);
    setGameError(null);
    const res = await fetch("/api/atlas/players/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loadout }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const d = await res?.json().catch(() => null);
      setGameError(d?.error ?? "Couldn't save that look.");
    }
    load();
  };

  const drafting = maps.some((m) => m.status === "drafting");

  useEffect(() => {
    load();
    const t = setInterval(load, drafting ? 5000 : 15000);
    return () => clearInterval(t);
  }, [load, drafting]);

  const draft = async (body: { title?: string; brief?: string; preset?: string }) => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/atlas/maps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    const d = await res.json().catch(() => null);
    if (!res.ok) {
      setError(d?.error ?? "Couldn't start the draft.");
      return;
    }
    setTitle("");
    setBrief("");
    load();
  };

  const addSeed = async () => {
    setBusy(true);
    setSeedError(null);
    const res = await fetch("/api/atlas/seeds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: seedText.trim() }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const d = await res?.json().catch(() => null);
      setSeedError(d?.error ?? "Couldn't add that — try again.");
      return;
    }
    setSeedText("");
    load();
  };

  const dismissSeed = async (id: number) => {
    await fetch(`/api/atlas/seeds/${id}`, { method: "DELETE" }).catch(() => null);
    load();
  };

  const remove = async (m: MapRow) => {
    if (!confirm(`Remove the map "${m.title}" and everything in it?`)) return;
    await fetch(`/api/atlas/maps/${m.id}`, { method: "DELETE" });
    load();
  };

  const hasPhilosophy = maps.some((m) => m.title.toLowerCase() === "philosophy");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Atlas</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Your own maps of the fields you&apos;re curious about. Each node has a ladder — like
          I&apos;m 10, a one-pager, a deep dive — and every reading is checked to exist before
          you see it. The atlas remembers where you&apos;ve been.
        </p>
      </div>

      {loaded && saved && (
        <Link
          href="/atlas/bookmarks"
          className="block rounded-xl border border-neutral-800 bg-neutral-900 px-5 py-3 text-sm text-neutral-300 hover:border-amber-500/50"
        >
          🔖 Saved for {saved.childName ?? "the child"} · {saved.count}
        </Link>
      )}

      {loaded && maps.length > 0 && (
        <FrontierCard mapTitles={Object.fromEntries(maps.map((m) => [m.id, m.title]))} />
      )}

      {loaded && me?.canCreate && (
        <div className="space-y-4 rounded-xl border border-amber-500/30 bg-neutral-900 p-5">
          <div>
            <h2 className="text-sm font-medium text-neutral-200">Create your character</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Maps are shared; progress, levels and your companion are yours. Pick a voice —
              you can switch later.
            </p>
          </div>
          <input
            value={charName}
            onChange={(e) => setCharName(e.target.value)}
            minLength={2}
            maxLength={40}
            placeholder="Your name on the map"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(PERSONAS) as Persona[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPersona(p)}
                className={`rounded-lg border p-4 text-left transition ${
                  persona === p
                    ? "border-amber-500/70 bg-amber-500/5"
                    : "border-neutral-800 hover:border-neutral-700"
                }`}
              >
                <p className="text-sm font-medium text-neutral-100">{PERSONAS[p].title}</p>
                <p className="mt-1 text-xs text-neutral-500">{PERSONAS[p].pitch}</p>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={busy || charName.trim().length < 2 || !persona}
              onClick={createCharacter}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
            >
              Begin the expedition
            </button>
            {charError && <p className="text-sm text-red-400">{charError}</p>}
          </div>
        </div>
      )}

      {loaded && me && me.players.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2">
          {me.players.map((s) => {
            const mine = me.player?.id === s.player.id;
            return (
              <div
                key={s.player.id}
                className={`rounded-xl border bg-neutral-900 p-4 ${
                  mine ? "border-amber-500/40" : "border-neutral-800"
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="font-medium text-neutral-100">{s.player.name}</p>
                  <span className="text-xs text-neutral-500">{PERSONAS[s.player.persona].title}</span>
                  <span className="ml-auto text-sm text-amber-400/90" title="sum of the five discipline levels">
                    Total {s.totalLevel}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {DISCIPLINE_ORDER.map((d) => (
                    <span
                      key={d}
                      className="rounded-full border border-neutral-800 px-2 py-0.5 text-[10px] capitalize text-neutral-500"
                      title={`${s.disciplines[d]?.xp ?? 0} XP`}
                    >
                      {d} {s.disciplines[d]?.level ?? 1}
                    </span>
                  ))}
                </div>
                {mine && me.player && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      switchPersona(me.player!.persona === "cartographer" ? "protege" : "cartographer")
                    }
                    className="mt-2 text-xs text-neutral-600 hover:text-neutral-300 disabled:opacity-50"
                  >
                    Switch to {me.player.persona === "cartographer" ? "the protégé" : "the cartographer"}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {loaded && me?.player && (
        <section className="space-y-5 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <CharacterCard
            name={me.player.name}
            loadout={parseLoadout(me.player.loadout)}
            classTitle={classTitleOf(me.player.class ?? me.class)}
            totalLevel={me.players.find((p) => p.player.id === me.player?.id)?.totalLevel ?? 5}
            nextGate={me.nextGate}
          />
          {gameError && <p className="text-sm text-red-400">{gameError}</p>}
          <div>
            <h2 className="mb-2 text-sm font-medium text-neutral-200">Achievements</h2>
            <AchievementGallery achievements={me.achievements ?? []} />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-medium text-neutral-200">Pack</h2>
            <Inventory items={me.items ?? []} busy={busy} onUse={consumeItem} />
          </div>
          {manifest && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-neutral-200">Look</h2>
              <LoadoutPicker
                // Remount when the saved loadout changes so the draft resyncs.
                key={JSON.stringify(me.player.loadout ?? null)}
                manifest={manifest}
                items={me.items ?? []}
                loadout={parseLoadout(me.player.loadout)}
                busy={busy}
                onSave={saveLoadout}
              />
            </div>
          )}
        </section>
      )}

      {loaded && maps.length === 0 && (
        <div className="space-y-3 rounded-xl border border-dashed border-neutral-800 px-5 py-6">
          <p className="text-sm text-neutral-400">
            No maps yet. Start with the one the bookstore book couldn&apos;t do justice to.
          </p>
          <button
            disabled={busy || !presets.includes("philosophy")}
            onClick={() => draft({ preset: "philosophy" })}
            className="rounded-md bg-amber-500 px-5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            ✦ Draft the Philosophy map
          </button>
          <p className="text-xs text-neutral-600">
            About five minutes: an outline, then each branch filled in.
          </p>
        </div>
      )}

      <section className="space-y-3">
        {maps.map((m) => (
          <div key={m.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/atlas/${m.id}`} className="text-lg font-medium hover:text-amber-400">
                  {m.title}
                </Link>
                {m.blurb && <p className="mt-1 text-sm text-neutral-400">{m.blurb}</p>}
              </div>
              <div className="shrink-0 text-right text-xs text-neutral-500">
                {m.status === "ready" && (
                  <span>
                    {m.nodeCount > 0 && (
                      <span className="block">
                        {m.onepagerReadyCount >= m.nodeCount ? (
                          <>ready · {m.nodeCount} pages</>
                        ) : (
                          <span className="text-amber-400/80">
                            preparing · {m.onepagerReadyCount} / {m.nodeCount}
                          </span>
                        )}
                      </span>
                    )}
                    {m.visitedCount}/{m.nodeCount} visited
                  </span>
                )}
                {m.status === "drafting" && (
                  <span className="text-amber-400/80">drafting… (a few minutes)</span>
                )}
                {m.status === "failed" && <span className="text-red-400">draft failed</span>}
              </div>
            </div>
            {m.status === "ready" && m.nodeCount > 0 && (
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${Math.round((m.visitedCount / m.nodeCount) * 100)}%` }}
                />
              </div>
            )}
            {m.status === "failed" && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-red-400/80">{m.error}</p>
                <button
                  onClick={() => remove(m)}
                  className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:border-red-900 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="text-sm font-medium text-neutral-200">Add to Atlas</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addSeed();
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            minLength={2}
            maxLength={500}
            placeholder="a title, a link, or an idea…"
            className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={busy || seedText.trim().length < 2}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
          >
            Add
          </button>
        </form>
        {seedError && <p className="text-sm text-red-400">{seedError}</p>}
        {pendingSeeds > 0 && (
          <p className="text-xs text-amber-400/80">{pendingSeeds} waiting for the next draft</p>
        )}
        {seeds.length > 0 && (
          <ul className="space-y-1.5">
            {seeds.slice(0, 5).map((sd) => (
              <li key={sd.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 truncate text-neutral-300">{sd.text}</span>
                {sd.status === "pending" && (
                  <>
                    <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-500">
                      pending
                    </span>
                    <button
                      onClick={() => dismissSeed(sd.id)}
                      title="Dismiss"
                      className="text-xs text-neutral-600 hover:text-neutral-300"
                    >
                      ✕
                    </button>
                  </>
                )}
                {sd.status === "attached" && (
                  <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] text-amber-400/90">
                    {sd.nodeId && sd.mapId ? (
                      <Link href={`/atlas/${sd.mapId}/${sd.nodeId}`} className="hover:underline">
                        attached
                      </Link>
                    ) : (
                      "attached"
                    )}
                  </span>
                )}
                {sd.status === "new_map" && (
                  <span className="text-xs text-neutral-500">
                    <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[10px]">
                      new map suggested
                    </span>
                    {sd.resolution && <> {sd.resolution}</>}
                  </span>
                )}
                {sd.status === "dismissed" && (
                  <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-600">
                    dismissed
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          draft({ title: title.trim(), brief: brief.trim() || undefined });
        }}
        className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5"
      >
        <h2 className="text-sm font-medium text-neutral-200">Draft a map</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={2}
          maxLength={80}
          placeholder="A field — e.g. The history of mathematics, Music theory, Wine"
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Optional: what you want this map to be good at, anchors it must include, the book or course you're measuring it against."
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy || drafting || title.trim().length < 2}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {drafting ? "A map is drafting…" : "Draft this map"}
          </button>
          {!hasPhilosophy && maps.length > 0 && presets.includes("philosophy") && (
            <button
              type="button"
              disabled={busy || drafting}
              onClick={() => draft({ preset: "philosophy" })}
              className="rounded-md border border-amber-500/40 px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
            >
              ✦ Philosophy preset
            </button>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </form>
    </div>
  );
}
