# Lis-Skins narxlash + Autosell (ko'p skin) — Dizayn

Sana: 2026-10-14 · Branch: `feature/market-redesign` · Oldingi spec: `2026-09-13-market-redesign-design.md`

## 1. Maqsad (foydalanuvchi bilan kelishilgan)

- **Market** — faqat BIZNING e'lonlar (admin qo'ygan + autosell orqali olingan skinlar). Lis-Skins katalogi Marketga QO'SHILMAYDI, Lis-Skins orqali xarid qilinmaydi.
- Market e'lon narxi Lis-Skins narxidan avtomatik: **Lis $ × kurs × (1 + ustama%)**, har soatda yangilanadi.
- **Autosell** — odam o'z Steam inventaridan bir yoki bir nechta skinni belgilab, Lis narxidan arzonroq narxda darhol sotadi: **Lis $ × kurs × (1 − marja%)**.
- Hammasi **ham Telegram miniapp'da, ham saytda** ishlaydi (ikkalasi bitta React ilova — `miniapp/`).
- Lis-Skins API kaliti hozir yo'q — kod hozir yoziladi, kalit `.env`ga qo'shilganda o'zi ishga tushadi.

## 2. Narx manbai — `lisSkinsPrice.js` (o'zgartiriladi)

- Yangi funksiya `fetchLisPricesUsd(names: string[]) → Map<marketHashName, usd|null>`:
  - Lis API `market/search`ga `names[]` ro'yxati bilan **bitta (yoki sahifalangan bir nechta) so'rov**, har bir nom uchun eng past narx olinadi. Har skin uchun alohida so'rov YO'Q.
  - Natija nom bo'yicha keshlanadi (topilgan narx — 1 soat, topilmagan — 1 daqiqa, mavjud qoida).
  - NaN/manfiy/0 narx → `null` (mavjud himoya saqlanadi).
- Narx **skin turi** bo'yicha: `market_hash_name` = nom + wear (float oralig'i). Bir xil turdagi skinlarning hammasi bir xil narx oladi.
- Mavjud `getInstantSellPriceSom` / `getListPriceSom` yangi batch funksiya ustiga quriladi; `getListPriceSom` endi **ustama%**ni qo'shadi.
- Kalit yo'q bo'lsa: `isLisConfigured() → false`; narx funksiyalari xato tashlamaydi, `null` qaytaradi va chaqiruvchilar "o'chiq" holatga o'tadi.
- Haqiqiy API javob shakli (`data[]`/`items[]`, `price` maydoni, `names[]` parametri nomi) kalit kelgach tasdiqlanadi — hozirgi kod taxminiy shaklga yozilgan, bu ochiq risk.

## 3. Market e'lon narxlari

### Ma'lumot modeli
Market e'loni (`trades`, `kind: "market"`) ga yangi maydonlar:
- `priceMode: "auto" | "pinned"` — yo'q bo'lsa `"pinned"` deb hisoblanadi (eski e'lonlar o'zgarmaydi).
- `marketHashName` — e'lon yaratilganda skin'dan hosil qilinadi (`skinUtils.marketHashName`).
- `priceUpdatedAt` — oxirgi avto-yangilanish vaqti.
- `costSom` — skin bizga necha so'mga tushgani (ixtiyoriy). Autosell orqali olingan skin uchun avtomatik — odamga to'langan summa (ko'p skinli so'rovda har item o'z `priceSom`i). Boshqa yo'l bilan qo'shilgan skinlarda yo'q; admin xohlasa qo'lda kiritadi.

### Minimal foyda qoidasi (olingan narxdan arzon sotilmaydi)
- `costSom` bo'lsa: **narx ≥ costSom × (1 + minFoyda%)**, bu yerda `minFoyda%` pog'ona bo'yicha olinadi — pog'ona `costSom / kurs` ($) bo'yicha tanlanadi.
- Standart pog'onalar (admin panelda tahrirlanadi): **≤ 10$ → 15%**, **10–50$ → 10%**, **> 50$ → 7%**.
- Avto narx = `max(MIN_TRADE_PRICE, Lis × kurs × (1 + ustama%), costSom × (1 + minFoyda%))`, so'mga yaxlitlanadi (yuqoriga).
- Qoida **qotirilgan (pinned) narxlarga ham** qo'llanadi: admin `costSom × (1 + minFoyda%)` dan past narx kiritsa, server rad etadi va minimal ruxsat etilgan narxni ko'rsatadi.
- Bulk-list taklif narxi ham shu formula bilan hisoblanadi.

### Avto-yangilash (bot jarayoni, `index.js` setInterval, har 60 daqiqa)
1. `refresh("trades")`, barcha `status: "open"`, `priceMode: "auto"` e'lonlar olinadi.
2. Noyob `marketHashName`lar bitta batch so'rov bilan narxlanadi.
3. Har bir e'lon uchun yangi narx — yuqoridagi "Avto narx" formulasi (minimal foyda qoidasi bilan).
4. Yozish **tranzaksiya ichida**, faqat e'lon hali `open` bo'lsa (xarid bilan to'qnashuvdan himoya). Odam xaridni bosgan paytdagi narxda sotib oladi.
5. Lis narx bermasa (topilmadi/API xato) — eski narx qoladi.
6. Natija `settings.lisPriceSync = { at, updated, skipped, error }` ga yoziladi (admin holat qatori uchun).
7. Reentrancy guard (`_running`), mavjud polling naqshlari kabi.

### Admin panel
- Bulk-list: taklif narxi = Lis + ustama. Admin taklifni o'zgartirmasa → `auto`; o'zgartirsa → `pinned`.
- Market e'lonlari ro'yxatida: rejim belgisi (Avto/Qotirilgan), narxni qo'lda o'zgartirish (→ `pinned`), "Avtoga qaytarish" tugmasi.
- Nakleyka yoki breloki bor skinlar yonida ⚠ belgisi — admin ularni qo'lda narxlashi uchun eslatma (avtomatik ajratilmaydi, qaror adminniki). Brelok ma'lumoti relay javobida bo'lsagina ko'rsatiladi.

## 4. Autosell (ko'p skin, Lis-Skins uslubida)

### UI — `MarketSell.jsx` (oddiy userlar uchun qism qayta yoziladi)
- Steam inventari kartochkalar to'rida: telefon 2–3 ustun, kompyuter 5–6 ustun (responsiv).
- Har kartochkada: rasm, nom, wear, float, **"Sizga to'lanadi: X so'm"**.
- Narxi topilmagan yoki trade qilib bo'lmaydigan skinlar kulrang, "Sotib bo'lmaydi".
- Bir nechta skinni belgilash; pastda yopishqoq panel: **"Jami: Y so'm — Sotish"**.
- Tasdiqdan keyin: "Steam'da trade offerni qabul qiling" holati va so'rovlar tarixi (mavjud `instant-sell-mine`).
- Kalit yo'q bo'lsa: sahifa ochiladi, "Tez orada ishga tushadi" yozuvi, xato yo'q.

### Server
- `GET /api/instant-sell/quote` — userning inventari + har skin uchun to'lanadigan narx (batch narxlash).
- `POST /api/instant-sell` — `{ assetIds: string[] }` (bitta yoki ko'p). Narxlar serverda QAYTA hisoblanadi (client narxiga ishonilmaydi). Bitta so'rov yozuvi bir nechta itemni saqlaydi: `items: [{assetId, marketHashName, priceSom}]`, `totalSom`.
- Eski bitta-`assetId` shakli ham qabul qilinadi (orqaga moslik, bot oqimi uchun).

### Yetkazish va kreditlash
- Bot odamning trade link'iga **o'zi bitta trade offer yuboradi** (odamdan belgilangan skinlarni so'raydi, o'zi hech narsa bermaydi). Bu relay'ga yangi imkoniyat talab qiladi: "itemlarni so'rovchi offer yaratish" + holatni so'rash.
- Offer `accepted` bo'lganda: kelgan itemlar `marketHashName` bo'yicha so'rov bilan solishtiriladi; mos kelsa `totalSom` mavjud `creditTradeProceeds` orqali, **7 kunlik hold** bilan, tranzaksiyada kreditlanadi (mavjud ikki-bosqichli tekshiruv saqlanadi).
- **Olingan narxni saqlash:** Steam item botga o'tganda yangi `assetId` beradi. Relay accepted offer uchun kelgan itemlarning YANGI assetId'larini qaytaradi; backend `itemCosts` kolleksiyasiga `{ botAssetId, marketHashName, costSom, instantSellRequestId, at }` yozadi (kreditlash bilan bir tranzaksiyada). Admin bu itemni Marketga qo'yganda `costSom` shu yerdan avtomatik olinadi. Relay yangi assetId bermasa (eski relay) — `costSom` yozilmaydi, admin qo'lda kiritadi.
- Offer rad etilsa/15 daqiqada qabul qilinmasa → so'rov `expired`, offer bekor qilinadi.
- Odamning trade link'i yo'q bo'lsa — avval uni kiritishga yo'naltiriladi (mavjud onboarding).

### Bog'liqlik (BLOKER)
Relay VPS'dagi haqiqiy `server.js` hali o'qilmagan va deploy qilinmagan (oldingi Task 1). Autosell'ning yetkazish qismi relay o'zgarishi deploy qilinmaguncha ishlamaydi. Relay kodi foydalanuvchi `!`-buyruq orqali pull qilgandan keyin yoziladi; ungacha backend relay so'rovlari xato bersa, so'rov yaratilmaydi va userga tushunarli xabar chiqadi.

## 5. Admin "Narx sozlamalari" sahifasi (yangi)

`settings` kolleksiyasida:
- `marketMarkupPercent` (standart 10) — Market ustamasi.
- `instantSellMarginPercent` (mavjud, standart 12) — Autosell marjasi.
- `usdToSomRate` (mavjud, standart 12 700).
- `minProfitTiers` (standart `[{ maxUsd: 10, percent: 15 }, { maxUsd: 50, percent: 10 }, { maxUsd: null, percent: 7 }]`) — minimal foyda pog'onalari; oxirgisi `maxUsd: null` (cheksiz).

Sahifada: barcha qiymatlarni tahrirlash (validatsiya: foizlar 0–90, kurs > 0, pog'onalar o'sish tartibida, oxirgisi cheksiz), admin e'longa `costSom` kiritishi mumkin, "Narxlarni hozir yangilash" tugmasi, holat qatori ("Lis API: ulangan / kalit yo'q", oxirgi yangilanish vaqti, yangilangan e'lonlar soni). Route'lar `requireAdminPanel` bilan himoyalangan.

"Hozir yangilash" Vercel'dan (miniapp/admin server) chaqirilganda sinxronni o'sha jarayonda bajaradi (bir martalik, `maxDuration` 30s ichida); soatlik sinxron bot jarayonida qoladi.

## 6. Xatolar

| Holat | Xatti-harakat |
|---|---|
| Kalit yo'q | Autosell "tez orada"; avto-narx sinxroni o'tkazib yuboriladi; Market odatdagidek |
| Lis API xato/timeout | Eski narxlar qoladi; autosell quote'da narxsiz skinlar "Sotib bo'lmaydi" |
| Narx topilmadi | Shu skin uchun e'lon narxi o'zgarmaydi / autosell'da sotib bo'lmaydi |
| Relay ishlamaydi | Autosell so'rovi yaratilmaydi, "Hozir sotib bo'lmaydi, keyinroq urinib ko'ring" |
| Kelgan item mos emas | Kreditlanmaydi, so'rov `mismatch`, adminga xabar |

## 7. Tekshiruv

- Unit testlar: narx formulalari (ustama/marja/yaxlitlash/minimal narx), minimal foyda pog'onalari (chegaralar: aniq 10$ va 50$, `costSom` yo'q holat, pinned narx rad etilishi), `marketHashName` bo'yicha guruhlash, batch narxlash soxta Lis javobi bilan (NaN, bo'sh, topilmagan nom), avto-yangilash faqat `open`+`auto` e'lonlarga tegishi.
- `npm run build` (miniapp + admin) muvaffaqiyatli.
- Qo'lda: telefon va kompyuter kengligida Sotish sahifasi ko'rinishi.
- Haqiqiy Lis API va relay bilan sinov — kalit va relay deploy'idan keyin.

## 8. Doiradan tashqarida

- Lis-Skins skinlarini Marketda ko'rsatish yoki Lis orqali sotib olish.
- Nakleyka/brelok narxini avtomatik hisoblash.
- Lis-Skins'ning o'z "instant sell" narxini olish (API bermaydi — Lis bozor narxi − marja ishlatiladi).
