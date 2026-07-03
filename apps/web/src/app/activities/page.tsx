"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Activity = {
  id: number;
  weekStart: string;
  title: string;
  description: string;
  materials: string[];
  status: "suggested" | "done" | "skipped";
};

export default function ActivitiesPage() {
  const [list, setList] = useState<Activity[]>([]);

  const load = useCallback(async () => {
    const d = await fetch("/api/activities").then((r) => r.json());
    setList(d.activities);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (a: Activity, status: Activity["status"]) => {
    setList((l) => l.map((x) => (x.id === a.id ? { ...x, status } : x)));
    await fetch("/api/activities", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: a.id, status }),
    });
  };

  const weeks = [...new Set(list.map((a) => a.weekStart))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Activities</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Fresh ideas land every Sunday morning, tuned to age and to the{" "}
          <Link href="/materials" className="text-amber-400 hover:underline">
            materials you own
          </Link>
          .
        </p>
      </div>

      {list.length === 0 && (
        <p className="text-neutral-500">
          Nothing yet — mark some materials as owned, then the Sunday job (or a
          manual run) fills this page.
        </p>
      )}

      {weeks.map((week) => (
        <section key={week} className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Week of {week}
          </h2>
          {list
            .filter((a) => a.weekStart === week)
            .map((a) => (
              <div
                key={a.id}
                className={`rounded-lg border px-4 py-3 ${
                  a.status === "done"
                    ? "border-emerald-900/60 bg-emerald-950/20"
                    : a.status === "skipped"
                      ? "border-neutral-800 bg-neutral-900 opacity-50"
                      : "border-neutral-800 bg-neutral-900"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{a.title}</div>
                    <p className="mt-1 text-sm text-neutral-400">{a.description}</p>
                    {a.materials.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {a.materials.map((m) => (
                          <span
                            key={m}
                            className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400"
                          >
                            {m.replace(/-/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setStatus(a, a.status === "done" ? "suggested" : "done")}
                      title="did it"
                      className="rounded-md bg-neutral-800 px-2 py-1 text-sm hover:bg-emerald-500/20"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setStatus(a, a.status === "skipped" ? "suggested" : "skipped")}
                      title="skip"
                      className="rounded-md bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
                    >
                      ✗
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
