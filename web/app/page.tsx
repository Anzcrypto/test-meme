"use client";

import { useState } from "react";
import type { Message } from "@/lib/supabase";

export default function Home() {
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const [searched, setSearched] = useState(false);

  async function load(query: string) {
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/messages?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      setMessages(json.data || []);
      setCount(json.count || 0);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    load(q);
  }

  function reset() {
    setQ("");
    setMessages([]);
    setCount(0);
    setSearched(false);
  }

  // ---------- Landing (Google-style) ----------
  if (!searched) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <Logo size="lg" />
        <h1 className="mt-6 text-2xl sm:text-3xl font-light tracking-wide text-neutral-200">
          Cari Garapan
        </h1>

        <form onSubmit={onSubmit} className="mt-8 w-full max-w-xl">
          <SearchInput
            value={q}
            onChange={setQ}
            loading={loading}
            autoFocus
          />
        </form>

        <p className="mt-6 text-xs text-neutral-500">
          Hanya pesan yang dapat reaction.
        </p>
      </main>
    );
  }

  // ---------- Results ----------
  return (
    <main className="min-h-screen px-4 sm:px-6">
      <header className="max-w-3xl mx-auto pt-4 pb-3 flex items-center gap-4 border-b border-neutral-800 sticky top-0 bg-[#0b0d10]/95 backdrop-blur z-10">
        <button onClick={reset} className="shrink-0">
          <Logo size="sm" />
        </button>
        <form onSubmit={onSubmit} className="flex-1">
          <SearchInput value={q} onChange={setQ} loading={loading} compact />
        </form>
      </header>

      <section className="max-w-3xl mx-auto py-4">
        <div className="text-xs text-neutral-500 mb-3">
          {loading ? "Mencari..." : `${count} pesan ditemukan`}
        </div>

        <ul className="space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className="border border-neutral-800 bg-neutral-900/40 rounded-lg p-4"
            >
              <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
                <span>{m.channel_name || m.channel_id}</span>
                <span>{new Date(m.date).toLocaleString()}</span>
              </div>
              {m.text ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {m.text}
                </p>
              ) : (
                <p className="text-sm italic text-neutral-500">
                  ({m.media_type || "no text"})
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {m.reactions?.map((r, i) => (
                  <span
                    key={i}
                    className="text-xs bg-neutral-800 border border-neutral-700 rounded-full px-2 py-0.5"
                  >
                    {r.emoji.startsWith("custom:") ? "custom" : r.emoji} {r.count}
                  </span>
                ))}
                {m.link && (
                  <a
                    href={m.link}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-xs text-blue-400 hover:underline"
                  >
                    Buka di Telegram
                  </a>
                )}
              </div>
            </li>
          ))}
          {!loading && messages.length === 0 && (
            <li className="text-sm text-neutral-500 text-center py-10">
              Tidak ada hasil untuk &ldquo;{q}&rdquo;.
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}

/* ---------------- Components ---------------- */

function Logo({ size = "lg" }: { size?: "lg" | "sm" }) {
  const cls =
    size === "lg"
      ? "text-6xl sm:text-7xl"
      : "text-2xl";
  return (
    <div className={`${cls} font-bold tracking-tight select-none`}>
      <span className="text-blue-400">G</span>
      <span className="text-red-400">a</span>
      <span className="text-yellow-400">r</span>
      <span className="text-blue-400">a</span>
      <span className="text-green-400">p</span>
      <span className="text-red-400">a</span>
      <span className="text-yellow-400">n</span>
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  loading,
  autoFocus,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  loading: boolean;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative flex items-center bg-neutral-900 border border-neutral-700 rounded-full hover:border-neutral-500 focus-within:border-neutral-400 transition-colors ${
        compact ? "h-10" : "h-12"
      }`}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ketik kata kunci..."
        autoFocus={autoFocus}
        className="flex-1 bg-transparent outline-none px-5 text-base placeholder:text-neutral-500"
      />
      <button
        type="submit"
        disabled={loading}
        aria-label="Cari"
        className={`flex items-center justify-center text-neutral-300 hover:text-white disabled:opacity-50 ${
          compact ? "w-10 h-10" : "w-12 h-12"
        }`}
      >
        <SearchIcon className={compact ? "w-4 h-4" : "w-5 h-5"} />
      </button>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
