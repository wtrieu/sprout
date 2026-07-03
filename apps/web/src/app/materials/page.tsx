"use client";

import { useCallback, useEffect, useState } from "react";

type Material = { id: number; slug: string; name: string; category: string; owned: boolean };

export default function MaterialsPage() {
  const [list, setList] = useState<Material[]>([]);

  const load = useCallback(async () => {
    const d = await fetch("/api/materials").then((r) => r.json());
    setList(d.materials);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (m: Material) => {
    setList((l) => l.map((x) => (x.id === m.id ? { ...x, owned: !x.owned } : x)));
    await fetch("/api/materials", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ materialId: m.id, owned: !m.owned }),
    });
  };

  const categories = [...new Set(list.map((m) => m.category))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Materials at home</h1>
        <p className="mt-1 text-sm text-neutral-400">
          The weekly activity generator only suggests activities using what you
          actually own.
        </p>
      </div>
      {categories.map((cat) => (
        <section key={cat}>
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {cat.replace("-", " ")}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {list
              .filter((m) => m.category === cat)
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() => toggle(m)}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    m.owned
                      ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/50"
                      : "bg-neutral-900 text-neutral-500 ring-1 ring-neutral-800 hover:text-neutral-300"
                  }`}
                >
                  {m.name}
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
