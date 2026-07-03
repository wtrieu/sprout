"use client";

import { useCallback, useEffect, useState } from "react";

type Character = {
  id: number;
  name: string;
  appearanceDesc: string;
  refImagePath: string | null;
};

export default function CharactersPage() {
  const [list, setList] = useState<Character[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/characters").then((r) => r.json());
    setList(d.characters);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/characters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, appearanceDesc: desc }),
    });
    setBusy(false);
    setName("");
    setDesc("");
    load();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Characters</h1>
        <p className="mt-1 text-sm text-neutral-400">
          A character&apos;s appearance description + reference portrait keep them
          recognizable on every page of every story.
        </p>
      </div>

      <form onSubmit={create} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Name — e.g. Milo"
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          required
          rows={3}
          placeholder="Appearance — be specific and stable: 'a cheerful toddler boy with short wavy dark brown hair, big brown eyes, round rosy cheeks, always wearing a mustard-yellow romper with a little orange fox on the chest'"
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={busy || desc.trim().length < 20}
          className="rounded-md bg-amber-500 px-4 py-1.5 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create character"}
        </button>
        <p className="text-xs text-neutral-500">
          The reference portrait renders in the next image batch (overnight, or
          “Crawl now” on Sources).
        </p>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {list.map((c) => (
          <div key={c.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
            {c.refImagePath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/images/${c.refImagePath}`}
                alt={c.name}
                className="aspect-square w-full rounded-lg object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-neutral-800 text-xs text-neutral-500">
                portrait pending…
              </div>
            )}
            <div className="mt-2 font-medium">{c.name}</div>
            <div className="mt-0.5 line-clamp-3 text-xs text-neutral-500">{c.appearanceDesc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
