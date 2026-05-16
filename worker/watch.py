"""
Real-time watcher for VPS deployment.

Listens to:
- New messages in the configured channel(s)
- Edited messages (covers Telegram's "reactions changed" updates)

Both events are upserted into Supabase. Messages with zero reactions are skipped.
"""
from __future__ import annotations

import asyncio
import os

from dotenv import load_dotenv
from telethon import TelegramClient, events
from telethon.sessions import StringSession

from sync import (  # reuse helpers
    API_ID,
    API_HASH,
    SESSION,
    CHANNELS,
    message_to_row,
    resolve_channel,
    upsert_rows,
)


async def main():
    client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)
    await client.start()

    # Resolve once so event filters get proper entities
    entities = []
    for ch in CHANNELS:
        try:
            entity, channel_id, channel_name = await resolve_channel(client, ch)
            entities.append((entity, channel_id, channel_name))
            print(f"[watch] watching: {channel_name} ({channel_id})")
        except Exception as e:
            print(f"[watch] ERROR resolving {ch}: {e}")

    chat_filter = [e[0] for e in entities]
    id_to_meta = {e[1]: (e[2]) for e in entities}

    async def handle(msg, channel_id, channel_name):
        row = message_to_row(msg, channel_id, channel_name)
        if not row:
            # No reactions (yet). Still upsert as zero so an edit later updates it?
            # We chose to skip; reactions will trigger an edit event when added.
            return
        upsert_rows([row])
        print(f"[watch] upsert msg_id={msg.id} reactions={row['reactions_count']}")

    @client.on(events.NewMessage(chats=chat_filter))
    async def _new(event):
        # Resolve channel id from event
        cid = event.chat_id
        if cid and not str(cid).startswith("-100"):
            cid = int(f"-100{cid}")
        await handle(event.message, cid, id_to_meta.get(cid))

    @client.on(events.MessageEdited(chats=chat_filter))
    async def _edit(event):
        cid = event.chat_id
        if cid and not str(cid).startswith("-100"):
            cid = int(f"-100{cid}")
        await handle(event.message, cid, id_to_meta.get(cid))

    print("[watch] running. Ctrl+C to stop.")
    await client.run_until_disconnected()


if __name__ == "__main__":
    load_dotenv()
    asyncio.run(main())
