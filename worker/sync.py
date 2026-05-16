"""
Sync messages from configured Telegram channels into Supabase.
Only messages that have at least one reaction are stored.

Modes:
    python sync.py            -> fetch the most recent SYNC_LIMIT messages
    python sync.py --all      -> fetch the entire channel history (one-time backfill)

Designed to be run on a schedule, manually for backfill, or by watch.py.
"""
from __future__ import annotations

import argparse
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


def message_to_row(msg, channel_id: int, channel_name: str | None):
    """Return a dict ready to upsert, or None if msg has no reactions."""
    count, reactions = serialize_reactions(msg.reactions)
    if count == 0:
        return None

    media_type = None
    if msg.photo:
        media_type = "photo"
    elif msg.video:
        media_type = "video"
    elif msg.document:
        media_type = "document"

    return {
        "channel_id": channel_id,
        "channel_name": channel_name,
        "message_id": msg.id,
        "text": msg.message or "",
        "date": msg.date.astimezone(timezone.utc).isoformat(),
        "reactions_count": count,
        "reactions": reactions,
        "media_type": media_type,
        "link": channel_link(channel_id, msg.id),
    }


async def resolve_channel(client: TelegramClient, channel_ref: str):
    entity = await client.get_entity(
        int(channel_ref) if channel_ref.lstrip("-").isdigit() else channel_ref
    )
    channel_id = getattr(entity, "id", None)
    if channel_id and not str(channel_id).startswith("-100"):
        channel_id = int(f"-100{channel_id}")
    channel_name = getattr(entity, "title", None) or getattr(entity, "username", None)
    return entity, channel_id, channel_name


def upsert_rows(rows: list[dict]):
    if not rows:
        return
    BATCH = 200
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        supabase.table("messages").upsert(
            chunk,
            on_conflict="channel_id,message_id",
        ).execute()


async def sync_channel(client: TelegramClient, channel_ref: str, *, fetch_all: bool = False):
    entity, channel_id, channel_name = await resolve_channel(client, channel_ref)
    limit = None if fetch_all else SYNC_LIMIT
    print(f"[sync] channel={channel_name} id={channel_id} limit={'ALL' if fetch_all else limit}")

    rows = []
    async for msg in client.iter_messages(entity, limit=limit):
        row = message_to_row(msg, channel_id, channel_name)
        if row:
            rows.append(row)

    if not rows:
        print("[sync] no reacted messages found")
        return

    upsert_rows(rows)
    print(f"[sync] upserted {len(rows)} messages")


async def main(fetch_all: bool):
    async with TelegramClient(StringSession(SESSION), API_ID, API_HASH) as client:
        for ch in CHANNELS:
            try:
                await sync_channel(client, ch, fetch_all=fetch_all)
            except Exception as e:
                print(f"[sync] ERROR for {ch}: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="Fetch entire channel history")
    args = parser.parse_args()
    asyncio.run(main(fetch_all=args.all))
