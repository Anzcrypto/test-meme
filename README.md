# Reacted Messages

Web Vercel yang menampilkan pesan dari channel **Telegram private** yang **dapat reaction (emot)**, dengan **search** kata kunci.

## Arsitektur

```
[Channel Telegram Private]
          │  (Telethon, akun pribadi)
          ▼
   worker/watch.py            ← real-time daemon di VPS (systemd)
   worker/sync.py --all       ← sekali jalan, backfill seluruh history
          │
          ▼
     Supabase (Postgres)      ← tabel `messages`
          │
          ▼
   web/ (Next.js, Vercel)     ← list + search bar
```

## Stack

- **worker/** — Python + [Telethon](https://docs.telethon.dev/)
  - `sync.py` — fetch pesan, filter yang punya reaction, upsert ke Supabase. Ada flag `--all` untuk full backfill.
  - `watch.py` — daemon real-time, dengerin event new-message & message-edited (reaction baru = edit event).
- **supabase/schema.sql** — schema `messages` + index full-text.
- **web/** — Next.js (App Router) di Vercel. Baca dari Supabase via API route.

---

## Setup di VPS (rekomendasi karena kamu punya VPS)

### 1. Bikin Supabase project

1. Daftar https://supabase.com → New Project (region Singapore, plan Free)
2. **SQL Editor** → tempel `supabase/schema.sql` → Run
3. **Project Settings → API** → catat:
   - Project URL
   - `anon public` key (untuk web)
   - `service_role` key (untuk worker)

### 2. Generate Telethon string session di laptop

Login Telegram butuh OTP, jadi lakukan di laptop **bukan di VPS**:

```bash
git clone https://github.com/Anzcrypto/test-meme.git
cd test-meme/worker
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Isi TG_API_ID & TG_API_HASH dulu
python login_helper.py
# Login pakai HP, copy STRING SESSION yang dicetak
```

### 3. Cari channel ID private

Forward 1 pesan dari channel private ke `@JsonDumpBot` → ambil `peer_id.channel_id` → channel ID = `-100<id>`.

### 4. Deploy worker ke VPS

SSH ke VPS, jalankan ini (asumsi Ubuntu/Debian):

```bash
# Install python
sudo apt update && sudo apt install -y python3 python3-venv git

# Bikin user khusus (opsional tapi recommended)
sudo useradd -m -s /bin/bash deploy

# Clone repo ke /opt
sudo git clone https://github.com/Anzcrypto/test-meme.git /opt/test-meme
sudo chown -R deploy:deploy /opt/test-meme

# Setup venv & deps
sudo -u deploy bash -c '
cd /opt/test-meme/worker
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
'

# Bikin .env (pakai editor pilihan kamu)
sudo -u deploy nano /opt/test-meme/worker/.env
# Isi semua variable: TG_API_ID, TG_API_HASH, TG_SESSION, TG_CHANNELS,
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
sudo chmod 600 /opt/test-meme/worker/.env
```

### 5. One-time backfill (semua history)

Channel kamu < 1000 pesan, sekali jalan udah selesai:

```bash
sudo -u deploy bash -c '
cd /opt/test-meme/worker
source venv/bin/activate
python sync.py --all
'
```

Cek di Supabase Table Editor → `messages` → harusnya udah penuh.

### 6. Pasang real-time watcher (systemd)

```bash
sudo cp /opt/test-meme/worker/reacted-watch.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now reacted-watch
sudo systemctl status reacted-watch          # cek hijau
sudo journalctl -u reacted-watch -f          # tail log
```

Mulai sekarang, setiap pesan baru / reaction baru auto-update Supabase.

### 7. Deploy web ke Vercel

```bash
# Di laptop (atau langsung dari Vercel dashboard import dari GitHub)
cd web
npm install
cp .env.example .env.local
# Isi NEXT_PUBLIC_SUPABASE_URL & NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev   # test http://localhost:3000
```

Di Vercel dashboard → Add New → Project → import repo:
- **Root Directory**: `web`
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Deploy.

---

## Maintenance

- **Lihat log watcher**: `sudo journalctl -u reacted-watch -f`
- **Restart**: `sudo systemctl restart reacted-watch`
- **Re-backfill** (kalau ada gap): `sudo -u deploy bash -c 'cd /opt/test-meme/worker && source venv/bin/activate && python sync.py --all'`
- **Update kode**: `cd /opt/test-meme && sudo -u deploy git pull && sudo systemctl restart reacted-watch`

## Troubleshooting

- **`AuthKeyDuplicatedError`** — string session dipakai di 2 tempat berbeda. Generate ulang `login_helper.py`.
- **Watcher nggak nangkep reaction** — Telegram kirim reaction sebagai event "edited message". Watcher udah nge-handle ini lewat `events.MessageEdited`.
- **Vercel build error** — pastikan Root Directory di Vercel di-set ke `web`.

## Catatan

- File `.github/workflows/sync.yml` masih ada sebagai **opsi fallback** kalau VPS down. Tinggal isi GitHub Secrets, dia bakal sync tiap 10 menit.
- Worker kasih akses Telegram **akun pribadi** kamu. Jangan share `TG_SESSION` atau commit `.env`.
