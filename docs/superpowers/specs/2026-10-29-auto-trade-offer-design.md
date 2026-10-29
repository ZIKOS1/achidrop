# Skin sotish: bot avtomatik trade offer yuboradi — dizayn

Sana: 2026-10-29. Holat: foydalanuvchi tasdig'ini kutmoqda.

## Nima uchun

Hozir foydalanuvchi skin tanlab "Sotish"ni bosgach, Steam'da botga trade'ni
O'ZI yuboradi ("Skinni yubordim"). Bunda adashish (boshqa skin, boshqa akkaunt)
va soxta-bot firibgarligi xavfi bor. Maqsad: "Sotish"dan keyin bot akkaunti
foydalanuvchiga tayyor trade offer yuborsin — foydalanuvchi faqat Steam'da
"Qabul qilish"ni bossin.

## Maqsadlar

1. "Sotish" bosilgach, bot akkauntidan foydalanuvchiga trade offer ketadi:
   tanlangan skinlar botga, bot hech narsa bermaydi. Bitta "Sotish" (groupId)
   = bitta offer.
2. Offer izohi: `AchiDrop #<groupId>` — saytdagi so'rov raqami bilan bir xil,
   foydalanuvchi solishtira oladi. Saytda ham "Trade izohida #<groupId>
   bo'lishi kerak, boshqasini qabul qilmang" ogohlantirishi.
3. Offer 1 soat ichida qabul qilinmasa — bot uni bekor qiladi va so'rov
   avtomatik `rejected` (sabab: "Trade 1 soat ichida qabul qilinmadi").
   Foydalanuvchi rad etsa / Steam bekor qilsa / skin yo'qolsa (InvalidItems)
   — ham darhol `rejected` (tegishli sabab bilan).
4. Offer qabul qilinsa — so'rov `awaiting_admin` da QOLADI, faqat
   `tradeOffer.state = "accepted"` belgilanadi va adminga Telegram xabari
   ("Trade qabul qilindi, skin botda"). Admin panelda shu belgi ko'rinadi.
5. Admin panelda "Trade akkaunt" bo'limi: login + parol + Steam Guard kodi →
   "Ulash". Holat (ulangan akkaunt nomi, Steam ID, qachondan, kalit amal
   qilish muddati, oxirgi xato), "Uzish" tugmasi. Istalgan payt boshqa
   akkauntga almashtirish mumkin.
6. Foydalanuvchi bir marta o'z Steam trade havolasini kiritadi (Skin sotish
   sahifasida; "havolani qayerdan olish" havolasi bilan:
   https://steamcommunity.com/my/tradeoffers/privacy).

## Maqsad emas

- Pul AVTOMATIK tushmaydi — admin "Oldim"ni bosishi shart (foydalanuvchi
  qarori). Avto-kredit qo'shilmasin.
- Bot hech qachon skin BERMAYDI (faqat oladi) — mobile confirmation /
  identity_secret kerak emas, qo'shilmasin.
- Alohida steam-relay qayta yoqilmaydi.

## Anti-maqsadlar (texnik ishlasa ham muvaffaqiyatsizlik)

- Steam paroli biror joyda (Mongo, log, .env) saqlanib qolsa.
- Trade offer foydalanuvchining ULANGAN Steam akkauntidan boshqa akkauntga
  ketsa (trade havola egasi ≠ user.steamId64).
- Trade akkaunt ulanmagan/ishlamay qolganda Skin sotish butunlay to'xtab qolsa
  — eski qo'lda usul ishlashda davom etishi shart.
- Bitta "Sotish" uchun ikki marta offer ketsa.

## Cheklovlar va mavjud holat

- Sayt Vercel'da; Steam steamcommunity.com'ga Vercel IP'larini bloklaydi
  (inventar tajribasi). Shu sabab Steam bilan BARCHA ish (login, offer
  yuborish, holat kuzatish) VPS'dagi bot jarayonida (`bot/index.js`, pm2
  `auction-bot`) bo'ladi. Vercel ↔ bot aloqasi Mongo hujjatlari orqali —
  `backend/inventoryBridge.js` naqshi (alohida hujjatlar, polling).
- `steamcommunity` va `steam-user` (ichida `steam-session`) allaqachon
  dependency. `steam-tradeoffer-manager` qo'shilishi mumkin.
- Mongo yozuvlari `backend/database/db.js` orqali (v-versiya; readTxWhere/
  updateTx). Har bir yozuvchi jarayon shu db.js'ni ishlatadi.
- So'rovlar: `backend/instantSellManager.js`, har item alohida request,
  bitta sotish = bitta `groupId`. Statuslar: awaiting_admin | credited |
  rejected. `rejectSellRequest(id, reason)` mavjud.
- Mavjud qo'lda oqim (`botTradeUrl`, "Skinni yubordim" → `/api/instant-sell/sent`)
  saqlanadi — fallback sifatida.
- Bot deploy: `git archive` → user `!` orqali scp + `pm2 restart`. Deploydan
  oldin `npm run check:bot` va handlerlarni require qilib tekshirish.
  VPS'da yangi dependency bo'lsa `npm install --omit=dev`.

## Foydalanuvchi qarorlari (o'zgartirilmasin)

- Pul avtomatik tushmaydi; admin "Oldim".
- Qabul qilinmagan offer 1 soatda o'zi bekor bo'ladi.
- Login to'liq admin panel orqali (login, parol, Steam Guard kodi), akkauntni
  istalgan payt almashtirish mumkin.
- Steam Guard o'chirilmaydi.

## Oqimlar

### A. Trade akkauntni ulash (admin panel)
1. Admin: login, parol, Steam Guard kodi → `POST /api/admin/trade-account/login`.
2. Vercel parolni `TRADE_ACCOUNT_KEY` (env, Vercel + VPS'da bir xil, 32 bayt)
   bilan AES-256-GCM shifrlab `tradeLoginReq` hujjatiga yozadi va natijani
   ~25s kutadi (inventoryBridge kabi).
3. Bot hujjatni o'qiydi va DARHOL o'chiradi; 60s dan eski so'rov tashlanadi.
   `steam-session` LoginSession (WebBrowser platformasi),
   `startWithCredentials({ accountName, password, steamGuardCode })`.
   Muvaffaqiyat → refreshToken shifrlab `tradeAccount` hujjatiga:
   `{ accountName, steamId64, refreshTokenEnc, connectedAt, tokenExpiresAt,
   lastError:null }`; natija `tradeLoginRes` ga (xatoda tushunarli o'zbekcha
   xabar: "Parol yoki kod noto'g'ri", "Kod eskirgan" va h.k.).
4. "Uzish" → `tradeAccount` o'chiriladi, bot sessiyani yopadi.
5. Bot ishga tushganda va har ~X daqiqada `tradeAccount` dan refresh token
   bilan web cookie oladi (sessiya yangilanishi). Token eskirsa/rad etilsa →
   `lastError`, adminga Telegram xabari "Trade akkauntga qayta kiring".

### B. Sotish → offer
1. `POST /api/instant-sell` hozirgidek request(lar) yaratadi. Agar
   `tradeAccount` ulangan VA userda tekshirilgan `steamTradeUrl` bo'lsa —
   har requestga `tradeOffer: { state: "queued", groupId }`.
2. Bot (interval) `queued` guruhlarni oladi → bitta offer: itemsToReceive =
   guruhdagi assetId'lar (appid 730, contextid 2), message `AchiDrop #groupId`.
   Natija: `state: "sent", offerId, sentAt` yoki xato → `state: "failed",
   error`. Idempotentlik: yuborishdan OLDIN state'ni `sending` ga atomik
   o'tkazish (faqat `queued` dan), qayta ishga tushganda `sending` qolib
   ketganlarni Steam'dagi offer ro'yxatidan izoh bo'yicha tekshirish yoki
   failed deb belgilash — ikki marta offer ketmasin.
3. Frontend "Mening so'rovlarim"da holat: "Trade yuborildi — Steam'da qabul
   qiling (izoh: AchiDrop #…)", Steam offerga havola
   (https://steamcommunity.com/tradeoffer/<offerId>/). `failed` yoki trade
   akkaunt yo'q → eski qo'lda ko'rsatma (botTradeUrl + "Skinni yubordim").
4. Bot offer holatini kuzatadi (polling): Accepted → `accepted` + admin xabari;
   Declined/Canceled/Expired/InvalidItems/Countered → request(lar)
   `rejectSellRequest` + `tradeOffer.state` mos; Active va sentAt+1 soat
   o'tgan → offer cancel → `expired` + reject.
   Escrow (hold) holati → `accepted` deb hisoblanmasin, admin xabarida
   ko'rsatilsin.

### C. Foydalanuvchi trade havolasi
- Bitta Steam akkauntning trade havolasi faqat BITTA AchiDrop akkauntiga ulanadi (foydalanuvchi qarori, 2026-10-29) — boshqasida bo'lsa rad.
- `user.steamTradeUrl`. Saqlashda tekshiriladi: format
  `https://steamcommunity.com/tradeoffer/new/?partner=<n>&token=<t>`,
  `partner + 76561197960265728 === user.steamId64` bo'lmasa rad.
- Skin sotish sahifasida (Steam ulangan bo'lsa) maydon + saqlash; bot ham
  (Telegram) ko'rsatma bersa yaxshi, majburiy emas.

## Claude qarorlari (foydalanuvchi tekshiradi)
- Trade havolasi kiritilmagan user "Sotish"ni bossa — so'rov yaratiladi,
  havola kiritish taklif qilinadi; kiritmaguncha eski qo'lda usul ko'rsatiladi.
- Admin "Oldim"ni trade hali qabul qilinmagan so'rovga ham bosa oladi
  (qo'lda oqim ham bor), lekin admin panelda "Trade hali qabul qilinmagan"
  ogohlantirishi ko'rinadi.
- Parol faqat shifrlangan, bir martalik `tradeLoginReq` hujjatida (≤60s,
  bot o'qishi bilan o'chiriladi) — boshqa hech qayerda.
- Telefonda "tasdiqlash" (kodsiz) usuli birinchi versiyada YO'Q — faqat kod.
- Login va offer VPS IP'sidan; steamcommunity 429 bersa offer `failed` →
  eski qo'lda usul (avtomatik qayta urinish 1 marta).

## Builderga qoldirilgan
- Polling intervallari, `steam-tradeoffer-manager` yoki to'g'ridan-to'g'ri
  `steamcommunity` HTTP ishlatish.
- Admin panel bo'limining joyi (AdminSell sahifasi ichida tavsiya).
- Xato matnlarining aniq so'zlari (o'zbekcha, qisqa).
- Testlar: trade havola validatsiyasi, state o'tishlari (queued→sending→sent→
  accepted/rejected/expired), 1 soat bekor qilish, idempotentlik, shifrlash.

## Tekshirish (qabul mezonlari)
- Admin panelda haqiqiy bot akkaunt ulanadi, holat "ulangan" ko'rinadi.
- Test foydalanuvchi bitta arzon skin sotadi → Steam'da `AchiDrop #<id>`
  izohli offer keladi; qabul qilganda admin xabar oladi va skin bot
  inventarida; admin "Oldim" bilan pul tushadi.
- Qabul qilinmagan offer 1 soatdan keyin Steam'da bekor, saytda "rad etildi".
- Trade akkaunt uzilganda sotish eski qo'lda usulda ishlaydi.
