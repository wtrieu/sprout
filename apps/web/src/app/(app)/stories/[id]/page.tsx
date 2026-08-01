"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, Trash2 } from "lucide-react";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { normalizePageText } from "@/lib/stories/text";

type Page = {
  pageIndex: number;
  text: string;
  illustrationPrompt: string;
  imagePath: string | null;
  imageStatus: string;
};
type Story = {
  id: number;
  title: string | null;
  prompt: string;
  status: string;
  form: string | null;
  artNotes: string | null;
  characterName: string | null;
  favorite: boolean;
};

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.preventDefault();
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 transition hover:border-amber-500/60 hover:text-amber-300"
    >
      {copied ? "Copied ✓" : "Copy prompt"}
    </button>
  );
};

const UploadSlot = ({
  storyId,
  page,
  onUploaded,
}: {
  storyId: number;
  page: Page;
  onUploaded: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/stories/${storyId}/pages/${page.pageIndex}/image`, {
      method: "POST",
      body: form,
    });
    setBusy(false);
    if (res.ok) {
      onUploaded();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Upload failed");
    }
  };

  const hasImage = page.imagePath && page.imageStatus === "done";
  return (
    <div className="shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="relative block h-24 w-36 overflow-hidden rounded-lg border border-dashed border-neutral-700 bg-neutral-950 transition hover:border-amber-500/60 disabled:opacity-60"
      >
        {hasImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/images/${page.imagePath}`}
              alt=""
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-x-0 bottom-0 bg-neutral-950/70 py-0.5 text-center text-[10px] text-neutral-300">
              {busy ? "Uploading…" : "tap to replace"}
            </span>
          </>
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-neutral-500">
            <span className="text-lg">⬆️</span>
            {busy ? "Uploading…" : "Upload art"}
          </span>
        )}
      </button>
      {error && <p className="mt-1 max-w-36 text-[10px] text-red-400">{error}</p>}
    </div>
  );
};

export default function StoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [story, setStory] = useState<Story | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch(`/api/stories/${id}`).then((r) => r.json());
    if (d.story) {
      setStory(d.story);
      setPages(d.pages);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  if (!story) return <p className="text-neutral-500">Loading…</p>;

  const doneImages = pages.filter((p) => p.imageStatus === "done").length;
  const isDraft = story.status === "draft";
  const isApproved = story.status === "approved";
  const isReady = story.status === "ready";

  const approve = async () => {
    setBusy(true);
    await fetch(`/api/stories/${story.id}/approve`, { method: "POST" });
    setBusy(false);
    load();
  };

  const reject = async () => {
    if (!confirm(`Delete "${story.title ?? story.prompt}"? This can't be undone.`)) return;
    setBusy(true);
    await fetch(`/api/stories/${story.id}`, { method: "DELETE" });
    router.push("/stories");
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{story.title ?? story.prompt}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {isDraft
              ? "Candidate — read it through, then approve or delete"
              : isApproved
                ? `Waiting for art — ${doneImages}/${pages.length} pages illustrated`
                : isReady
                  ? "Ready to read"
                  : story.status === "rendering"
                    ? `Illustrating — ${doneImages}/${pages.length} pages done`
                    : story.status}
            {story.characterName ? ` · starring ${story.characterName}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isReady && (
            <>
              <button
                onClick={async () => {
                  setStory((s) => (s ? { ...s, favorite: !s.favorite } : s));
                  await fetch(`/api/stories/${story.id}`, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ favorite: !story.favorite }),
                  });
                }}
                aria-label={story.favorite ? "Remove from favorites" : "Add to favorites"}
                aria-pressed={story.favorite}
                className={`flex h-10 items-center justify-center rounded-md border border-neutral-700 px-3 transition hover:border-amber-500/50 active:scale-95 ${
                  story.favorite ? "text-amber-400" : "text-neutral-400"
                }`}
              >
                <Star className="h-5 w-5" fill={story.favorite ? "currentColor" : "none"} />
              </button>
              <Link
                href={`/stories/${story.id}/read`}
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400"
              >
                Read 🌙
              </Link>
              <a
                href={`/api/stories/${story.id}/pdf`}
                className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-amber-500/50"
              >
                PDF
              </a>
              <a
                href={`/api/stories/${story.id}/offline`}
                title="Download a self-contained copy that works with no connection"
                className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-amber-500/50"
              >
                Offline ⬇
              </a>
            </>
          )}
          <button
            onClick={reject}
            disabled={busy}
            className="flex h-10 items-center gap-1.5 rounded-md border border-neutral-800 px-3 text-sm text-neutral-500 transition hover:border-red-900 hover:text-red-400 active:scale-95 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {(isApproved || isDraft) && story.artNotes && (
        <div className="whitespace-pre-line rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm leading-relaxed text-amber-100/80">
          {story.artNotes}
        </div>
      )}

      {isDraft || isApproved ? (
        <div className="space-y-4">
          {pages.map((p) => (
            <div
              key={p.pageIndex}
              className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-neutral-500">
                    Page {p.pageIndex + 1}
                  </div>
                  <p className="mt-1 whitespace-pre-line font-serif text-lg leading-relaxed text-amber-50/90">
                    {normalizePageText(p.text)}
                  </p>
                </div>
                {isApproved && (
                  <UploadSlot storyId={story.id} page={p} onUploaded={load} />
                )}
              </div>
              <div className="flex items-start gap-2">
                <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-neutral-950 px-3 py-2 font-mono text-xs leading-relaxed text-neutral-400">
                  {p.illustrationPrompt}
                </pre>
                <CopyButton text={p.illustrationPrompt} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {pages.map((p) => (
            <div key={p.pageIndex} className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
              {p.imagePath && p.imageStatus === "done" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/images/${p.imagePath}`}
                  alt={`Page ${p.pageIndex + 1}`}
                  className="aspect-square w-full rounded object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded bg-neutral-800 text-xs text-neutral-500">
                  {p.imageStatus === "failed" ? "⚠️ failed" : "🎨 pending"}
                </div>
              )}
              <p className="mt-1.5 line-clamp-3 text-xs text-neutral-400">{p.text}</p>
            </div>
          ))}
        </div>
      )}

      {isDraft && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-3">
            <button
              onClick={reject}
              disabled={busy}
              className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-400 transition hover:border-red-900 hover:text-red-400 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={approve}
              disabled={busy}
              className="rounded-md bg-amber-500 px-5 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
            >
              Approve — I&apos;ll illustrate it
            </button>
          </div>
        </div>
      )}

      {isApproved && doneImages === pages.length && pages.length > 0 && (
        <p className="text-sm text-amber-300">
          All pages illustrated — finishing up… it&apos;ll flip to Ready in a moment.
        </p>
      )}
    </div>
  );
}
