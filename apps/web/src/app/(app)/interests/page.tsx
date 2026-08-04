"use client";

import { Archive, Check, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Interest = {
  id: number;
  kind: "north-star" | "interest";
  label: string;
  brief: string;
  weight: number;
  share: number | null;
  source: string;
  tags: string[];
  status: string;
};

const SHARE_OPTIONS = [0.1, 0.15, 0.2, 0.25, 0.3];

/**
 * The family compass: durable north stars (with a target share of the
 * library) and lighter current interests (weight chips that decay without
 * reinforcement). Suggestions proposed by the nightly extraction wait here
 * for one-tap confirmation — nothing is ever auto-added.
 */
export default function InterestsPage() {
  const [northStars, setNorthStars] = useState<Interest[]>([]);
  const [interestList, setInterestList] = useState<Interest[]>([]);
  const [suggestions, setSuggestions] = useState<Interest[]>([]);
  const [adding, setAdding] = useState<"north-star" | "interest" | null>(null);
  const [label, setLabel] = useState("");
  const [brief, setBrief] = useState("");

  const load = useCallback(async () => {
    const d = await fetch("/api/interests").then((r) => r.json());
    setNorthStars(d.northStars ?? []);
    setInterestList(d.interests ?? []);
    setSuggestions(d.suggestions ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: number, body: Record<string, unknown>) => {
    await fetch(`/api/interests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  };

  const create = async () => {
    if (!label.trim() || !brief.trim() || !adding) return;
    await fetch("/api/interests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: adding,
        label: label.trim(),
        brief: brief.trim(),
        tags: label.trim().toLowerCase().split(/\s+/).filter((t) => t.length >= 2),
      }),
    });
    setLabel("");
    setBrief("");
    setAdding(null);
    load();
  };

  const dismiss = async (id: number) => {
    await fetch(`/api/interests/${id}`, { method: "DELETE" });
    load();
  };

  const addForm = (kind: "north-star" | "interest") =>
    adding === kind ? (
      <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={kind === "north-star" ? "e.g. Taiwanese culture" : "e.g. diggers"}
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
        />
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder={
            kind === "north-star"
              ? "What should be woven into the library? (fed to the premise writer)"
              : "One sentence a story-premise writer can riff on"
          }
          rows={2}
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setAdding(null)}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-300"
          >
            Cancel
          </button>
          <button
            onClick={create}
            className="rounded-md bg-amber-500 px-4 py-1.5 text-sm font-medium text-neutral-950 hover:bg-amber-400"
          >
            Add
          </button>
        </div>
      </div>
    ) : (
      <button
        onClick={() => setAdding(kind)}
        className="rounded-lg border border-dashed border-neutral-800 px-4 py-2.5 text-sm text-neutral-500 transition hover:border-amber-500/50 hover:text-neutral-300"
      >
        + Add {kind === "north-star" ? "north star" : "interest"}
      </button>
    );

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Family compass</h1>
        <p className="mt-1 text-sm text-neutral-500">
          North stars are durable — woven into the library at their target share, never forced.
          Interests are today&apos;s fascinations; they fade unless stories keep landing.
        </p>
      </div>

      {suggestions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-amber-300">Suggestions to confirm</h2>
          {suggestions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{s.label}</div>
                <div className="truncate text-xs text-neutral-400">{s.brief}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => patch(s.id, { status: "active" })}
                  aria-label={`Confirm ${s.label}`}
                  className="flex h-10 w-10 items-center justify-center rounded-md text-emerald-400 transition hover:bg-emerald-950/50 active:scale-90"
                >
                  <Check className="h-5 w-5" />
                </button>
                <button
                  onClick={() => dismiss(s.id)}
                  aria-label={`Dismiss ${s.label}`}
                  className="flex h-10 w-10 items-center justify-center rounded-md text-neutral-500 transition hover:bg-red-950/50 hover:text-red-400 active:scale-90"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-400">North stars</h2>
        {northStars.map((n) => (
          <div key={n.id} className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">✦ {n.label}</div>
                <p className="mt-0.5 text-sm text-neutral-400">{n.brief}</p>
              </div>
              <button
                onClick={() => patch(n.id, { status: "archived" })}
                aria-label={`Archive ${n.label}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-600 transition hover:text-neutral-300"
              >
                <Archive className="h-4 w-4" />
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-neutral-500">
              Share of the library
              <select
                value={String(n.share ?? 0.2)}
                onChange={(e) => patch(n.id, { share: Number(e.target.value) })}
                className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1"
              >
                {SHARE_OPTIONS.map((s) => (
                  <option key={s} value={String(s)}>
                    {Math.round(s * 100)}%
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
        {addForm("north-star")}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-400">Current interests</h2>
        {interestList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {interestList.map((i) => (
              <span
                key={i.id}
                title={i.brief}
                className="flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 py-1 pl-3 pr-1 text-sm"
              >
                {i.label}
                <span className="ml-1 text-xs text-amber-400">{"·".repeat(i.weight)}</span>
                <button
                  onClick={() => patch(i.id, { weight: Math.max(1, i.weight - 1) })}
                  aria-label={`Less ${i.label}`}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:text-neutral-200"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => patch(i.id, { weight: Math.min(5, i.weight + 1) })}
                  aria-label={`More ${i.label}`}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:text-neutral-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => patch(i.id, { status: "archived" })}
                  aria-label={`Archive ${i.label}`}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-600 hover:text-red-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        {addForm("interest")}
      </section>
    </div>
  );
}
