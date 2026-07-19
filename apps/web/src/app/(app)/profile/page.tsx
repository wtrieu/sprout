"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/child")
      .then((r) => r.json())
      .then((d) => {
        if (d.child) {
          setName(d.child.name);
          setDob(d.child.dob);
        }
      });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/child", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, dob }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? `Save failed (${res.status})`);
      return;
    }
    router.push("/home");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Child profile</h1>
      <p className="text-sm text-neutral-400">
        Date of birth drives everything in Sprout — retrieval windows, milestone
        buckets, story reading level, activity difficulty.
      </p>
      <form onSubmit={save} className="space-y-4">
        <label className="block">
          <span className="text-sm text-neutral-400">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-amber-500"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-400">Date of birth</span>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-amber-500"
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-amber-500 px-4 py-2 font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
