"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Pick = {
  id: number;
  weekStart: string;
  opened: boolean;
  node: { id: number; title: string; hook: string | null; mapId: number; branchTitle: string | null };
};

/**
 * This week's frontier note: the one unvisited node the weekly job picked.
 * The Send button is for the test fortnight (spawns this week's note by hand).
 */
export function FrontierCard({ mapTitles }: { mapTitles: Record<number, string> }) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/atlas/frontier")
      .then((r) => r.json())
      .catch(() => null);
    setPick(d?.pick ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/atlas/frontier/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => null);
    setBusy(false);
    const d = await res?.json().catch(() => null);
    if (!res?.ok) {
      setMsg(d?.error ?? "Couldn't send this week's note.");
      return;
    }
    // 200 { started: false, reason } means this week already has its note.
    setMsg(d?.started === false ? (d?.reason ?? "Already delivered.") : "On its way — it drafts for a few minutes.");
    load();
  };

  const sendButton = (
    <button
      disabled={busy}
      onClick={send}
      className="text-xs text-neutral-600 hover:text-neutral-300 disabled:opacity-50"
    >
      Send this week&apos;s note
    </button>
  );

  if (!pick) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-neutral-800 px-5 py-3">
        <p className="text-sm text-neutral-500">No note this week yet.</p>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs text-neutral-500">{msg}</span>}
          {sendButton}
        </div>
      </div>
    );
  }

  const { node } = pick;
  return (
    <div className="rounded-xl border border-amber-500/30 bg-neutral-900 p-5">
      <p className="text-xs uppercase tracking-wide text-amber-400/80">
        This week in Atlas · {mapTitles[node.mapId] ?? "Atlas"}
        {node.branchTitle ? ` › ${node.branchTitle}` : ""}
      </p>
      <h2 className="mt-1 text-lg font-medium text-neutral-100">{node.title}</h2>
      <p className="mt-1 text-sm text-neutral-400">{node.hook}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href={`/atlas/${node.mapId}/${node.id}?from=note`}
          className="rounded-md bg-amber-500 px-4 py-1.5 text-sm font-medium text-neutral-950 hover:bg-amber-400"
        >
          Open
        </Link>
        <span className="text-xs text-neutral-500">
          {pick.opened ? "Already opened" : "Not opened yet"}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {msg && <span className="text-xs text-neutral-500">{msg}</span>}
          {sendButton}
        </span>
      </div>
    </div>
  );
}
