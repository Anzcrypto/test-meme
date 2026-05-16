"use client";

import { useState } from "react";
import type { Message } from "@/lib/supabase";

export default function Home() {
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const [searched, setSearched] = useState(false);
  const [lastQuery, setLastQuery] = useState("");

  async function load(query: string) {
    setLoading(true);
    setSearched(true);
    setLastQuery(query);
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
    load(q.trim());
  }

  function reset() {
    setQ("");
    setMessages([]);
    setCount(0);
    setSearched(false);
    setLastQuery("");
  }

  // ---------- Landing (Google-style) ----------
  if (!searched) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
        <div
          className="text-7xl sm:text-8xl mb-3 sm:mb-4 select-none leading-none"
          aria-hidden="true"
        >
          {"\u{1F602}"}
        </div>
        <Logo size="lg" />
        <h1 className="mt-5 sm:mt-6 text-xl sm:text-3xl font-light tracking-wide text-neutral-200 text-center">
          Cari Garapan
        </h1>

        <form onSubmit={onSubmit} className="mt-6 sm:mt-8 w-full max-w-xl">
          <SearchInput
            value={q}
            onChange={setQ}
            loading={loading}
            autoFocus
          />
        </form>

        <p className="mt-5 sm:mt-6 text-xs text-neutral-500 text-center">
          Hanya pesan yang dapat reaction.
        </p>
      </main>
    );
  }

  // ---------- Results ----------
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-10 bg-[#0b0d10]/95 backdrop-blur border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-3 flex items-center gap-3 sm:gap-4">
          <button
            onClick={reset}
            className="shrink-0"
            aria-label="Kembali ke beranda"
          >
            <Logo size="sm" />
          </button>
          <form onSubmit={onSubmit} className="flex-1 min-w-0">
            <SearchInput value={q} onChange={setQ} loading={loading} compact />
          </form>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-3 sm:px-6 py-4">
        <div className="text-xs text-neutral-500 mb-3">
          {loading
            ? "Mencari..."
            : `${count} pesan${lastQuery ? ` untuk "${lastQuery}"` : ""}`}
        </div>

        <ul className="space-y-2 sm:space-y-3">
          {messages.map((m) => (
            <MessageCard key={m.id} m={m} />
          ))}
          {!loading && messages.length === 0 && (
            <li className="text-sm text-neutral-500 text-center py-10">
              Tidak ada hasil untuk &ldquo;{lastQuery}&rdquo;.
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}

/* ---------------- Components ---------------- */

function MessageCard({ m }: { m: Message }) {
  return (
    <li className="border border-neutral-800 bg-neutral-900/40 rounded-lg p-3 sm:p-4 overflow-hidden">
      <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs text-neutral-500 mb-2">
        <span className="truncate">{m.channel_name || m.channel_id}</span>
        <span className="shrink-0">{formatDate(m.date)}</span>
      </div>

      {m.text ? (
        <p className="msg-text text-sm leading-relaxed">{m.text}</p>
      ) : (
        <p className="text-sm italic text-neutral-500">
          ({m.media_type || "no text"})
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-3">
        {m.reactions?.map((r, i) => (
          <span
            key={i}
            className="text-[11px] sm:text-xs bg-neutral-800 border border-neutral-700 rounded-full px-2 py-0.5 whitespace-nowrap"
          >
            {r.emoji.startsWith("custom:") ? "custom" : r.emoji} {r.count}
          </span>
        ))}
        {m.link && (
          <a
            href={m.link}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-[11px] sm:text-xs text-blue-400 hover:underline whitespace-nowrap"
          >
            Buka di Telegram
          </a>
        )}
      </div>
    </li>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  // Mobile-friendly: 14 Mei 2025 atau 14 Mei (kalau tahun ini)
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}

function Logo({ size = "lg" }: { size?: "lg" | "sm" }) {
  const cls =
    size === "lg"
      ? "text-5xl sm:text-7xl"
      : "text-xl sm:text-2xl";
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
        compact ? "h-10" : "h-11 sm:h-12"
      }`}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ketik kata kunci..."
        autoFocus={autoFocus}
        type="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className={`flex-1 min-w-0 bg-transparent outline-none placeholder:text-neutral-500 ${
          compact ? "pl-4 pr-1 text-sm" : "pl-5 pr-2 text-base"
        }`}
      />
      <button
        type="submit"
        disabled={loading}
        aria-label="Cari"
        className={`flex shrink-0 items-center justify-center text-neutral-300 hover:text-white disabled:opacity-50 ${
          compact ? "w-10 h-10" : "w-11 h-11 sm:w-12 sm:h-12"
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
