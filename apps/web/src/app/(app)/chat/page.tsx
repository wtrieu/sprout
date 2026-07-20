"use client";

import { useRef, useState } from "react";

type Citation = { docId: number; title: string; url: string | null; snippet: string };
type Message = { role: "user" | "assistant"; content: string; citations?: Citation[] };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<number | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, sessionId: sessionRef.current }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      sessionRef.current = d.sessionId;
      setMessages((m) => [
        ...m,
        { role: "assistant", content: d.answer, citations: d.citations },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `⚠️ ${err instanceof Error ? err.message : "Something went wrong."}`,
        },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/80">
        Sprout summarizes sourced material — it is not medical advice. For anything
        urgent or symptom-related, call your pediatrician.
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.length === 0 && (
          <p className="pt-8 text-center text-sm text-neutral-500">
            Ask anything — answers are grounded in the library and scoped to your
            child&apos;s current age.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-xl bg-amber-500/15 px-4 py-2.5 text-amber-50"
                  : "max-w-[95%] rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3"
              }
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
              {m.citations && m.citations.length > 0 && (
                <div className="mt-3 border-t border-neutral-800 pt-2">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                    Sources
                  </div>
                  <ol className="mt-1 space-y-1 text-xs">
                    {m.citations.map((c, j) => (
                      <li key={c.docId} className="text-neutral-400">
                        [{j + 1}]{" "}
                        {c.url ? (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-amber-400/90 hover:underline"
                          >
                            {c.title}
                          </a>
                        ) : (
                          c.title
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-neutral-500">Thinking…</div>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={ask} className="flex gap-2 border-t border-neutral-800 pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. How much milk at this age? Ideas for picky eating?"
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
