# Reacted Messages

Web Vercel yang menampilkan pesan dari channel **Telegram private** yang **mendapat reaction (emot)**, lengkap dengan **search** kata kunci.

## Arsitektur

```
[Channel Telegram Private]
          │  (Telethon, akun pribadi)
          ▼
   worker/sync.py            ← GitHub Actions cron tiap 10 menit
          │
          ▼
     Supabase (Postgres)     ← tabel `messages`
          │
          ▼
   web/ (Next.js, Vercel)    ← list + search bar
```

## Stack

- **worker/** — Python + [Telethon](https://docs.telethon.dev/) yang nge-fetch pesan terbaru dari channel, filter yang punya reaction, dan upsert ke Supabase. Dijalankan via GitHub Actions cron.
- **supabase/** — schema SQL untuk tabel `messages` (full-text search index).
- **web/** — Next.js (App Router) di-deploy ke Vercel. Baca dari Supabase via API route.

---

## Setup step-by-step

### 1. Bikin akun Supabase (gratis)

1. Daftar di https://supabase.com → New Project.
2. Catat **Project URL** dan dua API keys di **Project Settings → API**:
   - `anon public` (untuk web)
   - `service_role` (untuk worker, **JANGAN** di-expose ke frontend)
3. Buka **SQL Editor** → tempel isi `supabase/schema.sql` → Run.

### 2. Generate Telethon string session

Di komputer lokal kamu (sekali aja):

```bash
cd worker
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Isi TG_API_ID + TG_API_HASH dulu di .env
python login_helper.py
```

Login pakai nomor HP, terus copy string yang dicetak ke `TG_SESSION` di `.env`.

### 3. Cari ID channel private

Di Telegram desktop: forward sebuah pesan dari channel ke bot `@JsonDumpBot` → lihat field `peer_id.channel_id` → ID-nya `-100<channel_id>`.

Isi `TG_CHANNELS=-1001234567890` di `.env`. Untuk multi-channel pisahkan koma.

### 4. Test worker lokal

```bash
# Lengkapi semua var di worker/.env (termasuk SUPABASE_URL & SERVICE_ROLE_KEY)
python sync.py
```

Cek di Supabase → Table Editor → `messages` harusnya udah ada datanya.

### 5. Deploy web ke Vercel

```bash
cd web
npm install
cp .env.example .env.local
# Isi NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev   # test lokal
```

Push repo ke GitHub, lalu di Vercel:

1. Import repo, **Root Directory: `web`**.
2. Tambah environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy.

### 6. Pasang sync otomatis (GitHub Actions)

Di GitHub repo → **Settings → Secrets and variables → Actions** → tambah:

| Secret | Isi |
|---|---|
| `TG_API_ID` | dari my.telegram.org |
| `TG_API_HASH` | dari my.telegram.org |
| `TG_SESSION` | string session dari step 2 |
| `TG_CHANNELS` | `-1001234567890` |
| `SYNC_LIMIT` | `500` (opsional) |
| `SUPABASE_URL` | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |

Workflow `.github/workflows/sync.yml` akan jalan otomatis tiap 10 menit. Bisa juga di-trigger manual di tab **Actions**.

---

## Catatan & batasan

- Worker fetch maksimum `SYNC_LIMIT` pesan terakhir per run; pesan dengan reaction baru akan ke-update karena ada `unique (channel_id, message_id)` + upsert.
- Untuk **backfill seluruh history**, jalankan `sync.py` dengan `SYNC_LIMIT` yang besar sekali secara manual.
- Custom emoji disimpan sebagai `custom:<document_id>`; UI tampilkan label `custom`. Bisa di-improve nanti.
- Channel private = pakai akun user, bukan bot. **Jangan share string session-nya**.
- Kalau channel-nya bisa di-akses pakai bot (bot di-add sebagai admin), bisa diubah ke Bot API + webhook (lebih simple, tapi nggak bisa baca history lama).

---

## Struktur folder

```
test-meme/
├── web/                          Next.js (Vercel)
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── api/messages/route.ts
│   ├── lib/supabase.ts
│   └── ...
├── worker/                       Python sync
│   ├── sync.py
│   ├── login_helper.py
│   └── requirements.txt
├── supabase/schema.sql
└── .github/workflows/sync.yml
```
