"use client";

import { useCallback, useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";

type Brief = {
  id: number;
  ageMonths: number;
  contentMd: string;
  createdAt: string;
};

export default function VisitPrepPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [sex, setSex] = useState<"male" | "female">("male");
  const [weightKg, setWeightKg] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [hcCm, setHcCm] = useState("");
  const [concerns, setConcerns] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/visit-prep");
    const data = await res.json();
    setBriefs(data.briefs ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/visit-prep", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sex,
        weightKg: weightKg ? Number(weightKg) : undefined,
        lengthCm: lengthCm ? Number(lengthCm) : undefined,
        hcCm: hcCm ? Number(hcCm) : undefined,
        concerns: concerns.trim() || undefined,
      }),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setConcerns("");
    setOpenId(data.brief.id);
    load();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Visit prep</h1>
        <p className="mt-1 text-sm text-neutral-400">
          A one-page brief for the next pediatrician appointment — growth
          percentiles, milestone talking points, and questions worth asking,
          pulled from everything Sprout knows. Print it and bring it along.
        </p>
      </div>

      <form onSubmit={generate} className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-5 print:hidden">
        <h2 className="font-medium">New brief</h2>
        <div className="flex gap-2">
          {(["male", "female"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSex(s)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                sex === s
                  ? "bg-amber-500 font-medium text-neutral-950"
                  : "border border-neutral-700 text-neutral-400"
              }`}
            >
              {s === "male" ? "Boy" : "Girl"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Weight (kg)", weightKg, setWeightKg, "10.2"],
            ["Length (cm)", lengthCm, setLengthCm, "76"],
            ["Head circ. (cm)", hcCm, setHcCm, "46"],
          ].map(([label, value, setter, ph]) => (
            <label key={label as string} className="block">
              <span className="text-xs text-neutral-400">{label as string}</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={value as string}
                onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                placeholder={ph as string}
                className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
              />
            </label>
          ))}
        </div>
        <label className="block">
          <span className="text-xs text-neutral-400">
            Anything on your mind for this visit? (optional)
          </span>
          <textarea
            value={concerns}
            onChange={(e) => setConcerns(e.target.value)}
            rows={3}
            placeholder="e.g. still waking twice a night; picky about vegetables; rash on elbow"
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? "Writing the brief… (a few minutes on the local model)" : "Generate brief"}
        </button>
        <p className="text-xs text-neutral-600">
          Measurements are optional — leave them blank to skip the growth
          section. Sprout organizes information; it is not medical advice.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>

      <div className="space-y-3">
        {briefs.map((b) => (
          <div key={b.id} className="rounded-xl border border-neutral-800 bg-neutral-900">
            <button
              onClick={() => setOpenId(openId === b.id ? null : b.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left print:hidden"
            >
              <span className="font-medium">
                Brief at {b.ageMonths} months
                <span className="ml-2 text-xs font-normal text-neutral-500">
                  {new Date(b.createdAt).toLocaleDateString()}
                </span>
              </span>
              <span className="text-sm text-neutral-500">{openId === b.id ? "▾" : "▸"}</span>
            </button>
            {openId === b.id && (
              <div className="border-t border-neutral-800 px-4 py-4 print:border-0">
                <Markdown md={b.contentMd} />
                <button
                  onClick={() => window.print()}
                  className="mt-4 rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-amber-500 print:hidden"
                >
                  Print
                </button>
              </div>
            )}
          </div>
        ))}
        {briefs.length === 0 && (
          <p className="text-sm text-neutral-600">No briefs yet — generate one above.</p>
        )}
      </div>
    </div>
  );
}
