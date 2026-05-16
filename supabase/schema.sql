-- Schema for Telegram channel messages with reactions
-- Run this in Supabase SQL Editor once.

create table if not exists messages (
    id              bigserial primary key,
    channel_id      bigint       not null,
    channel_name    text,
    message_id      bigint       not null,
    text            text,
    date            timestamptz  not null,
    reactions_count integer      not null default 0,
    reactions       jsonb        not null default '[]'::jsonb,
    media_type      text,                 -- 'photo' | 'video' | 'document' | null
    media_url       text,                 -- optional, hosted thumbnail
    link            text,                 -- t.me/c/<channel>/<message_id>
    raw             jsonb,                -- original payload for debugging
    created_at      timestamptz  not null default now(),
    updated_at      timestamptz  not null default now(),
    unique (channel_id, message_id)
);

-- Full-text search index (English + simple, multilingual works decently with 'simple')
create index if not exists messages_fts_idx
    on messages using gin (to_tsvector('simple', coalesce(text, '')));

-- Common filters
create index if not exists messages_date_idx on messages (date desc);
create index if not exists messages_reactions_count_idx on messages (reactions_count desc);

-- Trigger to keep updated_at fresh
create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists messages_updated_at on messages;
create trigger messages_updated_at
    before update on messages
    for each row execute function set_updated_at();
