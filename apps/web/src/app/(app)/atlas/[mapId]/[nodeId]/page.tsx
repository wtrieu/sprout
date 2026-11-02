"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { AtlasImageData } from "@/components/atlas/AtlasImage";
import { RungBody } from "@/components/atlas/RungBody";
import { Markdown } from "@/components/Markdown";

type Level = "eli10" | "onepager" | "deepdive";
const LEVELS: Level[] = ["eli10", "onepager", "deepdive"];
const LABEL: Record<Level, string> = {
  eli10: "Like I'm 10",
  onepager: "One-pager",
  deepdive: "Deep dive",
};

type Rung = {
  id: number;
  level: Level;
  status: "drafting" | "ready" | "failed";
  hook: string | null;
  bodyMd: string | null;
  visualsJson: string | null;
  wordCount: number | null;
  error: string | null;
  startedAt: string;
};
type Reading = {
  id: number;
  kind: "wikipedia" | "book" | "web";
  title: string;
  author: string | null;
  url: string | null;
  why: string | null;
  snippet: string | null;
};
type NodeLite = { id: number; title: string; blurb: string; kind: string; skipped: boolean };
type Tier = {
  seen: boolean;
  eli10: boolean;
  onepager: boolean;
  deepdive: boolean;
  mastered: boolean;
};
type QuizQuestion = { question: string; choices: string[] };
type Detail = {
  node: NodeLite & { parentId: number | null; mapId: number; visitedAt: string | null };
  map: { id: number; title: string } | null;
  parent: NodeLite | null;
  siblings: NodeLite[];
  children: NodeLite[];
  rungs: Record<Level, Rung | null>;
  readings: Reading[];
  images: AtlasImageData[];
  adjacent: Array<{ nodeId: number; title: string; reason: string }>;
  player: { id: number; name: string; persona: string } | null;
  progress: { tier: Tier; quiz: { passedAt: string | null; attempts: number } } | null;
  quiz: { questions: QuizQuestion[] } | null;
};
type GradeResponse = {
  correct: boolean[];
  score: number;
  passed: boolean;
  explanations: string[] | null;
  personaLine: string;
};

type Bookmark = {
  id: number;
  nodeId: number;
  nodeTitle: string;
  mapId: number;
  mapTitle: string;
  note: string | null;
  targetAgeYears: number | null;
  kidStatus: "drafting" | "ready" | "failed";
  kidMd: string | null;
  kidToday: string | null;
  kidAgeMonths: number | null;
  kidError: string | null;
  storyTopic: string;
  createdAt: string;
};

const KIND_LABEL: Record<Reading["kind"], string> = {
  wikipedia: "Wikipedia",
  book: "Book",
  web: "Web",
};

const isLevel = (s: string | null): s is Level => !!s && (LEVELS as string[]).includes(s);

/**
 * The quiz under the one-pager — the gate to "mastered". Grading happens on
 * the server (the answers never reach the client); retry freely, no cost; a
 * pass is permanent, so a re-take is just for fun.
 */
function QuizBlock({
  nodeId,
  questions,
  passedAt,
  onGraded,
}: {
  nodeId: string;
  questions: QuizQuestion[];
  passedAt: string | null;
  onGraded: () => void;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(questions.map(() => null));
  const [result, setResult] = useState<GradeResponse | null>(null);
  const [open, setOpen] = useState(!passedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/atlas/nodes/${nodeId}/quiz`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    setBusy(false);
    const d = await res.json().catch(() => null);
    if (!res.ok) {
      setError(d?.error ?? "Couldn't grade the quiz.");
      return;
    }
    setResult(d as GradeResponse);
    onGraded();
  };

  return (
    <div className="space-y-4 border-t border-neutral-800 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Quiz</h3>
        {passedAt && (
          <span className="rounded-full border border-amber-400/60 px-2 py-0.5 text-xs text-amber-400">
            ★ mastered
          </span>
        )}
        {passedAt && !open && (
          <button
            onClick={() => {
              setOpen(true);
              setResult(null);
              setAnswers(questions.map(() => null));
            }}
            className="text-xs text-neutral-600 hover:text-neutral-300"
          >
            Take it again
          </button>
        )}
      </div>

      {open && (
        <>
          <ol className="space-y-4">
            {questions.map((q, qi) => {
              const graded = result?.correct[qi];
              return (
                <li key={qi} className="space-y-2">
                  <p className="text-sm text-neutral-200">
                    {qi + 1}. {q.question}
                    {result && (
                      <span className={graded ? "ml-2 text-xs text-amber-400" : "ml-2 text-xs text-red-400"}>
                        {graded ? "right" : "not this one"}
                      </span>
                    )}
                  </p>
                  <div className="space-y-1">
                    {q.choices.map((choice, ci) => (
                      <label
                        key={ci}
                        className={`flex cursor-pointer items-baseline gap-2 rounded-md border px-3 py-1.5 text-sm transition ${
                          answers[qi] === ci
                            ? "border-amber-500/60 text-neutral-100"
                            : "border-neutral-800 text-neutral-400 hover:border-neutral-700"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${nodeId}-${qi}`}
                          checked={answers[qi] === ci}
                          onChange={() =>
                            setAnswers((a) => a.map((v, i) => (i === qi ? ci : v)))
                          }
                          className="sr-only"
                        />
                        <span>{choice}</span>
                      </label>
                    ))}
                  </div>
                  {result?.passed && result.explanations && (
                    <p className="text-xs text-neutral-500">{result.explanations[qi]}</p>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={busy || answers.some((a) => a === null)}
              onClick={submit}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
            >
              Check my answers
            </button>
            {result && !result.passed && (
              <span className="text-xs text-neutral-500">
                {result.score}/{questions.length} — all three for the stamp. Retry freely.
              </span>
            )}
            {error && <span className="text-sm text-red-400">{error}</span>}
          </div>
          {result && (
            <p className="text-sm italic text-neutral-500">“{result.personaLine}”</p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * "Save for <child>" — a bookmark is a time capsule (node + note + optional
 * target age). Saving drafts a kid version in the background; like the rungs,
 * the UI only polls the row's status. Opens pre-expanded from the weekly
 * note's `?action=save` link.
 */
function SavePanel({ nodeId, initialOpen }: { nodeId: string; initialOpen: boolean }) {
  const [childName, setChildName] = useState<string | null>(null);
  const [bookmark, setBookmark] = useState<Bookmark | null>(null);
  const [open, setOpen] = useState(initialOpen);
  const [note, setNote] = useState("");
  const [age, setAge] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/atlas/bookmarks?nodeId=${nodeId}`).catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as { childName: string | null; bookmarks: Bookmark[] };
    setChildName(d.childName);
    setBookmark(d.bookmarks[0] ?? null);
  }, [nodeId]);

  const drafting = bookmark?.kidStatus === "drafting";

  useEffect(() => {
    load();
    const t = setInterval(load, drafting ? 5000 : 30000);
    return () => clearInterval(t);
  }, [load, drafting]);

  // Blank = "now"; otherwise whole years 1–25. null result = invalid.
  const ageBody = () => {
    const n = age.trim() === "" ? null : Number(age);
    return n === null || (Number.isInteger(n) && n >= 1 && n <= 25) ? { targetAgeYears: n } : null;
  };

  // One request helper: runs the call, surfaces the server's error, applies the row.
  const send = async (url: string, init: RequestInit, onOk: (d: { bookmark?: Bookmark }) => void) => {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json" },
    }).catch(() => null);
    setBusy(false);
    const d = await res?.json().catch(() => null);
    if (res?.status === 409) {
      load(); // already saved from another tab — just show it
      return;
    }
    if (!res?.ok) {
      setError(d?.error ?? "Couldn't save that.");
      return;
    }
    onOk(d ?? {});
  };

  const save = () => {
    const target = ageBody();
    if (!target) return setError("Age should be between 1 and 25, or blank for now.");
    send(
      "/api/atlas/bookmarks",
      { method: "POST", body: JSON.stringify({ nodeId: Number(nodeId), note: note.trim() || undefined, ...target }) },
      (d) => d.bookmark && setBookmark(d.bookmark),
    );
  };

  const patch = (body: Record<string, unknown>, after?: () => void) =>
    bookmark &&
    send(`/api/atlas/bookmarks/${bookmark.id}`, { method: "PATCH", body: JSON.stringify(body) }, (d) => {
      if (d.bookmark) setBookmark(d.bookmark);
      after?.();
    });

  const saveEdits = () => {
    const target = ageBody();
    if (!target) return setError("Age should be between 1 and 25, or blank for now.");
    patch({ note: note.trim(), ...target }, () => setEditing(false));
  };

  const remove = () =>
    bookmark &&
    send(`/api/atlas/bookmarks/${bookmark.id}`, { method: "DELETE" }, () => {
      setBookmark(null);
      setNote("");
      setAge("");
      setOpen(false);
    });

  const name = childName ?? "the child";
  const field =
    "w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-amber-500/60 focus:outline-none";

  if (!bookmark && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-amber-500/50 hover:text-amber-400"
      >
        {childName ? `Save for ${childName}` : "Save for the child"}
      </button>
    );
  }

  const form = (onSubmit: () => void, label: string, onCancel: () => void) => (
    <div className="space-y-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 600))}
        rows={3}
        placeholder="Why this mattered (optional)"
        className={field}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-neutral-500">
          Target age (years)
          <input
            type="number"
            min={1}
            max={25}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="now"
            className={`${field} w-20`}
          />
        </label>
        <button
          disabled={busy}
          onClick={onSubmit}
          className="rounded-md bg-amber-500 px-4 py-1.5 font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {label}
        </button>
        <button onClick={onCancel} className="px-2 py-1.5 text-neutral-500 hover:text-neutral-300">
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-sm">
      <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {bookmark ? `Saved for ${name}` : `Save for ${name}`}
      </h2>

      {!bookmark &&
        form(save, "Save", () => {
          setOpen(false);
          setError(null);
        })}

      {bookmark &&
        editing &&
        form(saveEdits, "Update", () => {
          setEditing(false);
          setError(null);
        })}

      {bookmark && !editing && (
        <>
          <div className="space-y-1 text-neutral-400">
            {bookmark.note && <p className="whitespace-pre-wrap">{bookmark.note}</p>}
            <p className="text-xs text-neutral-500">
              {bookmark.targetAgeYears ? `For age ${bookmark.targetAgeYears}` : "For now"}
              <button
                onClick={() => {
                  setNote(bookmark.note ?? "");
                  setAge(bookmark.targetAgeYears?.toString() ?? "");
                  setEditing(true);
                }}
                className="ml-3 text-neutral-600 hover:text-neutral-300"
              >
                Edit
              </button>
            </p>
          </div>

          <div className="space-y-2 border-t border-neutral-800 pt-3">
            {bookmark.kidStatus === "drafting" && (
              <p className="text-neutral-400">Writing {name}&apos;s version…</p>
            )}
            {bookmark.kidStatus === "ready" && bookmark.kidMd && (
              <>
                <Markdown md={bookmark.kidMd} />
                {bookmark.kidToday && (
                  <p className="rounded-md border border-amber-500/30 px-3 py-2 text-neutral-200">
                    <span className="text-amber-400">Today:</span> {bookmark.kidToday}
                  </p>
                )}
              </>
            )}
            {bookmark.kidStatus === "failed" && (
              <div className="space-y-2">
                <p className="text-xs text-red-400">{bookmark.kidError ?? "The kid version failed."}</p>
                <button
                  disabled={busy}
                  onClick={() => patch({ regenerateKid: true })}
                  className="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-amber-500/50 disabled:opacity-50"
                >
                  Try again
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 pt-3">
            {/* HOOK(atlas-story): posts storyTopicForBookmark to /api/stories/express when wired. */}
            <button
              disabled
              className="rounded-md border border-neutral-800 px-3 py-1.5 text-neutral-600 opacity-60"
            >
              Make it a story
            </button>
            <span className="text-xs text-neutral-600">coming soon</span>
            <button
              disabled={busy}
              onClick={remove}
              className="ml-auto text-neutral-600 hover:text-red-400 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function NodePageInner() {
  const { mapId, nodeId } = useParams<{ mapId: string; nodeId: string }>();
  const search = useSearchParams();
  const initialLevel: Level = isLevel(search.get("rung")) ? (search.get("rung") as Level) : "onepager";
  const fromNote = search.get("from") === "note";

  const [data, setData] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [level, setLevel] = useState<Level>(initialLevel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(search.get("action") === "skip");
  const visitedOnce = useRef(false);
  const readLevels = useRef(new Set<string>());

  const load = useCallback(async () => {
    const res = await fetch(`/api/atlas/nodes/${nodeId}`);
    if (res.status === 404) {
      setMissing(true);
      return;
    }
    setData(await res.json());
  }, [nodeId]);

  const drafting = !!data && LEVELS.some((l) => data.rungs[l]?.status === "drafting");

  useEffect(() => {
    load();
    const t = setInterval(load, drafting ? 5000 : 15000);
    return () => clearInterval(t);
  }, [load, drafting]);

  // One visit beacon per page load (strict mode re-runs effects in dev).
  useEffect(() => {
    if (visitedOnce.current) return;
    visitedOnce.current = true;
    fetch(`/api/atlas/nodes/${nodeId}/visit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fromNote ? { from: "note" } : {}),
    });
  }, [nodeId, fromNote]);

  // One read beacon per rung actually shown ready.
  useEffect(() => {
    const rung = data?.rungs[level];
    if (!rung || rung.status !== "ready" || readLevels.current.has(level)) return;
    readLevels.current.add(level);
    fetch(`/api/atlas/nodes/${nodeId}/visit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rung: level }),
    });
  }, [data, level, nodeId]);

  const draftRung = useCallback(
    async (l: Level, force = false) => {
      setBusy(true);
      setError(null);
      const res = await fetch(`/api/atlas/nodes/${nodeId}/rungs/${l}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(force ? { force: true } : {}),
      });
      setBusy(false);
      if (!res.ok && res.status !== 409) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "Couldn't start the draft.");
      }
      load();
    },
    [nodeId, load],
  );

  // The preload writes every one-pager up front; when this node still lacks
  // one (an older map, a failed or reaped row), start it without a click.
  const autoDrafted = useRef(false);
  useEffect(() => {
    if (!data || autoDrafted.current) return;
    const onepager = data.rungs.onepager;
    if (onepager && (onepager.status === "ready" || onepager.status === "drafting")) return;
    autoDrafted.current = true;
    draftRung("onepager");
  }, [data, draftRung]);

  const skipBranch = async (skipped: boolean) => {
    if (!data) return;
    const target = data.node.parentId ?? data.node.id;
    setBusy(true);
    await fetch(`/api/atlas/nodes/${target}/skip`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skipped }),
    });
    setBusy(false);
    setConfirmSkip(false);
    load();
  };

  if (missing) {
    return (
      <p className="text-sm text-neutral-500">
        That node is gone.{" "}
        <Link href={`/atlas/${mapId}`} className="text-amber-400 hover:underline">
          Back to the map
        </Link>
        .
      </p>
    );
  }
  if (!data) return <p className="text-sm text-neutral-600">Loading…</p>;

  const { node, map, parent } = data;
  const rung = data.rungs[level];
  const branchSkipped = parent ? parent.skipped : node.skipped;
  const branchTitle = parent ? parent.title : node.title;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs text-neutral-500">
          <Link href="/atlas" className="hover:text-neutral-300">Atlas</Link>
          <span className="mx-1.5">›</span>
          <Link href={`/atlas/${mapId}`} className="hover:text-neutral-300">
            {map?.title ?? "Map"}
          </Link>
          {parent && (
            <>
              <span className="mx-1.5">›</span>
              <Link href={`/atlas/${mapId}/${parent.id}`} className="hover:text-neutral-300">
                {parent.title}
              </Link>
            </>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{node.title}</h1>
          <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
            {node.kind}
          </span>
          {branchSkipped && (
            <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
              branch skipped
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-400">{node.blurb}</p>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="flex border-b border-neutral-800 text-sm">
          {LEVELS.map((l) => {
            const s = data.rungs[l]?.status ?? null;
            return (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`flex-1 px-3 py-2.5 transition ${
                  level === l
                    ? "border-b-2 border-amber-500 text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {LABEL[l]}
                <span className="ml-1.5 text-xs text-neutral-600">
                  {s === "ready" ? "●" : s === "drafting" ? "…" : s === "failed" ? "!" : "○"}
                </span>
                {l === "onepager" && data.progress?.tier.mastered && (
                  <span className="ml-1 text-xs text-amber-400" title="mastered — quiz passed">
                    ★
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="space-y-4 px-5 py-5">
          {rung?.status === "ready" && rung.bodyMd && (
            <>
              {rung.hook && <p className="text-base font-medium text-neutral-100">{rung.hook}</p>}
              <RungBody md={rung.bodyMd} visualsJson={rung.visualsJson} images={data.images} />
              <div className="flex items-center justify-between pt-2 text-xs text-neutral-600">
                <span>{rung.wordCount ? `${rung.wordCount} words` : ""}</span>
                <button
                  disabled={busy}
                  onClick={() => draftRung(level, true)}
                  className="hover:text-neutral-300 disabled:opacity-50"
                >
                  Regenerate
                </button>
              </div>
              {level === "onepager" && data.player && data.quiz && (
                <QuizBlock
                  nodeId={nodeId}
                  questions={data.quiz.questions}
                  passedAt={data.progress?.quiz.passedAt ?? null}
                  onGraded={load}
                />
              )}
              {level === "onepager" && data.player && !data.quiz && (
                <p className="border-t border-neutral-800 pt-4 text-xs text-neutral-600">
                  Quiz not written yet — “Prepare quizzes” on the map page backfills it.
                </p>
              )}
            </>
          )}
          {rung?.status === "drafting" && (
            <p className="text-sm text-neutral-400">
              {level === "onepager"
                ? "Writing this page… (about a minute). This page refreshes itself."
                : "Drafting… usually about a minute (write, fact-check, verify links). This page refreshes itself."}
            </p>
          )}
          {rung?.status === "failed" && (
            <div className="space-y-2">
              <p className="text-sm text-red-400">The draft failed.</p>
              <p className="text-xs text-neutral-500">{rung.error}</p>
              <button
                disabled={busy}
                onClick={() => draftRung(level, true)}
                className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-amber-500/50 disabled:opacity-50"
              >
                Try again
              </button>
            </div>
          )}
          {!rung && (
            <div className="space-y-2">
              <p className="text-sm text-neutral-400">
                {level === "onepager"
                  ? "Not written yet."
                  : "Not written yet — the one-pager is written first if it doesn't exist."}
              </p>
              <button
                disabled={busy}
                onClick={() => draftRung(level)}
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
              >
                Draft this (~1 min)
              </button>
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>

      {data.readings.length > 0 && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Read next
          </h2>
          <ul className="mt-3 space-y-3">
            {data.readings.map((r) => (
              <li key={r.id} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                    {KIND_LABEL[r.kind]}
                  </span>
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-400 hover:underline"
                    >
                      {r.title}
                    </a>
                  ) : (
                    <span>{r.title}</span>
                  )}
                  {r.author && <span className="text-xs text-neutral-500">{r.author}</span>}
                </div>
                {(r.why || r.snippet) && (
                  <p className="mt-0.5 text-xs text-neutral-500">{r.why ?? r.snippet}</p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-neutral-600">
            Every link here was checked to exist before it was shown.
          </p>
        </section>
      )}

      {data.adjacent.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Next door
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.adjacent.map((a) => (
              <Link
                key={a.nodeId}
                href={`/atlas/${mapId}/${a.nodeId}`}
                className="rounded-full border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-amber-500/50 hover:text-amber-400"
              >
                {a.title}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-wrap items-center gap-3 border-t border-neutral-900 pt-4 text-xs">
        <SavePanel nodeId={nodeId} initialOpen={search.get("action") === "save"} />
        {confirmSkip ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-neutral-400">
              {branchSkipped ? `Bring back the ${branchTitle} branch?` : `Skip the ${branchTitle} branch?`}
            </span>
            <button
              disabled={busy}
              onClick={() => skipBranch(!branchSkipped)}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:border-amber-500/50 disabled:opacity-50"
            >
              {branchSkipped ? "Bring it back" : "Skip it"}
            </button>
            <button onClick={() => setConfirmSkip(false)} className="px-2 py-1.5 text-neutral-500 hover:text-neutral-300">
              Keep
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmSkip(true)} className="text-neutral-600 hover:text-neutral-300">
            {branchSkipped ? "Bring this branch back" : "Skip this branch"}
          </button>
        )}
      </section>
    </div>
  );
}

export default function NodePage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-600">Loading…</p>}>
      <NodePageInner />
    </Suspense>
  );
}
