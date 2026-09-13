# Market qayta qurish: Lis-Skins uslubidagi do'kon + Instant Sell

Status: draft — user review kutilmoqda
Sana: 2026-09-13
Bog'liq/keyingi ish: Obmen (P2P) yaxshilash — alohida spec (bu hujjatga kirmaydi)

## 1. Maqsad

Hozirgi Market — ikki-foydalanuvchi-o'rtasida P2P: istalgan user o'z skinini narx bilan
qo'yadi, xaridor sotib olgach sotuvchi Steam orqali qo'lda yuborishini kutadi. Bu:
- sotuvchiga bog'liq (offline bo'lsa xaridor kutib qoladi),
- ishonchsizroq tuyuladi.

Yangi Market — **Lis-Skins uslubidagi do'kon**: faqat admin (bot akkaunti orqali) skin
sotadi, xaridor xarid qilgach skin darhol o'zinikida (ichki "inventar"da), istagan payt
haqiqiy Steam'iga chiqarib oladi. Userlar o'z skinlarini to'g'ridan-to'g'ri boshqa userga
emas, **tizimga (Instant Sell)** darhol naqd evaziga sotadi — bu esa admin uchun sotuvga
chiqariladigan tovar zaxirasini to'ldiradi.

## 2. Qamrov (scope)

**Ichiga kiradi:**
- Market'da oddiy userlarning o'z skinini qo'lda sotuvga qo'yish imkoniyatini olib tashlash.
- Instant Sell: user o'z Steam inventaridan skin tanlab, Lis-Skins narxidan −12% (admin
  keyinchalik sozlay oladigan foiz) ga darhol sotadi.
- Relay serverga yangi qobiliyat: kiruvchi Steam trade taklifini avtomatik ko'rish,
  tekshirish (item nomi+float mosligi) va qabul qilish.
- Instant Sell orqali kelgan pulni mavjud 7-kunlik "hold" ledgeriga yozish + **yangi:
  admin tomonidan 7 kun ichida (yoki withdraw so'ralmagan holatda) o'sha yozuvni
  bekor qilish (reversal)** imkoniyati.
- Admin panel: bulk-list (bir xil nom+float'dagi bir nechta nusxani birdaniga sotuvga
  qo'yish) va auto-list (Lis-Skins narxiga asoslangan taklif narxi).
- Xaridor tomoni: xarid qilingan skin "Mening inventarim"da turadi, "Chiqarib olish"
  tugmasi bilan istalgan payt (mavjud auto-delivery infratuzilmasi orqali) haqiqiy
  Steam'iga yuboriladi.
- Market va Instant Sell uchun **bitta** Steam akkaunt (relay/bot akkaunti,
  `STEAM_ID64` env) — admin uchun alohida shaxsiy akkaunt ulash shart emas.

**Ichiga KIRMAYDI (keyingi/aloxida ish):**
- Obmen (🔄, user-to-user to'g'ridan-to'g'ri savdo) — nizolar, tezlik — alohida spec.
- Lis-Skins API'ning aniq endpoint/kalit tafsilotlari — implementatsiya bosqichida
  tekshiriladi (pastda "Ochiq savollar"da).

## 3. Arxitektura — komponentlar

### 3.1 Narx integratsiyasi — `lisSkinsPrice.js` (yangi)
- Skin nomi (+ float/wear) bo'yicha bozor narxini so'raydi (Lis-Skins API/eksport).
- Natijani keshlaydi (masalan 1 soat) — API'ga har safar murojaat qilmaslik uchun.
- USD→so'm konvertatsiyasi uchun mavjud kurs manbasidan foydalanadi (bor-yo'qligi
  implementatsiyada tekshiriladi).
- `getBuybackPrice(skinName, float)` → Lis narxi × (1 − marginPercent). `marginPercent`
  admin panelidan sozlanadigan sozlama (`settings.json`/db'da), default 12%.
- `getListPrice(...)` — auto-list uchun Lis narxining o'zi (yoki ustiga ozgina foyda
  qo'shilgan versiyasi — admin sozlaydi).

### 3.2 Relay: kiruvchi trade qabul qilish (yangi, eng xavfli qism)
Hozir relay faqat **chiqish** (`POST /trade-offer`) qo'llaydi. Qo'shiladigan yangi
imkoniyat:
- Relay davriy ravishda (masalan har 15-30 soniyada) bot akkauntining kiruvchi trade
  takliflari ro'yxatini tekshiradi (`steam-tradeoffer-manager`'ning `getOffers`).
- Har bir kutilayotgan Instant Sell so'rovi backend tomonidan oldindan relay'ga
  ro'yxatga olinadi: `{ expectedSenderSteamId64, expectedItemName, expectedFloat,
  requestId, expiresAt }`.
- Kiruvchi taklif kelganda: yuboruvchi SteamID va taklifdagi item(lar) shu
  ro'yxatdagi kutilayotgan so'rovlardan biriga **aniq** mos kelsa (nomi+float, va
  taklifda faqat 1 dona item, bot tarafdan hech narsa berilmayotgani) — AVTOMATIK
  qabul qilinadi. Mos kelmasa yoki bir nechta item/talab bo'lsa — **rad etiladi**
  (avtomatik qabul qilinmaydi, xavfsizlik uchun).
- Qabul qilingach relay backend'ga xabar beradi (webhook yoki backend polling orqali,
  mavjud `checkPendingWithdrawals` naqshiga o'xshash) — backend shu yerda **yana bir
  bor** tekshiradi (item to'g'ri kelganmi) va faqat shundan keyin balansga pul qo'shadi.
- **Bosqichma-bosqich qilinadi:** avval faqat admin bilan, real userlarsiz sinaladi
  (bo'lim 6'ga qarang).

### 3.3 Instant Sell oqimi (backend + bot/miniapp UI)
1. User o'z Steam inventaridan (mavjud `fetchUserInventory`) skin tanlaydi.
2. Backend `lisSkinsPrice.getBuybackPrice()` orqali taklif narxini hisoblaydi va
   ko'rsatadi.
3. User tasdiqlasa — backend relay'ga "shu itemni, shu userdan kutyapman" deb
   ro'yxatga oladi (3.2), userga bot trade-link va aniq yo'riqnoma ko'rsatadi
   ("faqat shu itemni yuboring, hech narsa so'ramang").
4. User Steam orqali (o'z ilovasi/brauzeridan, bizning tizim tashqarisida) trade
   taklifini yuboradi.
5. Relay avtomatik qabul qiladi (3.2) → backendga xabar → item mosligi qayta
   tekshiriladi → **mos bo'lsa**: `balanceManager.creditTradeProceeds()` (mavjud
   funksiya, o'zgarishsiz qayta ishlatiladi) chaqiriladi — pul darhol balansga
   tushadi, 7 kunlik hold ledgeriga yoziladi.
6. Item bot akkauntining "sotuvga tayyor" inventariga qo'shilib qoladi (admin
   keyinroq bulk/auto-list qiladi).

### 3.4 Reversal (orqaga qaytarish) — `balanceManager.js`'ga yangi funksiya
- `reverseTradeCreditEntry(userId, entryId, reason)`:
  - Faqat `withdrawalStatus !== "withdrawn"` bo'lgan yozuvlarga ruxsat (ya'ni pul
    hali haqiqatda kartaga chiqarilmagan bo'lsa).
  - `deduct = Math.min(entry.amount, user.balance)` — balansdan ayiriladi (mavjud
    `approveWithdrawal`dagi naqshga o'xshash himoya: balans manfiyga tushmaydi).
  - Entry `withdrawalStatus = "reversed"` deb belgilanadi (yangi holat qiymati).
  - `balanceHistory`ga `-deduct`, sabab bilan yoziladi (audit uchun).
  - Faqat admin panelidan chaqiriladi, sabab (reason) majburiy — audit log.
- Admin panelda har bir Instant Sell yozuvi yonida "Bekor qilish" tugmasi (7 kun
  ichida yoki withdraw so'ralmagunча ko'rinadi).

### 3.5 Xaridor tomoni — "Mening inventarim" + on-demand withdraw
- Market xaridi (admin/bot akkauntidan sotib olingan skin) buyerning "site
  inventory" yozuviga qo'shiladi (item hali Steam'da emas, faqat bizning bazada).
- "Chiqarib olish" tugmasi bosilganda — **mavjud** `steamTradeOffer.sendTradeOffer`
  + `withdrawDelivery.js`dagi kuzatish/timeout naqshi (2 soat, qayta urinish, admin
  fallback) qayta ishlatiladi — bu qism auksion g'oliblari uchun ALLAQACHON ishlab
  turibdi, yangi xavf yo'q.

### 3.6 Admin: bulk-list va auto-list
- Bot akkauntining (yagona Steam akkaunt, 3-band) inventari admin panelida
  ko'rsatiladi, nom+float bo'yicha guruhlangan (bir xil skin nechta nusxada ekani
  ko'rinadi).
- **Bulk-list**: bir guruhni tanlab, bittasiga narx belgilasa — hammasi shu narxda
  alohida-alohida e'lon sifatida bir vaqtda yaratiladi.
- **Auto-list**: "Lis narxidan taklif qil" tugmasi — `lisSkinsPrice.getListPrice()`
  orqali narxni oldindan to'ldiradi, admin tasdiqlaydi yoki o'zgartiradi.

### 3.7 Oddiy userlar uchun Market'dan olib tashlanadigan narsalar
- Bot: `market_new` action — endi faqat `isAdmin(ctx)` uchun ishlaydi.
- Miniapp: `MarketSell.jsx` — oddiy user uchun bu sahifa **Instant Sell** sahifasiga
  aylantiriladi (o'zining ustiga yoziladi, chunki funksional jihatdan o'xshash:
  "inventardan tanla → narx ko'rsat → tasdiqla" — faqat oxiri boshqacha: e'lon
  yaratish o'rniga darhol sotish).
- Market grid (`Market.jsx`)'ning birinchi katakchasida doimiy "⚡ Tezkor sotish"
  kartasi turadi (oddiy listing card emas).

## 4. Ma'lumotlar modeli o'zgarishlari

- `tradeBalances` ledger entry: `withdrawalStatus` qiymatlariga `"reversed"`
  qo'shiladi (hozir: `null | "pending" | "withdrawn"`).
- Yangi `instantSellRequests` (yoki mavjud trades jadvaliga `kind: "instant_sell"`):
  `{ id, userId, itemName, float, quotedPrice, status: pending|matched|expired|
  rejected|credited, createdAt, relayRequestId }`.
- Yangi `settings` (yoki mavjud config joyi): `instantSellMarginPercent` (default 12).
- Buyer "site inventory": yangi jadval/koleksiya — xarid qilingan, hali Steam'ga
  chiqarilmagan itemlar ro'yxati (`userId, tradeId, skin, status: in_site_inventory|
  withdraw_pending|delivered`).

## 5. Xavfsizlik choralari (xulosa)

1. Relay avtomatik qabul qilishdan oldin item nomi+float'ni ANIQ tekshiradi;
   mos kelmasa rad etadi.
2. Backend, relay xabar bergandan keyin ham, qayta mustaqil tekshiradi (ikki
   bosqichli tasdiqlash).
3. Har bir Instant Sell krediti 7 kun "hold"da — bu muddatda admin **reversal**
   qila oladi (pulni orqaga qaytarish), agar keyinchalik muammo aniqlansa.
4. Har bir avtomatik qabul/rad qilingan taklif va reversal — audit log
   (`balanceHistory` + alohida log) orqali kuzatiladi.
5. Instant Sell so'rovlari muddatli (`expiresAt`) — abadiy kutib turmaydi,
   muddat o'tsa avtomatik bekor bo'ladi (spam/eskirgan so'rovlarning oldini olish).
6. Relay avtomatikasi ishlamay qolsa (xato, timeout) — tizim **hech narsani
   taxmin qilmaydi**, shunchaki kreditlamaydi; user "hali qabul qilinmadi" holatida
   qoladi, keyinroq qayta tekshiriladi (mavjud `maybeCheckPendingWithdrawals`
   naqshiga o'xshash polling).

## 6. Bajarish tartibi (bosqichlar, xavfni kamaytirish uchun)

1. **Relay: kiruvchi taklif qabul qilish** — faqat admin bilan, real pul/user
   ishtirokisiz sinaladi (masalan admin o'zi ikkinchi test-akkauntdan bitta item
   yuboradi, avtomatik qabul bo'lishini tekshiradi).
2. **Lis-Skins narx integratsiyasi** — mustaqil modul, alohida test qilinadi.
3. **Instant Sell** (backend + bot UI + miniapp UI) — 1 va 2-bosqich ustiga quriladi.
4. **Reversal** admin funksiyasi.
5. **Admin bulk-list/auto-list**.
6. **Xaridor "Mening inventarim" + on-demand withdraw** (mavjud infra qayta
   ishlatilgani uchun eng tez bosqich).
7. Oddiy userlar uchun eski "Market'ga qo'yish" yo'lini o'chirish (bu eng oxirida,
   Instant Sell to'liq ishlagach — aks holda userlar hech qanday sotish yo'lisiz
   qolib ketadi).

## 7. Ochiq savollar / implementatsiya vaqtida tekshiriladi

- Lis-Skins API'ning aniq shakli (ochiq/bepul eksportmi, kalit kerakmi, rate limit)
  — implementatsiya boshida tekshiriladi.
- USD→so'm konvertatsiya kursi qayerdan olinadi (mavjud tizimda bormi, yo'qmi).
- Relay'da kiruvchi takliflarni "polling" qilish oralig'i (masalan 15-30s) — relay
  serverning yukiga qarab sozlanadi.
- Bot akkauntining Steam trade holdi (agar mobile authenticator/akkaunt yoshi
  yetarli bo'lmasa, Steam items'ni 15 kunga "trade hold"ga qo'yishi mumkin) —
  bu hozirgi chiquvchi (auksion) oqimida muammo bo'lmagan bo'lsa, kiruvchida ham
  bo'lmasligi kerak, lekin implementatsiya boshida tasdiqlanadi.

## 8. Muvaffaqiyat mezonlari

- User market'ga kirganda birinchi o'rinda "Tezkor sotish" ko'radi, o'z skinini
  1 daqiqa ichida (Steam trade tasdiqlash vaqtidan tashqari) naqdga sotishi mumkin.
- Admin bir necha bosishda 8 ta bir xil skinni birdaniga sotuvga qo'ya oladi.
- Xaridor xarid qilgach kutmasdan "Mening inventarim"da ko'radi, istagan payt
  "Chiqarib olish" bosib Steam'iga oladi.
- Admin shubhali Instant Sell tranzaksiyasini 7 kun ichida bekor qila oladi.
