# AchiDrop

Telegram auksion + CS2 skin marketplace boti va mini-app'i. Jonli: **[achidrop.com](https://achidrop.com)**

Mini-App (React) + Express API Vercel'da ishlaydi; Telegram bot va worker'lar VPS'da (pm2) yuriydi; ma'lumotlar MongoDB'da.

## Monorepo strukturasi

```
.
├── frontend/          # React + Vite mini-app (Vercel → frontend/dist)
│   ├── src/           #   foydalanuvchi sahifalari
│   └── src/admin/     #   admin panel
│
├── backend/           # Barcha server-side Node.js kodi
│   ├── server.js      #   Express API (barcha /api/* endpointlar)
│   ├── database/      #   MongoDB ulanishi + model qatlami (db.js)
│   ├── data/          #   statik ma'lumot (stickerImages.json)
│   ├── steam.js       #   Steam inventar / narx (SteamApis + steamwebapi)
│   ├── *Manager.js    #   biznes-logika (bid, balance, trade, chat, support…)
│   ├── lisAutosell.js #   Lis-Skins autosell narxlari (egasining inventari)
│   ├── inventory-worker.js  # VPS worker: inventar ko'prigi (inventoryBridge)
│   └── …
│
├── bot/               # Telegram bot qatlami (Telegraf)
│   ├── index.js       #   bot kirish nuqtasi (npm start)
│   └── handlers/      #   buyruq/callback handlerlar → ../backend/'dan import
│
├── api/               # Vercel serverless adapteri
│   └── index.js       #   → backend/server'ni chaqiradi (ildizda turishi SHART)
│
├── tests/             # node --test birlik testlari → backend/ modullarini sinaydi
├── lis_autosell/      # (PC-only) Python Lis cookie; Vercel'ga yuklanmaydi
├── lisAutosellSync.js # (PC-only) Lis narxlarini Mongo orqali saytga sinxronlaydi
└── lis-sync.bat       # (PC-only) yuqoridagini ishga tushirgich
```

## Skriptlar

| Buyruq | Vazifa |
|---|---|
| `npm start` | Telegram botni ishga tushiradi (`bot/index.js`) — VPS pm2 |
| `npm run build:frontend` | Mini-app'ni quradi (Vercel shuni ishlatadi) |
| `npm test` | Birlik testlari (`node --test tests/*.test.js`) |

## Deploy

- **Web (Vercel):** `vercel --prod` (ildizdan). Build: `build:frontend` → `frontend/dist`. API: `api/index.js`.
- **Bot + worker (VPS, pm2):** `pm2 start bot/index.js` va `pm2 start backend/inventory-worker.js`.

## Maxfiy ma'lumot

Barcha kalitlar `.env` (gitignored) va Vercel/VPS muhit o'zgaruvchilarida — repoda hech qanday kalit yo'q.
