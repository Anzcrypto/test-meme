# Reacted Messages

Web Vercel yang menampilkan pesan dari channel **Telegram private** yang **dapat reaction (emot)**, dengan **search** kata kunci.

## Arsitektur (semua gratis)

```
[Channel Telegram Private]
          │  (Telethon, akun pribadi)
          ▼
   worker/sync.py            ← GitHub Actions cron tiap 10 menit
                              (sekali jalan dengan --all untuk backfill awal)
          │
          ▼
     Supabase (Postgres)     ← tabel `messages`
          │
          ▼
   web/ (Next.js, Vercel)    ← UI Google-style + search
```

| Komponen | Hosting | Biaya |
|---|---|---|
| Frontend Next.js | Vercel | Free |
| Database | Supabase | Free 500MB |
| Worker sync | GitHub Actions cron | Free 2000 menit/bulan |
| **Total** | | **Rp 0** |

---

## Setup step-by-step (~30 menit)

### 1. Bikin Supabase project

1. https://supabase.com → Sign in (pakai GitHub) → **New Project**
   - Region: **Singapore**
   - Plan: **Free**
2. Tunggu ~2 menit
3. Sidebar → **SQL Editor** → New query → tempel isi `supabase/schema.sql` → Run
4. Sidebar → **Project Settings → API** → catat:
   - Project URL
   - `anon public` key (untuk web)
   - `service_role` key (untuk worker, jangan di-expose ke frontend)

### 2. Generate Telethon string session (di laptop, sekali doang)

Login butuh OTP, jadi harus di komputer pribadi:

```bash
git clone https://github.com/Anzcrypto/test-meme.git
cd test-meme/worker
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Isi TG_API_ID & TG_API_HASH dulu
python login_helper.py
```

Login pakai HP, copy **string session** yang dicetak.

### 3. Cari channel ID private

Forward 1 pesan dari channel ke `@JsonDumpBot` → ambil `peer_id.channel_id` → channel ID = `-100<id>`.

### 4. (Opsional) Test worker lokal — backfill semua history

Channel kamu < 1000 pesan, sekali jalan langsung selesai:

```bash
# Lengkapi semua var di worker/.env
python sync.py --all
```

Cek di Supabase Table Editor → `messages` → harusnya udah ada data.

### 5. Pasang auto-sync via GitHub Actions

GitHub repo → **Settings → Secrets and variables → Actions** → New repository secret:

| Secret | Isi |
|---|---|
| `TG_API_ID` | dari my.telegram.org |
| `TG_API_HASH` | dari my.telegram.org |
| `TG_SESSION` | string session dari step 2 |
| `TG_CHANNELS` | `-1001234567890` |
| `SYNC_LIMIT` | `500` (opsional, default 500) |
| `SUPABASE_URL` | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |

Trigger pertama manual: **Actions** tab → `sync-telegram` → **Run workflow**. Setelah ini auto jalan tiap 10 menit.

> Untuk backfill via GitHub Actions, set `SYNC_LIMIT=2000` (atau lebih besar dari total pesan). Setelah backfill selesai bisa diturunin lagi ke `500` biar hemat.

### 6. Deploy web ke Vercel

1. https://vercel.com → Sign in pakai GitHub
2. **Add New → Project** → import repo `test-meme`
3. **Penting**: Root Directory = `web`
4. Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon, BUKAN service_role)
5. Deploy

---

## Catatan

- Worker fetch maks `SYNC_LIMIT` pesan terakhir per run; pesan dengan reaction baru ke-update karena `unique (channel_id, message_id)` + upsert.
- Kalau `--all` dipakai, fetch seluruh history channel.
- Reaction count yang berubah baru ke-capture saat next run cron (max delay ~10 menit). Cukup buat use case kamu.
- Channel private = pakai akun user, **jangan share `TG_SESSION`**.

## Struktur folder

```
test-meme/
├── web/                          Next.js (Vercel)
├── worker/                       Python sync
│   ├── sync.py                   ← support --all flag
│   ├── login_helper.py
│   └── requirements.txt
├── supabase/schema.sql
└── .github/workflows/sync.yml    ← cron tiap 10 menit
```

## Troubleshooting

- **GitHub Actions gagal `AuthKeyDuplicatedError`** — string session dipakai di 2 tempat. Generate ulang via `login_helper.py`.
- **Vercel build error** — pastikan Root Directory di-set ke `web`.
- **Pesan nggak muncul di web** — cek workflow run di tab Actions hijau, dan cek tabel `messages` di Supabase ada isi.
