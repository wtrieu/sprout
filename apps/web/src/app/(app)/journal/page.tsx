"use client";

import { useCallback, useEffect, useState } from "react";

type Entry = {
  id: number;
  kind: string;
  content: string;
  milestoneId: number | null;
  ageMonths: number;
  auto: number;
  createdAt: string;
};
type Milestone = { id: number; domain: string; ageMonths: number; description: string };

const KIND_BADGE: Record<string, string> = {
  note: "📝",
  observation: "👀",
  milestone: "🎉",
  measurement: "📏",
  preference: "💛",
};

export default function JournalPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [frontier, setFrontier] = useState<Milestone[]>([]);
  const [achievedIds, setAchievedIds] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"note" | "preference">("note");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await fetch("/api/journal").then((r) => r.json());
    setEntries(data.entries ?? []);
    setFrontier(data.frontier ?? []);
    setAchievedIds(data.achievedIds ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/journal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, content: text.trim() }),
    });
    setBusy(false);
    setText("");
    load();
  };

  const markAchieved = async (milestoneId: number) => {
    await fetch("/api/journal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "milestone", milestoneId }),
    });
    load();
  };

  const remove = async (id: number) => {
    await fetch(`/api/journal?id=${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Journal</h1>
        <p className="mt-1 text-sm text-neutral-400">
          What Sprout knows about your child — quick notes, current loves,
          milestones reached. Everything here personalizes stories, activities,
          and visit briefs. Entries marked 👀 were learned from your questions.
        </p>
      </div>

      <form onSubmit={add} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="flex gap-2 text-sm">
          {(
            [
              ["note", "📝 Note"],
              ["preference", "💛 Current love"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1.5 ${
                kind === k
                  ? "bg-amber-500 font-medium text-neutral-950"
                  : "border border-neutral-700 text-neutral-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            minLength={2}
            placeholder={
              kind === "note"
                ? "e.g. slept through the night; new tooth top left"
                : "e.g. obsessed with diggers; loves splashing"
            }
            className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={busy || text.trim().length < 2}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </form>

      {frontier.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="font-medium">Milestone checklist</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Tap when you see it happen — achieved skills stop appearing as
            activity goals and show as wins in the weekly digest.
          </p>
          <div className="mt-3 space-y-1.5">
            {frontier.map((m) => {
              const done = achievedIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => !done && markAchieved(m.id)}
                  disabled={done}
                  className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                    done ? "text-neutral-600 line-through" : "text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  <span>{done ? "✅" : "⬜"}</span>
                  <span>
                    {m.description}
                    <span className="ml-1 text-xs text-neutral-600">
                      ({m.domain}, {m.ageMonths}mo)
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {entries.map((e) => (
          <div
            key={e.id}
            className="group flex items-start justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-sm"
          >
            <div>
              <span className="mr-2">{KIND_BADGE[e.kind] ?? "•"}</span>
              {e.content}
              <span className="ml-2 text-xs text-neutral-600">
                {e.ageMonths}mo{e.auto ? " · auto" : ""}
              </span>
            </div>
            <button
              onClick={() => remove(e.id)}
              className="hidden text-xs text-neutral-600 hover:text-red-400 group-hover:block"
            >
              delete
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-neutral-600">
            Nothing yet — add a note above, or just keep asking questions in
            Ask; Sprout journals what it learns overnight.
          </p>
        )}
      </div>
    </div>
  );
}
