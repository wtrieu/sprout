"use client";

import { useState } from "react";

type Result = { z: number; percentile: number } | null;
type GrowthResponse = {
  ageDays: number;
  weightForAge?: Result;
  lengthForAge?: Result;
  headCircForAge?: Result;
  weightForLength?: Result;
  error?: string;
};

const LABELS: Array<[keyof GrowthResponse, string]> = [
  ["weightForAge", "Weight for age"],
  ["lengthForAge", "Length for age"],
  ["headCircForAge", "Head circumference for age"],
  ["weightForLength", "Weight for length"],
];

export default function GrowthPage() {
  const [sex, setSex] = useState<"male" | "female">("male");
  const [weightKg, setWeightKg] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [hcCm, setHcCm] = useState("");
  const [result, setResult] = useState<GrowthResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const params = new URLSearchParams({ sex });
    if (weightKg) params.set("weightKg", weightKg);
    if (lengthCm) params.set("lengthCm", lengthCm);
    if (hcCm) params.set("hcCm", hcCm);
    const res = await fetch(`/api/growth?${params}`);
    setResult(await res.json());
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Growth check</h1>
        <p className="mt-1 text-sm text-neutral-400">
          WHO Child Growth Standards percentiles. A single point is a snapshot —
          trends matter more; discuss growth with your pediatrician.
        </p>
      </div>

      <form onSubmit={check} className="space-y-4">
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
        {[
          ["Weight (kg)", weightKg, setWeightKg, "10.2"],
          ["Length (cm)", lengthCm, setLengthCm, "76"],
          ["Head circumference (cm)", hcCm, setHcCm, "46"],
        ].map(([label, value, setter, ph]) => (
          <label key={label as string} className="block">
            <span className="text-sm text-neutral-400">{label as string}</span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={value as string}
              onChange={(e) => (setter as (v: string) => void)(e.target.value)}
              placeholder={ph as string}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-amber-500"
            />
          </label>
        ))}
        <button
          type="submit"
          disabled={busy || (!weightKg && !lengthCm && !hcCm)}
          className="rounded-md bg-amber-500 px-4 py-2 font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Check percentiles"}
        </button>
      </form>

      {result && !result.error && (
        <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          {LABELS.filter(([k]) => result[k] !== undefined).map(([key, label]) => {
            const r = result[key] as Result;
            return (
              <div key={key} className="flex items-baseline justify-between text-sm">
                <span className="text-neutral-400">{label}</span>
                {r ? (
                  <span>
                    <span className="font-medium text-amber-400">
                      P{r.percentile.toFixed(1)}
                    </span>{" "}
                    <span className="text-neutral-500">(z {r.z.toFixed(2)})</span>
                  </span>
                ) : (
                  <span className="text-neutral-600">out of table range</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {result?.error && <p className="text-sm text-red-400">{result.error}</p>}
    </div>
  );
}
