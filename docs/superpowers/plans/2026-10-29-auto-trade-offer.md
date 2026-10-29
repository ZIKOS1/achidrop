# Skin sotish: avtomatik trade offer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Sotish" bosilganda VPS'dagi bot ulangan Steam trade akkauntidan foydalanuvchiga skinlarni so'raydigan trade offer yuboradi; 1 soatda qabul qilinmasa bekor; akkaunt admin panelda ulanadi/almashtiriladi.

**Architecture:** Steam bilan barcha ish VPS bot jarayonida (`bot/index.js`). Vercel (sayt/admin panel) ↔ bot aloqasi Mongo hujjatlari orqali (`inventoryBridge.js` naqshi). Login: admin panel → shifrlangan `tradeLoginReq_<id>` → bot `steam-session` bilan kiradi → shifrlangan refresh token `tradeAccount` hujjatida. Offer holati `instantSellRequests` elementidagi `tradeOffer` maydonida; bot `queued` guruhlarni yuboradi va holatini kuzatadi.

**Tech Stack:** Node 24, Express (backend/server.js), Mongo (backend/database/db.js), `steam-session` (bor), `steamcommunity` (bor), `steam-tradeoffer-manager` (yangi), React+Vite (frontend/), node:test.

**Spec:** `docs/superpowers/specs/2026-10-29-auto-trade-offer-design.md`

## Global Constraints

- Pul avtomatik tushmaydi: `tradeOffer` holati hech qachon `approveSellRequest` chaqirmaydi.
- Bot hech qachon item BERMAYDI: offer'da faqat `itemsToReceive`; `itemsToGive` doim bo'sh.
- Offer izohi aynan: `AchiDrop #<groupId>`.
- Qabul qilinmagan offer: `sentAt + 60*60*1000` ms dan keyin cancel → so'rov(lar) `rejected`, sabab `Trade 1 soat ichida qabul qilinmadi`.
- Steam paroli faqat AES-256-GCM shifrlangan `tradeLoginReq_<id>` hujjatida, ≤60 s, bot o'qishi bilan o'chiriladi; log'larga parol/token yozilmaydi.
- Shifrlash kaliti: env `TRADE_ACCOUNT_KEY` (64 hex = 32 bayt), Vercel prod va VPS `/opt/auction-bot-v2/.env` da bir xil.
- Trade havola: `partner + 76561197960265728 === BigInt(user.steamId64)` bo'lmasa rad.
- Trade akkaunt ulanmagan / offer `failed` → eski qo'lda oqim (botTradeUrl + "Skinni yubordim") o'zgarishsiz ishlaydi.
- Barcha Mongo yozuvlari `backend/database/db.js` orqali; `instantSellRequests` elementlari pozitsion `updateTx` bilan (butun massiv yozilmaydi).
- UI matnlari o'zbekcha; mavjud i18n (`frontend/src/i18n.js`) uz/ru/en kalitlari bilan.
- Bot deployidan oldin: `npm run check:bot`, `npm test`, barcha `bot/handlers/*.js` ni require qilib tekshirish.

## Review Focus

- Bot qayta ishga tushganda `sending` holatida qolgan guruh → ikkinchi offer ketmasligi kerak (`failed` deb belgilanadi, admin ko'radi).
- Trade havola so'rov YARATILGAN paytdagi qiymat bilan `tradeOffer.tradeUrl` ga yoziladi; keyin user havolani o'zgartirsa ham shu so'rov eski (o'ziniki, tekshirilgan) havolaga ketadi — bu to'g'ri.
- Admin "Oldim"/"Rad etish"ni offer hali `sent` paytida bosa → keyingi poll so'rovni qayta reject qilmaydi (status ≠ awaiting_admin → no-op), Steam'dagi offer cancel qilinadi.
- Trade akkaunt boshqasiga almashtirilganda eski akkauntdan ketgan `sent` offerlar: `getState` xato bersa → 1 soat o'tgach cancel urinadi (xato yutiladi) va so'rov baribir reject qilinadi.
- Steam login xatolari (noto'g'ri parol, eskirgan kod, rate limit) → admin panelda o'zbekcha tushunarli xabar, xom stack emas (`loginErrorText` testlanadi).

---

## File Structure

- `backend/secretBox.js` (yangi) — `seal(text) -> string`, `open(sealed) -> string` (AES-256-GCM, `TRADE_ACCOUNT_KEY`).
- `backend/tradeUrl.js` (yangi) — trade havolani parse/validatsiya.
- `backend/tradeAccountBridge.js` (yangi) — sayt tomoni (login so'rovi, holat, uzish) + bot tomoni (`processLoginRequests`).
- `backend/instantSellManager.js` (o'zgaradi) — `tradeOffer` maydoni va holat o'tishlari.
- `bot/tradeOfferWorker.js` (yangi) — Steam sessiyasi, offer yuborish, kuzatish, 1 soat cancel.
- `bot/index.js` (o'zgaradi) — worker intervallari.
- `backend/server.js` (o'zgaradi) — user trade URL endpoint, instant-sell'da `queued`, admin trade-account endpointlari, javoblarga `tradeOffer`.
- `frontend/src/pages/Sell.jsx`, `frontend/src/i18n.js` — trade havola maydoni, offer holati.
- `frontend/src/admin/pages/AdminSell.jsx` — "Trade akkaunt" bloki, `accepted`/ogohlantirish belgilari.
- Testlar: `tests/secretBox.test.js`, `tests/tradeUrl.test.js`, `tests/tradeAccountBridge.test.js`, `tests/tradeOfferWorker.test.js`, `tests/instantSellDb.test.js` (qo'shimcha).

---

### Task 1: secretBox + tradeUrl

**Files:**
- Create: `backend/secretBox.js`, `backend/tradeUrl.js`
- Test: `tests/secretBox.test.js`, `tests/tradeUrl.test.js`

**Interfaces:**
- Produces: `seal(plain: string, key?: Buffer) -> string` (`v1.<iv b64url>.<tag b64url>.<data b64url>`), `open(sealed: string, key?: Buffer) -> string` (noto'g'ri kalit/buzilgan → throw `Error("secretBox: ochib bo'lmadi")`); `key` berilmasa `Buffer.from(process.env.TRADE_ACCOUNT_KEY, "hex")`, uzunligi 32 bo'lmasa throw `"TRADE_ACCOUNT_KEY sozlanmagan"`.
- Produces: `parseTradeUrl(url: string) -> { partner: string, token: string, steamId64: string, url: string } | null`; `validateTradeUrlFor(url: string, steamId64: string) -> { ok: true, url } | { ok: false, error: string }`.

- [ ] **Step 1: Failing tests**
  - `seal/open: aylanma` — `open(seal("p@ss", K), K) === "p@ss"`; ikki `seal` natijasi farqli (tasodifiy iv).
  - `open: boshqa kalit → throw`, `open: buzilgan tag → throw`.
  - `parseTradeUrl` qabul: `https://steamcommunity.com/tradeoffer/new/?partner=1086892331&token=AbC-d_12` → `steamId64 === "76561199047158059"`; `http://` ham, `&amp;` ham normallashadi; boshqa domen, token yo'q, partner raqam emas → `null`.
  - `validateTradeUrlFor(url, "76561199047158059").ok === true`; boshqa steamId → `{ ok:false, error:"Bu trade havola saytga ulangan Steam akkauntingizga tegishli emas" }`; format xato → `error:"Trade havola formati noto'g'ri"`.
- [ ] **Step 2:** `node --test tests/secretBox.test.js tests/tradeUrl.test.js` → FAIL (module topilmadi).
- [ ] **Step 3:** Implementatsiya (`crypto.createCipheriv("aes-256-gcm")`, 12 bayt iv; URL `new URL()` + `BigInt`). Saqlanadigan `url` — kanonik `https://steamcommunity.com/tradeoffer/new/?partner=<p>&token=<t>`.
- [ ] **Step 4:** Testlar PASS.
- [ ] **Step 5:** Commit `Trade offer: secretBox va trade havola validatsiyasi`.

### Task 2: tradeAccountBridge (login so'rovi, holat, uzish)

**Files:**
- Create: `backend/tradeAccountBridge.js`
- Test: `tests/tradeAccountBridge.test.js` (`fakeStore` — `tests/inventoryBridge.test.js` dagidek)

**Interfaces:**
- Consumes: `seal/open` (Task 1).
- Produces (sayt tomoni, `deps` = `{ now, sleep, readDoc, writeDoc, removeDoc, listIds }`):
  - `requestLogin({ accountName, password, guardCode }, deps) -> { ok: true, account: PublicAccount } | { ok: false, error: string }` — `tradeLoginReq_<rid>` ga `{ at, accountName, passwordSealed: seal(password), guardCode }` yozadi, `tradeLoginRes_<rid>` ni 25 s gacha kutadi (POLL 1 s), olgach o'chiradi; timeout → `{ ok:false, error:"Bot javob bermadi. Bot serverda ishlayaptimi?" }`.
  - `getAccount(deps) -> PublicAccount | null` — `PublicAccount = { accountName, steamId64, connectedAt, tokenExpiresAt, lastError }` (refresh token QAYTARILMAYDI).
  - `disconnect(deps) -> void` — `tradeAccount` hujjatini o'chiradi.
- Produces (bot tomoni): `processLoginRequests(deps & { login }) -> void` — har `tradeLoginReq_*`: o'qiydi, DARHOL o'chiradi, `now - at > 60_000` bo'lsa tashlaydi; `login({ accountName, password, guardCode }) -> { steamId64, refreshToken, tokenExpiresAt }` chaqiradi; muvaffaqiyat → `tradeAccount` = `{ accountName, steamId64, refreshTokenSealed, connectedAt, tokenExpiresAt, lastError:null }`; javob `tradeLoginRes_<rid>`.
  - `loadSession(deps) -> { accountName, steamId64, refreshToken } | null` (bot uchun, `open` bilan).
  - `setLastError(message, deps)`.
- Produces: `steamLogin({ accountName, password, guardCode }) -> { steamId64, refreshToken, tokenExpiresAt }` — `steam-session` `LoginSession(EAuthTokenPlatformType.WebBrowser)`, `startWithCredentials({ accountName, password, steamGuardCode: guardCode })`, `authenticated` voqeasini 30 s kutadi; `tokenExpiresAt` = refresh token JWT `exp`. Xatolar o'zbekchaga: `InvalidPassword` → "Login yoki parol noto'g'ri", `TwoFactorCodeMismatch` → "Steam Guard kodi noto'g'ri yoki eskirgan", `RateLimitExceeded` → "Steam juda ko'p urinish deb blokladi, 30 daqiqadan keyin urining", boshqasi → "Steam'ga kirib bo'lmadi: <EResult nomi>". (Testlanmaydi — tarmoq; `processLoginRequests` soxta `login` bilan testlanadi.)

- [ ] **Step 1: Failing tests**
  - `requestLogin → bot → ok`: soxta `sleep` ichida `processLoginRequests` soxta `login` bilan; natija `ok:true`, `account.accountName`; `tradeLoginReq_*` va `tradeLoginRes_*` qolmagan; `tradeAccount.refreshTokenSealed` mavjud va `open()` → soxta token; hujjatda `password`/`passwordSealed` YO'Q.
  - `login xato → { ok:false, error:"Login yoki parol noto'g'ri" }`, `tradeAccount` o'zgarmagan.
  - `61 s eski so'rov tashlanadi` (`login` chaqirilmaydi, hujjat o'chirilgan).
  - `getAccount refresh token qaytarmaydi`; `disconnect → getAccount null`.
  - `timeout → "Bot javob bermadi..."` va `tradeLoginReq_*` o'chirilgan.
  - `loginErrorText(eresult: number|string) -> string` (eksport qilinadi, `steamLogin` ishlatadi): `EResult.InvalidPassword` → "Login yoki parol noto'g'ri", `TwoFactorCodeMismatch` → "Steam Guard kodi noto'g'ri yoki eskirgan", `RateLimitExceeded` → "Steam juda ko'p urinish deb blokladi, 30 daqiqadan keyin urining", noma'lum → "Steam'ga kirib bo'lmadi: <nom>".
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementatsiya.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `Trade offer: admin panel login ko'prigi (tradeAccountBridge)`.

### Task 3: instantSellManager — `tradeOffer` holatlari

**Files:**
- Modify: `backend/instantSellManager.js`
- Test: `tests/instantSellDb.test.js` (mavjud MongoMemoryReplSet setup)

**Interfaces:**
- `createSellRequest(userId, items, { priceByAsset, tradeOffer })` — `tradeOffer` berilsa (`{ tradeUrl }`) har requestga `tradeOffer: { state: "queued", tradeUrl, offerId: null, sentAt: null, error: null }`.
- Produces: `setTradeOfferState(groupId: number, fromStates: string[], fields: object) -> number` — guruhdagi `tradeOffer.state ∈ fromStates` elementlarga `data.$[e].tradeOffer.<k>` `$set` (arrayFilters), o'zgargan soni; kesh `patchCache` bilan.
- Produces: `getTradeOfferGroups(states: string[]) -> Array<{ groupId, userId, tradeOffer, requests: Request[] }>` (keshdan, avval `refreshRequests()` chaqiruvchi tomonda).
- Holatlar: `queued → sending → sent → accepted | declined | expired | canceled | invalid | failed`; `queued|sending → failed`.

- [ ] **Step 1: Failing tests**
  - `createSellRequest tradeOffer bilan → har request state "queued", bir xil tradeUrl`.
  - `setTradeOfferState(g, ["queued"], {state:"sending"}) → 2`; qayta chaqirilsa → `0` (idempotent).
  - Boshqa guruh/request o'zgarmagan; `status` o'zgarmagan.
  - `getTradeOfferGroups(["sent"])` faqat `sent` guruhlarni guruhlab qaytaradi.
- [ ] **Step 2:** FAIL. **Step 3:** Implementatsiya (`updateTx` + `arrayFilters` — `updateTx` `options` ni uzatishini tekshiring). **Step 4:** PASS (`npm test`).
- [ ] **Step 5:** Commit `Trade offer: so'rovlarda tradeOffer holati`.

### Task 4: bot/tradeOfferWorker.js

**Files:**
- Create: `bot/tradeOfferWorker.js`; dependency `steam-tradeoffer-manager` (`npm install steam-tradeoffer-manager`, package.json'ga).
- Test: `tests/tradeOfferWorker.test.js`

**Interfaces:**
- Consumes: `loadSession`, `setLastError` (Task 2); `getTradeOfferGroups`, `setTradeOfferState`, `rejectSellRequest`, `refreshRequests` (Task 3).
- Produces: `createWorker(deps) -> { sendQueued(): Promise<void>, pollSent(): Promise<void>, recoverStale(): Promise<void> }`; `deps = { now, steam, store, notifyAdmins(text), notifyUser(userId, text) }` bu yerda `steam = { ready(): boolean, send({ tradeUrl, assetIds, message }) -> offerId, getState(offerId) -> "Active"|"Accepted"|"Declined"|"Canceled"|"Expired"|"InvalidItems"|"Countered"|"InEscrow"|..., cancel(offerId) -> void }`.
- Produces: `createSteamAdapter(session) -> steam` — refresh token bilan `steamcommunity` web cookie (`LoginSession.getWebCookies()`), `TradeOfferManager({ community, language:"en", pollInterval:-1 })`, `setCookies`; `send`: `manager.createOffer(tradeUrl)`, `addTheirItems(assetIds.map(id => ({ appid:730, contextid:"2", assetid:id })))`, `setMessage`, `send()`. Har 30 daqiqada cookie yangilanadi; refresh rad etilsa `setLastError("Trade akkaunt sessiyasi tugadi — admin panelda qayta ulang")` + bir marta admin xabari.
- Xatti-harakat:
  - `recoverStale`: ishga tushganda `sending` → `failed` (`error:"Bot qayta ishga tushdi, offer holati noma'lum"`), adminga xabar.
  - `sendQueued`: `steam.ready()` false → hech narsa qilmaydi (queued kutadi; 10 daqiqadan eski queued → `failed`, qo'lda oqim). Har guruh: `setTradeOfferState(g,["queued"],{state:"sending"})===0` bo'lsa o'tkazib yuboradi; `send` → `{state:"sent", offerId, sentAt}`; xato → bir marta qayta urinish, so'ng `{state:"failed", error}`.
  - `pollSent`: `requests` ning birortasi `status !== "awaiting_admin"` bo'lsa → `cancel` (xatoni yutadi) + `{state:"canceled"}`; `Accepted` → `{state:"accepted"}` + adminga `✅ Trade qabul qilindi: AchiDrop #<g> — skin botda, "Oldim"ni bosing`; `InEscrow` → admin xabarida "hold"; `Declined/Canceled/Expired/InvalidItems/Countered` → state mos + har request `rejectSellRequest(id, "Trade rad etildi")` (InvalidItems: `"Skin inventarda topilmadi"`) + userga `rejectedText`; `Active` va `now - sentAt > 3_600_000` → `cancel` + `{state:"expired"}` + `rejectSellRequest(id, "Trade 1 soat ichida qabul qilinmadi")` + userga xabar.

- [ ] **Step 1: Failing tests** (soxta `steam` va soxta store, Task 3 funksiyalari o'rnida in-memory fake):
  - `sendQueued: bitta offer, izoh "AchiDrop #<g>", assetIds guruhdagi hammasi, state sent`.
  - `sendQueued ikki marta → send bir marta`.
  - `send xato ikki marta → failed, error saqlangan`.
  - `steam.ready() false → send chaqirilmaydi; 10 daqiqadan eski queued → failed`.
  - `recoverStale: sending → failed`.
  - `pollSent Accepted → accepted, rejectSellRequest chaqirilmagan, admin xabari 1 marta`.
  - `pollSent Declined → hamma request rejected "Trade rad etildi"`.
  - `pollSent Active + 61 daqiqa → cancel chaqirilgan, rejected "Trade 1 soat ichida qabul qilinmadi"`; `59 daqiqa → hech narsa`.
  - `admin allaqachon credited qilgan → cancel, state canceled, reject YO'Q`.
  - `getState throw (eski akkaunt) + 61 daqiqa → cancel urinildi (throw yutildi), rejected "Trade 1 soat ichida qabul qilinmadi"`; `getState throw + 30 daqiqa → hech narsa`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementatsiya. **Step 4:** PASS.
- [ ] **Step 5:** Commit `Trade offer: bot worker (yuborish, kuzatish, 1 soat bekor)`.

### Task 5: server.js endpointlari

**Files:**
- Modify: `backend/server.js`
- Test: `tests/tradeUrl.test.js` (validatsiya allaqachon), qo'lda curl tekshiruvi.

**Interfaces:**
- Consumes: Tasks 1–3.
- `POST /api/steam-trade-url` (auth, sensitiveLimiter) `{ url }` — `""` o'chiradi; aks holda `validateTradeUrlFor(url, user.steamId64)`; `user.steamTradeUrl` saqlanadi (`saveUsers`), javob `{ success, steamTradeUrl }` yoki 400 `{ error }`.
- `GET /api/instant-sell/quote` javobiga: `tradeOfferReady: boolean` (= `getAccount()` mavjud va `lastError` yo'q), `steamTradeUrl: user.steamTradeUrl || null`.
- `POST /api/instant-sell`: `tradeOfferReady && user.steamTradeUrl` (validatsiyadan qayta o'tgan) bo'lsa `createSellRequest(..., { priceByAsset, tradeOffer: { tradeUrl } })`; javobga `tradeOffer: "queued" | null`.
- `GET /api/instant-sell-mine` va admin ro'yxati — requestdagi `tradeOffer` (tradeUrl'siz) qaytadi.
- Admin (requireAdminPanel): `GET /api/admin/trade-account` → `PublicAccount|null`; `POST /api/admin/trade-account/login` `{ accountName, password, guardCode }` (har biri bo'sh bo'lmasin, guardCode `/^[A-Z0-9]{5}$/i`) → `requestLogin`; `POST /api/admin/trade-account/disconnect`. Login endpointga alohida limiter: 5/10 daqiqa.
- Trade qabul qilinganda adminga ketadigan Telegram xabari "Oldim/Rad etish" tugmalari bilan — `notifyAdminsSellSent` qayta ishlatilmaydi (u "user yubordim dedi" matni bilan); worker o'z matnini yuboradi, tugmalar `isell_ok_<id>`/`isell_no_<id>` har request uchun.

- [ ] **Step 1:** Endpointlarni qo'shish. **Step 2:** `npm test` PASS, `npm run check:bot` exit 0. **Step 3:** Lokal: `node -e "require('./backend/server')"` xatosiz yuklanadi. **Step 4:** Commit `Trade offer: sayt va admin endpointlari`.

### Task 6: Frontend (Sell + AdminSell)

**Files:**
- Modify: `frontend/src/pages/Sell.jsx`, `frontend/src/i18n.js`, `frontend/src/admin/pages/AdminSell.jsx`

**Interfaces:**
- Consumes: Task 5 endpointlari va maydonlari.
- Sell: `tradeOfferReady` va `steamTradeUrl` bo'lmasa — "Steam trade havolangiz" maydoni + "Havolani olish" (https://steamcommunity.com/my/tradeoffers/privacy, yangi tabda) + "Saqlash". Sotishdan keyin `tradeOffer` bo'lsa: "Bot sizga trade yubormoqda… Steam'da `AchiDrop #<id>` izohli trade'ni qabul qiling. Boshqa izohli trade'ni QABUL QILMANG." "Mening so'rovlarim"da holat: queued/sending → "Trade tayyorlanmoqda", sent → "Trade yuborildi" + `https://steamcommunity.com/tradeoffer/<offerId>/` havolasi, accepted → "Trade qabul qilindi — admin tekshirmoqda", failed yoki `tradeOffer` yo'q → mavjud qo'lda ko'rsatma va "Skinni yubordim".
- AdminSell: "Trade akkaunt" kartasi — holat (akkaunt nomi, Steam ID, ulangan sana, kalit muddati, `lastError` qizil), forma (login, parol `type=password autocomplete=off`, Steam Guard kodi, "Ulash" — kutish holati ~25 s), "Uzish" (tasdiq UI ichida, `confirm()` emas). So'rovlar ro'yxatida `tradeOffer.state` badge; `awaiting_admin` + state ≠ accepted bo'lsa "Trade hali qabul qilinmagan" ogohlantirishi "Oldim" yonida.
- Uz/ru/en i18n kalitlari `sellx.trade*` prefiksi bilan.

- [ ] **Step 1:** UI. **Step 2:** `cd frontend && npm run build` xatosiz. **Step 3:** Commit `Trade offer: Sell va admin panel UI`.

### Task 7: Bot ulash, deploy, jonli tekshiruv

**Files:**
- Modify: `bot/index.js`

**Interfaces:**
- Consumes: Task 2 `processLoginRequests` + `steamLogin`, Task 4 `createWorker`/`createSteamAdapter`.
- `bot/index.js`: har 3 s `processLoginRequests`; `tradeAccount` o'zgarsa (accountName/connectedAt) adapter qayta yaratiladi; har 10 s `refreshRequests` + `sendQueued`; har 30 s `pollSent`; start'da `recoverStale`. Har interval `try/catch` + `console.log("TRADE OFFER XATO:", err.message)` (token/parolsiz).

- [ ] **Step 1:** Ulash; `npm run check:bot`, `npm test`, handlerlar require — xatosiz.
- [ ] **Step 2:** `TRADE_ACCOUNT_KEY` yaratish (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) — user `!` orqali Vercel prod env'ga va VPS `.env` ga qo'shadi (Claude o'zi yoza olmaydi).
- [ ] **Step 3:** Bot deploy: `git archive HEAD -- bot backend package.json package-lock.json` → user `!` scp + `npm install --omit=dev` + `pm2 restart auction-bot`; 10 s dan keyin `restart_time` o'zgarmaganini tekshirish.
- [ ] **Step 4:** Sayt deploy: user `!` `vercel deploy --prod`.
- [ ] **Step 5:** Jonli: admin panelda bot akkaunt ulanadi → test user arzon skin sotadi → Steam'da `AchiDrop #<g>` offer → qabul → admin xabar → "Oldim". Ikkinchi test: qabul qilmay 1 soat → bekor + "rad etildi".
- [ ] **Step 6:** Commit `Trade offer: bot ulanishi` + memory yangilash.
