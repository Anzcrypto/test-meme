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
// Whitelist group / supergroup chat IDs (negative numbers, mis. -1001234567890).
const ALLOWED_CHATS = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || "")
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

function reply(
  chatId: number,
  text: string,
  opts: { html?: boolean; replyTo?: number } = {}
) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    ...(opts.html
      ? { parse_mode: "HTML", disable_web_page_preview: true }
      : {}),
    ...(opts.replyTo ? { reply_to_message_id: opts.replyTo } : {}),
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
  "<b>Cara pakai:</b>\n" +
  "Kirim <i>kata kunci</i> langsung \u2014 hasil otomatis muncul.\n\n" +
  "<b>Command:</b>\n" +
  "<code>/s kata kunci</code> atau <code>/search kata kunci</code>\n" +
  "<code>/s</code> \u2014 10 pesan terbaru\n" +
  "<code>/h</code> atau <code>/help</code> \u2014 bantuan";

async function handleSearch(
  chatId: number,
  q: string,
  replyTo?: number
) {
  await tg("sendChatAction", { chat_id: chatId, action: "typing" });

  let result;
  try {
    result = await searchMessages(q);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await reply(chatId, `\u26a0\ufe0f Error: ${msg}`, { replyTo });
    return;
  }

  if (result.data.length === 0) {
    await reply(
      chatId,
      q ? `Tidak ada hasil untuk "${q}".` : "Belum ada pesan.",
      { replyTo }
    );
    return;
  }

  const header = q
    ? `<b>${result.count}</b> hasil untuk "<i>${escapeHtml(q)}</i>" (menampilkan ${result.data.length})`
    : `<b>${result.data.length}</b> pesan terbaru`;

  const body = [header, ...result.data.map((m, i) => formatMessage(m, i + 1))]
    .join("\n\n");

  const safe = body.length > TG_LIMIT ? body.slice(0, TG_LIMIT) + "\n\u2026" : body;
  await reply(chatId, safe, { html: true, replyTo });
}

/* ------------ Helpers ------------ */

/**
 * Strip leading `/cmd` and optional `@botname`. Returns null kalau bukan command yg dimaksud.
 * "/search foo" -> "foo"
 * "/search@MyBot foo" -> "foo"
 * "/search" -> ""
 * "foo" -> null
 */
function matchCommand(text: string, cmd: string): string | null {
  const m = text.match(/^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  if (m[1].toLowerCase() !== cmd.toLowerCase()) return null;
  return (m[2] || "").trim();
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
  // Tangani edited message juga supaya kalau user ngedit query, bot ikut respond
  const msg = update?.message || update?.edited_message;
  if (!msg) return NextResponse.json({ ok: true });

  const chatId: number | undefined = msg.chat?.id;
  const chatType: string | undefined = msg.chat?.type;
  const fromId: number | undefined = msg.from?.id;
  const messageId: number | undefined = msg.message_id;
  const text: string = (msg.text || "").trim();

  if (!chatId || !text) return NextResponse.json({ ok: true });

  const isPrivate = chatType === "private";
  const isGroup = chatType === "group" || chatType === "supergroup";

  // Debug helper: echo chat info. Bypasses whitelist on purpose so kamu bisa
  // dapetin chat ID buat di-set di TELEGRAM_ALLOWED_CHAT_IDS.
  if (matchCommand(text, "chatid") !== null) {
    await reply(
      chatId,
      `chat.id: <code>${chatId}</code>\n` +
        `chat.type: <code>${chatType}</code>\n` +
        `from.id: <code>${fromId}</code>`,
      { html: true, replyTo: messageId }
    );
    return NextResponse.json({ ok: true });
  }

  // 2. Authorization
  if (isPrivate) {
    if (
      ALLOWED_USERS.length === 0 ||
      !ALLOWED_USERS.includes(String(fromId))
    ) {
      await reply(chatId, `\u{1F512} Akses ditolak. User ID kamu: ${fromId}`);
      return NextResponse.json({ ok: true });
    }
  } else if (isGroup) {
    // Group harus di-whitelist by chat ID. Bot diem aja kalau gak — gak nyepam.
    if (!ALLOWED_CHATS.includes(String(chatId))) {
      console.log(`[telegram] ignored group chat ${chatId}`);
      return NextResponse.json({ ok: true });
    }
  } else {
    // channel / lainnya: ignore
    return NextResponse.json({ ok: true });
  }

  // 3. Routing
  // /help, /h, /start
  if (
    matchCommand(text, "help") !== null ||
    matchCommand(text, "h") !== null ||
    matchCommand(text, "start") !== null
  ) {
    await reply(chatId, HELP_TEXT, { html: true, replyTo: isGroup ? messageId : undefined });
    return NextResponse.json({ ok: true });
  }

  // /search [query] or /s [query]
  const searchArg = matchCommand(text, "search") ?? matchCommand(text, "s");
  if (searchArg !== null) {
    await handleSearch(chatId, searchArg, isGroup ? messageId : undefined);
    return NextResponse.json({ ok: true });
  }

  // Plain text: hanya di private chat. Di group, biar gak nyepam, harus pake /search.
  if (isPrivate && !text.startsWith("/")) {
    await handleSearch(chatId, text);
    return NextResponse.json({ ok: true });
  }

  // Private + slash command tak dikenal -> kasih hint
  if (isPrivate) {
    await reply(chatId, "Ketik kata kunci buat nyari, atau /help.", { html: true });
  }
  return NextResponse.json({ ok: true });
}
