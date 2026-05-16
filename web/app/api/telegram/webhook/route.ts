import { NextRequest, NextResponse } from "next/server";
import { supabase, type Message } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const RESULT_LIMIT = 10;
const TEXT_TRUNCATE = 280;
const TG_LIMIT = 4000; // Telegram caps at 4096; leave headroom

/* ------------ Telegram helpers ------------ */

async function tg(method: string, payload: Record<string, unknown>) {
  if (!BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    return;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      console.error(`tg ${method} failed:`, res.status, await res.text());
    }
  } catch (e) {
    console.error(`tg ${method} threw:`, e);
  }
}

function reply(chatId: number, text: string, html = false) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    ...(html ? { parse_mode: "HTML", disable_web_page_preview: true } : {}),
  });
}

/* ------------ Formatting ------------ */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatReactions(m: Message): string {
  if (!m.reactions?.length) return "";
  return m.reactions
    .map((r) => {
      const emoji = r.emoji?.startsWith("custom:") ? "\u2605" : r.emoji;
      return `${emoji} ${r.count}`;
    })
    .join("  ");
}

function formatMessage(m: Message, idx: number): string {
  const channel = escapeHtml(m.channel_name || String(m.channel_id));
  const head = `<b>${idx}.</b> ${channel} \u00b7 <i>${formatDate(m.date)}</i>`;
  const body = m.text
    ? escapeHtml(truncate(m.text, TEXT_TRUNCATE))
    : `<i>(${m.media_type || "no text"})</i>`;
  const reactions = formatReactions(m);
  const link = m.link ? `<a href="${m.link}">\u{1F517} Buka di Telegram</a>` : "";
  return [head, body, reactions, link].filter(Boolean).join("\n");
}

/* ------------ Search ------------ */

async function searchMessages(q: string) {
  let query = supabase
    .from("messages")
    .select("*", { count: "exact" })
    .order("date", { ascending: false })
    .range(0, RESULT_LIMIT - 1);
  if (q) query = query.ilike("text", `%${q}%`);
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { data: (data || []) as Message[], count: count || 0 };
}

/* ------------ Routing ------------ */

const HELP_TEXT =
  "<b>Garapan Bot</b>\n" +
  "Cari pesan ber-reaction dari channel.\n\n" +
  "<b>Command:</b>\n" +
  "<code>/search kata kunci</code> \u2014 cari pesan\n" +
  "<code>/search</code> \u2014 10 pesan terbaru\n" +
  "<code>/help</code> \u2014 bantuan";

async function handleSearch(chatId: number, q: string) {
  await tg("sendChatAction", { chat_id: chatId, action: "typing" });

  let result;
  try {
    result = await searchMessages(q);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await reply(chatId, `\u26a0\ufe0f Error: ${msg}`);
    return;
  }

  if (result.data.length === 0) {
    await reply(
      chatId,
      q ? `Tidak ada hasil untuk "${q}".` : "Belum ada pesan."
    );
    return;
  }

  const header = q
    ? `<b>${result.count}</b> hasil untuk "<i>${escapeHtml(q)}</i>" (menampilkan ${result.data.length})`
    : `<b>${result.data.length}</b> pesan terbaru`;

  const body = [header, ...result.data.map((m, i) => formatMessage(m, i + 1))]
    .join("\n\n");

  const safe = body.length > TG_LIMIT ? body.slice(0, TG_LIMIT) + "\n\u2026" : body;
  await reply(chatId, safe, true);
}

/* ------------ Webhook handler ------------ */

export async function POST(req: NextRequest) {
  // 1. Verify secret token
  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  if (!msg) return NextResponse.json({ ok: true });

  const chatId: number | undefined = msg.chat?.id;
  const chatType: string | undefined = msg.chat?.type;
  const fromId: number | undefined = msg.from?.id;
  const text: string = (msg.text || "").trim();

  if (!chatId) return NextResponse.json({ ok: true });

  // 2. Only allow private chats
  if (chatType !== "private") {
    return NextResponse.json({ ok: true });
  }

  // 3. Whitelist
  if (
    ALLOWED_USERS.length === 0 ||
    !ALLOWED_USERS.includes(String(fromId))
  ) {
    await reply(
      chatId,
      `\u{1F512} Akses ditolak. User ID kamu: ${fromId}`
    );
    return NextResponse.json({ ok: true });
  }

  // 4. Route command
  if (text === "/start" || text === "/help") {
    await reply(chatId, HELP_TEXT, true);
    return NextResponse.json({ ok: true });
  }

  if (text === "/search" || text.toLowerCase().startsWith("/search ")) {
    const q = text.slice(7).trim();
    await handleSearch(chatId, q);
    return NextResponse.json({ ok: true });
  }

  // Unknown / plain text
  await reply(
    chatId,
    "Pakai <code>/search kata kunci</code> untuk mencari, atau /help.",
    true
  );
  return NextResponse.json({ ok: true });
}
