"use client";

import { useCallback, useEffect, useState } from "react";

type Job = {
  id: number;
  type: string;
  lane: string;
  status: string;
  attempts: number;
  error: string | null;
  createdAt: string;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "text-neutral-400",
  running: "text-amber-300",
  done: "text-emerald-300",
  failed: "text-red-400",
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/jobs").then((r) => r.json());
    setJobs(d.jobs);
    setRunning(d.running);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const retry = async (id: number) => {
    await fetch("/api/jobs/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const runNow = async () => {
    await fetch("/api/jobs/run", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setRunning(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <button
          onClick={runNow}
          disabled={running}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {running ? "Running…" : "Run queue now"}
        </button>
      </div>
      <div className="space-y-1">
        {jobs.map((j) => (
          <div
            key={j.id}
            className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
          >
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="text-neutral-600">#{j.id}</span>
              <span className="font-medium">{j.type}</span>
              <span className="text-xs text-neutral-600">{j.lane}</span>
              {j.error && (
                <span className="truncate text-xs text-red-400/80" title={j.error}>
                  {j.error}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`text-xs ${STATUS_STYLE[j.status] ?? ""}`}>{j.status}</span>
              {j.status === "failed" && (
                <button
                  onClick={() => retry(j.id)}
                  className="rounded bg-neutral-800 px-2 py-0.5 text-xs hover:bg-neutral-700"
                >
                  retry
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
