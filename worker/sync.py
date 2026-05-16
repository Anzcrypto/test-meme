"""
Sync recent messages from configured Telegram channels into Supabase.
Only messages that have at least one reaction are stored.

Designed to be run on a schedule (GitHub Actions cron).
"""
from __future__ import annotations

import asyncio
import os
from datetime import timezone

from dotenv import load_dotenv
from supabase import create_client, Client
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import (
    MessageReactions,
    ReactionEmoji,
    ReactionCustomEmoji,
)

load_dotenv()

API_ID = int(os.environ["TG_API_ID"])
API_HASH = os.environ["TG_API_HASH"]
SESSION = os.environ["TG_SESSION"]
CHANNELS = [c.strip() for c in os.environ["TG_CHANNELS"].split(",") if c.strip()]
SYNC_LIMIT = int(os.environ.get("SYNC_LIMIT", "500"))

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def serialize_reactions(reactions: MessageReactions | None):
    """Return (count, list_of_dicts) for stored reactions."""
    if not reactions or not reactions.results:
        return 0, []
    out = []
    total = 0
    for r in reactions.results:
        emoji = None
        if isinstance(r.reaction, ReactionEmoji):
            emoji = r.reaction.emoticon
        elif isinstance(r.reaction, ReactionCustomEmoji):
            emoji = f"custom:{r.reaction.document_id}"
        else:
            emoji = str(r.reaction)
        out.append({"emoji": emoji, "count": r.count})
        total += r.count
    return total, out


def channel_link(channel_id: int, message_id: int) -> str:
    # Private channel ids start with -100; the t.me/c/ link strips that prefix.
    cid = str(channel_id)
    if cid.startswith("-100"):
        cid = cid[4:]
    return f"https://t.me/c/{cid}/{message_id}"


async def sync_channel(client: TelegramClient, channel_ref: str):
    entity = await client.get_entity(int(channel_ref) if channel_ref.lstrip("-").isdigit() else channel_ref)
    channel_id = getattr(entity, "id", None)
    # Telethon returns positive ids; Telegram public channel ids are -100<id>.
    if channel_id and not str(channel_id).startswith("-100"):
        channel_id = int(f"-100{channel_id}")
    channel_name = getattr(entity, "title", None) or getattr(entity, "username", None)

    print(f"[sync] channel={channel_name} id={channel_id} limit={SYNC_LIMIT}")

    rows = []
    async for msg in client.iter_messages(entity, limit=SYNC_LIMIT):
        count, reactions = serialize_reactions(msg.reactions)
        if count == 0:
            continue  # only keep messages with at least one reaction

        media_type = None
        if msg.photo:
            media_type = "photo"
        elif msg.video:
            media_type = "video"
        elif msg.document:
            media_type = "document"

        rows.append({
            "channel_id": channel_id,
            "channel_name": channel_name,
            "message_id": msg.id,
            "text": msg.message or "",
            "date": msg.date.astimezone(timezone.utc).isoformat(),
            "reactions_count": count,
            "reactions": reactions,
            "media_type": media_type,
            "link": channel_link(channel_id, msg.id),
        })

    if not rows:
        print("[sync] no reacted messages found")
        return

    # Upsert in batches
    BATCH = 200
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        supabase.table("messages").upsert(
            chunk,
            on_conflict="channel_id,message_id",
        ).execute()
    print(f"[sync] upserted {len(rows)} messages")


async def main():
    async with TelegramClient(StringSession(SESSION), API_ID, API_HASH) as client:
        for ch in CHANNELS:
            try:
                await sync_channel(client, ch)
            except Exception as e:
                print(f"[sync] ERROR for {ch}: {e}")


if __name__ == "__main__":
    asyncio.run(main())
