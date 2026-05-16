"use client";

import { useEffect, useState } from "react";
import type { Message } from "@/lib/supabase";

export default function Home() {
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);

  async function load(query: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/messages?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      setMessages(json.data || []);
      setCount(json.count || 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("");
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    load(q);
  }

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Reacted Messages</h1>
        <p className="text-sm text-neutral-400">
          Pesan dari channel yang dapat reaction.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex gap-2 mb-6 sticky top-2 z-10">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari kata kunci..."
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          className="bg-neutral-100 text-neutral-900 px-4 py-2 rounded-lg font-medium disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "..." : "Cari"}
        </button>
      </form>

      <div className="text-xs text-neutral-500 mb-3">
        {count} pesan ditemukan
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
            Belum ada pesan. Jalankan worker dulu untuk sync data.
          </li>
        )}
      </ul>
    </main>
  );
}
