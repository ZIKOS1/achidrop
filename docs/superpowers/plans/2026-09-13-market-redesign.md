# Market Redesign (Lis-Skins uslubi + Instant Sell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Market'ni admin-only "do'kon"ga aylantirish (Lis-Skins uslubi), userlar uchun o'z Steam skinini tizimga to'g'ridan-to'g'ri sotadigan (Instant Sell) funksiya qo'shish, va xaridorga sotib olingan skinni istagan payt Steam'iga "chiqarib olish" imkonini berish.

**Architecture:** Yangi 3 ta mustaqil modul (`lisSkinsPrice.js`, `instantSellManager.js`, relay'ga qo'shiladigan kiruvchi-trade-qabul funksiyasi) mavjud `tradeManager.js`/`balanceManager.js`/`steamTradeOffer.js` naqshlariga mos yoziladi. Bot (Telegraf) va Mini App (React) UI'lari bir xil backend API'ga (`server.js`) va bot handler'lariga ulanadi — mavjud Market/Obmen kodlari bilan bir xil uslub.

**Tech Stack:** Node.js (Express, Telegraf), MongoDB (mavjud `database/db.js` kesh+tranzaksiya qatlami), React + Vite (miniapp), Python (steam-tradeoffer-manager asosidagi relay server, alohida VPS'da).

**Spec:** `docs/superpowers/specs/2026-09-13-market-redesign-design.md`

## Global Constraints

- Loyihada avtomatik test freymvorki YO'Q (Jest/Mocha/Vitest yo'q, `package.json`da tasdiqlangan) — bu mavjud kod uslubi, yangi freymvork QO'SHILMAYDI (YAGNI). Har bir vazifadagi "tekshirish" qadami: `node --check <fayl>` (sintaksis), so'ng serverni/botni real ishga tushirib, `curl`/Telegram orqali qo'lda tekshirish — xuddi shu repo'dagi boshqa funksiyalar qanday tekshirilgan bo'lsa shunday.
- Pul bilan bog'liq YANGI yozish amallari (balans kredit/debit, Instant Sell holatini o'zgartirish) MUTLAQO `database/db.js`'ning `withTransaction/readTx/writeTx` naqshidan foydalanishi kerak — oddiy `read()/write()` EMAS (tradeManager.js'dagi `buyMarketListing`ni namuna qiling — u xuddi shu turdagi race'ni tuzatish uchun yozilgan, izohida sababi bor).
- Barcha yangi foydalanuvchiga ko'rinadigan matnlar o'zbek tilida, mavjud fayllardagi ohangda (emoji, "so'm" birligi, `.toLocaleString()` formatlash) yoziladi.
- Relay server (`/opt/steam-relay/` VPS `155.133.22.217`) bu reponing QISMI EMAS. Uni o'zgartiradigan qadamlar SSH orqali bajariladi; **yozuvchi (mutatsiya qiluvchi) SSH/paramiko skriptlarni avtomatik ijro tizimi bloklaydi** — foydalanuvchi buni `!`-prefiks bilan o'zi ishga tushirishi kerak (masalan `! python <scratchpad>\deploy.py`). O'qish uchun (holat tekshirish, health-check, log ko'rish) odatiy SSH/curl ishlaydi.
- `docs/superpowers/relay/server.js` — bu repo'dagi relay manbasining KUZATUV NUSXASI (mirror). Haqiqiy ishlaydigan nusxa har doim VPS'da. Har safar relay o'zgarganda ikkalasi ham yangilanadi.

---

### Task 1: Relay manbasini reponi ichiga ko'chirish + kiruvchi trade avtomatik qabul qilish

**Files:**
- Create: `docs/superpowers/relay/server.js` (VPS'dagi joriy faylning ko'chirmasi + shu vazifada qo'shiladigan yangi kod)
- Create: `docs/superpowers/relay/DEPLOY.md` (deploy qadamlari, keyingi vazifalar ham shu yerga qo'shimcha yozadi)

**Interfaces:**
- Produces (Task 4 shundan foydalanadi, relay HTTP orqali, `steamTradeOffer.js` orqali emas — chunki bu ikki YANGI endpoint mavjud `steamTradeOffer.js` kontraktida yo'q):
  - `POST /deposit-expect` — body `{ requestId: string, fromSteamId64: string, marketHashName: string, ttlMs: number }` → `{ ok: true }`. Header: `x-relay-secret`.
  - `GET /deposit-status/:requestId` → `{ status: "pending"|"accepted"|"expired", offerId?: string, receivedItem?: { assetId: string, marketHashName: string } }`. Header: `x-relay-secret`.

- [ ] **Step 1: Joriy relay manbasini o'qish uchun ko'chirib olish**

Bash (o'qish-only, mutatsiya emas — odatda avtomatik o'tadi):

```bash
sshpass -p 'A%b6198295' scp root@155.133.22.217:/opt/steam-relay/server.js "C:/Users/User/Desktop/auction bot/auction bot/docs/superpowers/relay/server.js"
```

Agar `sshpass` mavjud bo'lmasa, paramiko orqali o'qish skripti yozib bajaring (scratchpad'ga), masalan:
```python
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("155.133.22.217", username="root", password="A%b6198295")
sftp = c.open_sftp()
sftp.get("/opt/steam-relay/server.js", r"C:\Users\User\Desktop\auction bot\auction bot\docs\superpowers\relay\server.js")
sftp.close(); c.close()
```

- [ ] **Step 2: Faylni o'qib, quyidagilarni aniqlang va yozib qo'ying (`docs/superpowers/relay/DEPLOY.md`ga)**

Aniqlanishi kerak bo'lgan narsalar (fayl ichidan qidiring):
- `x-relay-secret`ni tekshiruvchi middleware qayerda joylashgan (barcha route'lardan oldinmi?) — yangi 2 ta endpoint shu middleware'dan KEYIN qo'shilishi kerak.
- `TradeOfferManager` instance qanday nom bilan yaratilgan (masalan `manager`) va `SteamUser` instance nomi (masalan `client`).
- Express `app` o'zgaruvchisi nomi.

`DEPLOY.md`ga yozing: `## Deploy qadami` sarlavhasi ostida — `sftp orqali server.js'ni yuklash → pm2 restart steam-relay → pm2 save`, va eslatma: **bu qadamni foydalanuvchi o'zi `!` prefiks bilan bajaradi** (avtomatik mutatsiya skriptlari bloklanadi).

- [ ] **Step 3: Kiruvchi depozitlarni kutish/qabul qilish kodini qo'shish**

`docs/superpowers/relay/server.js` (mahalliy nusxa)ga, `TradeOfferManager` importi va `manager`/`client`o'zgaruvchilari e'lon qilingan joydan KEYIN, quyidagi bo'limni qo'shing (aniq o'zgaruvchi nomlarni Step 2'da topilganiga moslang):

```js
// ── Instant Sell: kiruvchi depozitlarni kutish va avtomatik qabul qilish ──
// Backend (auction-bot) har bir Instant Sell so'rovi uchun oldindan
// POST /deposit-expect chaqiradi. Relay har 20 soniyada bot akkauntining
// FAOL kiruvchi takliflarini tekshiradi: agar taklif (a) bot HECH NARSA
// bermayotgan, (b) FAQAT 1 dona item so'ralayotgan, (c) yuboruvchi SteamID
// va itemning market_hash_name'i ro'yxatdagi biror kutilayotgan so'rovga
// ANIQ mos kelsa — AVTOMATIK qabul qilinadi. Mos kelmasa — HECH NARSA
// qilinmaydi (taklif "Active" holatida qoladi, qo'lda ko'rib chiqiladi;
// avtomatik RAD ETILMAYDI — xato bilan haqiqiy/tasodifiy taklifni yo'q
// qilib qo'ymaslik uchun).
const pendingDeposits = new Map(); // requestId -> { fromSteamId64, marketHashName, expiresAt, status, offerId, receivedItem }

app.post("/deposit-expect", (req, res) => {
    const { requestId, fromSteamId64, marketHashName, ttlMs } = req.body || {};
    if (!requestId || !fromSteamId64 || !marketHashName) {
        return res.status(400).json({ error: "requestId, fromSteamId64, marketHashName kerak" });
    }
    pendingDeposits.set(requestId, {
        fromSteamId64: String(fromSteamId64),
        marketHashName: String(marketHashName),
        expiresAt: Date.now() + (Number(ttlMs) > 0 ? Number(ttlMs) : 15 * 60 * 1000),
        status: "pending",
        offerId: null,
        receivedItem: null,
    });
    res.json({ ok: true });
});

app.get("/deposit-status/:requestId", (req, res) => {
    const dep = pendingDeposits.get(req.params.requestId);
    if (!dep) return res.json({ status: "expired" });
    if (dep.status === "pending" && Date.now() > dep.expiresAt) {
        pendingDeposits.delete(req.params.requestId);
        return res.json({ status: "expired" });
    }
    // Tashqariga faqat hujjatlashtirilgan uchta qiymat chiqadi
    // (pending|accepted|expired) — ichki "accepting" oraliq holati
    // (offer.accept() hali tugallanmagan payt) chaqiruvchiga "pending"
    // sifatida ko'rinadi, chunki chaqiruvchi (instantSellManager.js) baribir
    // shu holatda ham qayta so'rashda davom etadi.
    const externalStatus = dep.status === "accepting" ? "pending" : dep.status;
    res.json({ status: externalStatus, offerId: dep.offerId, receivedItem: dep.receivedItem });
});

function checkIncomingDeposits() {
    if (pendingDeposits.size === 0) return;
    manager.getOffers(TradeOfferManager.EOfferFilter.ActiveOnly, (err, _sent, received) => {
        if (err) { console.log("DEPOSIT POLL XATO:", err.message); return; }
        for (const offer of received) {
            if (offer.state !== TradeOfferManager.ETradeOfferState.Active) continue;
            if (offer.itemsToGive.length > 0) continue;
            if (offer.itemsToReceive.length !== 1) continue;
            const senderId = offer.partner.getSteamID64();
            const item = offer.itemsToReceive[0];
            for (const [requestId, dep] of pendingDeposits) {
                if (dep.status !== "pending") continue;
                if (Date.now() > dep.expiresAt) { pendingDeposits.delete(requestId); continue; }
                if (dep.fromSteamId64 !== senderId) continue;
                if (dep.marketHashName !== item.market_hash_name) continue;
                dep.status = "accepting"; // qayta urinishning oldini olish (accept() async)
                offer.accept((err2) => {
                    if (err2) {
                        console.log(`DEPOSIT QABUL XATO (${requestId}):`, err2.message);
                        dep.status = "pending"; // keyingi tsiklda qayta urinadi
                        return;
                    }
                    dep.status = "accepted";
                    dep.offerId = offer.id;
                    dep.receivedItem = { assetId: item.assetid, marketHashName: item.market_hash_name };
                    console.log(`DEPOSIT QABUL QILINDI: ${requestId} <- taklif #${offer.id}`);
                });
                break;
            }
        }
    });
}
setInterval(checkIncomingDeposits, 20_000);

// Eskirgan (24 soatdan ortiq kutilgan, hech qachon kelmagan) yozuvlarni
// vaqti-vaqti bilan tozalash — xotira sizmasligi uchun.
setInterval(() => {
    const now = Date.now();
    for (const [id, dep] of pendingDeposits) {
        if (dep.status === "pending" && now > dep.expiresAt + 24 * 60 * 60 * 1000) pendingDeposits.delete(id);
    }
}, 60 * 60 * 1000);
```

- [ ] **Step 4: Sintaksisni tekshirish**

```bash
node --check "C:/Users/User/Desktop/auction bot/auction bot/docs/superpowers/relay/server.js"
```

Kutilgan: xatosiz o'tadi.

- [ ] **Step 5: Foydalanuvchidan deploy qilishni so'rash**

`docs/superpowers/relay/DEPLOY.md`ga aniq skript yozib qo'ying (masalan `deploy_task1.py` scratchpad'da), va foydalanuvchiga ayting: *"Iltimos, quyidagi buyruqni o'zingiz ishga tushiring: `! python <scratchpad-yo'li>\deploy_task1.py` — bu server.js'ni VPS'ga yuklaydi va relay xizmatini qayta ishga tushiradi."* Javobni kutib, muvaffaqiyatli chiqishini tasdiqlang.

- [ ] **Step 6: Deploy'dan keyin health-check (o'qish-only, avtomatik o'tishi kerak)**

```bash
curl -s -H "x-relay-secret: <STEAM_RELAY_SECRET>" https://155.133.22.217:8443/health
```

Kutilgan: `{"loggedOn":true,...}` (yoki shunga o'xshash, `.env`dagi joriy RELAY_SECRET bilan).

- [ ] **Step 7: Haqiqiy sinov (REAL Steam trade kerak — sandbox yo'q)**

```bash
curl -s -X POST -H "x-relay-secret: <RELAY_SECRET>" -H "content-type: application/json" \
  -d '{"requestId":"test-1","fromSteamId64":"<ADMIN_SHAXSIY_STEAMID64>","marketHashName":"<ADMIN_SHAXSIY_AKKAUNTIDAGI_ARZON_ITEM_NOMI>","ttlMs":900000}' \
  https://155.133.22.217:8443/deposit-expect
```

Admin (foydalanuvchi) o'zining shaxsiy Steam akkauntidan bot akkauntining trade-link'iga (`.env`dagi `STEAM_ID64`ga mos trade URL) aynan shu itemni yuboradi (qo'lda, Steam ilovasi/brauzeridan). 20-40 soniyadan keyin:

```bash
curl -s -H "x-relay-secret: <RELAY_SECRET>" https://155.133.22.217:8443/deposit-status/test-1
```

Kutilgan: `{"status":"accepted","offerId":"...","receivedItem":{...}}`. Agar `"pending"` bo'lib qolsa — relay loglarini tekshiring (`pm2 logs steam-relay`, o'qish-only SSH orqali).

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/relay/server.js docs/superpowers/relay/DEPLOY.md
git commit -m "docs: mirror relay source, add incoming-deposit auto-accept design"
```

(Git allaqachon sozlangan: repo `feature/market-redesign` branch'ida, `main`ga hech qachon to'g'ridan-to'g'ri commit qilinmaydi.)

---

### Task 2: Lis-Skins narx moduli (`lisSkinsPrice.js`) + sozlamalar

**MUHIM OLDIN BAJARILADIGAN SHART:** Lis-Skins'ning "Public User API"si autentifikatsiya (API key) talab qiladi va asosan XARID qilish uchun mo'ljallangan (`lis-skins.stoplight.io/docs/lis-skins/`). Buni tekshirish uchun avval **foydalanuvchi** lis-skins.com'da ro'yxatdan o'tib, API key olishi kerak. Bu qadam SIZ (foydalanuvchi) tomonidan bajarilishi kerak — key olingach shu vazifa davom etadi.

**Files:**
- Create: `lisSkinsPrice.js`
- Modify: `.env.example` — `LIS_SKINS_API_KEY=` qatorini qo'shish
- Modify: `server.js` — `GET /api/admin/settings` va `POST /api/admin/settings` (mavjud, 1874/1895-qatorlar atrofida) — `instantSellMarginPercent` va `usdToSomRate` maydonlarini qo'shish

**Interfaces:**
- Produces (Task 4 iste'mol qiladi):
  - `async function getMarketPriceSom(marketHashName: string): Promise<number|null>` — Lis-Skins'dagi eng arzon faol e'lon narxini so'mda qaytaradi (topilmasa `null`).
  - `function getInstantSellMarginPercent(): number` — `settings.instantSellMarginPercent` yoki default `12`.
  - `function getUsdToSomRate(): number` — `settings.usdToSomRate` yoki default (implementatsiya paytida joriy kursga moslab kiritiladi, masalan `12700`).

- [ ] **Step 1: API key va aniq endpoint'ni tasdiqlash**

Foydalanuvchidan `LIS_SKINS_API_KEY`ni oling, `.env`ga qo'shing. Keyin:

```bash
curl -s -H "Authorization: Bearer $LIS_SKINS_API_KEY" "https://api.lis-skins.com/v1/market/search?names[]=AK-47%20%7C%20Redline%20(Field-Tested)&sort_by=lowest_price"
```

(Bu URL TAXMINIY — `lis-skins.stoplight.io/docs/lis-skins/` sahifasidagi "Export Docs" tugmasi orqali haqiqiy OpenAPI spec'ni yuklab, aniq base URL + endpoint yo'lini shu yerda TASDIQLANG, so'ng quyidagi qadamlarni shunga moslang.) Javobda narx maydoni qanday nomlanganini (masalan `price` — USD'dami, sentda'mi) aniqlang.

- [ ] **Step 2: `lisSkinsPrice.js` yozish**

```js
// Lis-Skins'dan CS2 skin narxini olish — Instant Sell (buyback) va admin
// auto-list narxlarini hisoblash uchun asos. Natija 1 soatga keshlanadi
// (API'ga har so'rovda murojaat qilmaslik uchun).
const CACHE_MS = 60 * 60 * 1000;
const priceCache = new Map(); // marketHashName -> { usd, ts }

async function fetchLisSkinsPriceUsd(marketHashName) {
    const cached = priceCache.get(marketHashName);
    if (cached && Date.now() - cached.ts < CACHE_MS) return cached.usd;

    const apiKey = process.env.LIS_SKINS_API_KEY;
    if (!apiKey) throw new Error("LIS_SKINS_API_KEY .env da sozlanmagan");

    const url = `https://api.lis-skins.com/v1/market/search?names[]=${encodeURIComponent(marketHashName)}&sort_by=lowest_price&per_page=1`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!resp.ok) throw new Error(`Lis-Skins API xato (HTTP ${resp.status})`);
    const body = await resp.json();
    const item = body?.data?.[0] ?? body?.items?.[0] ?? null; // Step 1'da tasdiqlangan haqiqiy shaklga moslang
    const usd = item ? Number(item.price) : null;

    priceCache.set(marketHashName, { usd, ts: Date.now() });
    return usd;
}

const { read } = require("./database/db");
function getSettings() {
    const raw = read("settings");
    return Array.isArray(raw) ? {} : (raw || {});
}
function getInstantSellMarginPercent() {
    const s = getSettings();
    return Number.isFinite(s.instantSellMarginPercent) ? s.instantSellMarginPercent : 12;
}
function getUsdToSomRate() {
    const s = getSettings();
    return Number.isFinite(s.usdToSomRate) && s.usdToSomRate > 0 ? s.usdToSomRate : 12700;
}

// Instant Sell — foydalanuvchiga to'lanadigan narx (Lis narxidan margin kam).
async function getInstantSellPriceSom(marketHashName) {
    const usd = await fetchLisSkinsPriceUsd(marketHashName);
    if (usd == null) return null;
    const margin = getInstantSellMarginPercent() / 100;
    return Math.round(usd * getUsdToSomRate() * (1 - margin));
}

// Admin auto-list — Lis narxining o'zi (foyda ustiga qo'shilmaydi, admin
// panelda ko'rib o'zi o'zgartirishi mumkin).
async function getListPriceSom(marketHashName) {
    const usd = await fetchLisSkinsPriceUsd(marketHashName);
    if (usd == null) return null;
    return Math.round(usd * getUsdToSomRate());
}

module.exports = { getInstantSellPriceSom, getListPriceSom, getInstantSellMarginPercent, getUsdToSomRate };
```

- [ ] **Step 3: Sintaksis va real chaqiruv bilan tekshirish**

```bash
node --check lisSkinsPrice.js
node -e "require('dotenv').config(); require('./lisSkinsPrice').getInstantSellPriceSom('AK-47 | Redline (Field-Tested)').then(console.log).catch(e=>console.log('XATO:',e.message))"
```

Kutilgan: musbat butun son (so'mda) yoki aniq xato xabari (agar API key/endpoint hali noto'g'ri bo'lsa — shu holda Step 1'ga qaytib to'g'rilang).

- [ ] **Step 4: `skinUtils.js`ga `marketHashName` yordamchisini qo'shish**

**MUHIM (pre-flight tekshiruvda topilgan):** Relay inventar javobida (`fetchUserInventory`/`fetchInventory` orqali) Steam'ning haqiqiy `market_hash_name` maydoni MAVJUD EMAS — mavjud kod hech qayerda `item.marketHashName`ga murojaat qilmaydi (`server.js`'dagi `buildSkin()` buni tasdiqlaydi: faqat `name`, `float`, `rarity` va h.k. bor). Shu sabab bu qiymatni o'zimiz, mavjud maydonlardan HOSIL QILAMIZ — Steam'ning market_hash_name formatiga ANIQ mos (StatTrak™ prefiksi item NOMINING o'zida allaqachon bor — `server.js`'dagi `buildSkin()`'ning `statTrak: /StatTrak/i.test(item.name)` qatori buni tasdiqlaydi — shu sabab qo'shimcha StatTrak parametri kerak emas, faqat `name` + wear yetarli).

`skinUtils.js`ga, `wearName` funksiyasidan keyin qo'shing:

```js
// Steam'ning market_hash_name'ini item nomi + float'dan hosil qiladi
// (masalan "AK-47 | Redline (Field-Tested)", yoki StatTrak bo'lsa
// "StatTrak™ AK-47 | Redline (Field-Tested)" — StatTrak prefiksi
// item.name'ning o'zida allaqachon bor). Float/wear bo'lmagan itemlar
// (stiker, agent, keys) uchun nomning o'zi qaytadi. Bu Lis-Skins narx
// qidiruvi VA relay'dagi kiruvchi-trade moslashtirish (Task 1/4) uchun
// ISHLATILADIGAN, Steam formatiga ANIQ mos bo'lishi shart bo'lgan qiymat.
function marketHashName(name, float) {
    const wn = wearName(float);
    return wn ? `${name} (${wn})` : name;
}
```

`module.exports`ga qo'shing: `module.exports = { ..., marketHashName };`

- [ ] **Step 5: Admin sozlamalar API'siga yangi maydonlarni qo'shish**

`server.js`da `GET /api/admin/settings` (1874-qator atrofi) va `POST /api/admin/settings` (1895-qator atrofi) — joriy kodni o'qib, ular qanday `settings` obyektini qaytarish/yozishini ko'ring, so'ng `instantSellMarginPercent` va `usdToSomRate` maydonlarini xuddi shu naqsh bilan (mavjud maydonlar qatoriga) qo'shing.

- [ ] **Step 6: Commit**

```bash
git add lisSkinsPrice.js skinUtils.js .env.example server.js
git commit -m "feat: Lis-Skins narx integratsiyasi + marketHashName yordamchisi"
```

---

### Task 3: `balanceManager.js`'ga reversal (orqaga qaytarish) funksiyasi

**Files:**
- Modify: `balanceManager.js`
- Modify: `database/db.js` — YO'Q, mavjud `withTransaction/readTx/writeTx` ishlatiladi (import qo'shiladi)

**Interfaces:**
- Consumes: `database/db.js`'dan `withTransaction, readTx, writeTx` (mavjud).
- Produces (Task 9 iste'mol qiladi): `async function reverseTradeCreditEntry(userId: number, entryId: string, reason: string): Promise<{ entry, deducted } | { error: string }>`.

- [ ] **Step 1: Import qo'shish**

`balanceManager.js`ning 1-qatoridagi importni yangilang:

```js
const { read, write, withTransaction, readTx, writeTx } = require("./database/db");
```

- [ ] **Step 2: Funksiyani yozish**

Faylning oxiriga, `getAllHoldsForAdmin`dan keyin qo'shing:

```js
// Admin — Instant Sell (yoki istalgan trade-credit) yozuvini BEKOR QILADI:
// balansdan berilgan summani (agar hali sarflanmagan bo'lsa yoki qisman
// sarflangan bo'lsa — mavjud balans miqdorida) ayiradi va yozuvni
// "reversed" deb belgilaydi. Faqat hali KARTAGA CHIQARILMAGAN
// ("withdrawn" bo'lmagan) yozuvlarga ruxsat — pul haqiqatda ketgan bo'lsa,
// bu funksiya orqali qaytarib bo'lmaydi (alohida qo'lda jarayon kerak).
// Tranzaksiya ichida bajariladi — bir vaqtning o'zida user boshqa joyda
// (bid/withdraw) balansini o'zgartirsa ham, ikkalasi bir-birini
// "ko'rmay qolib" pulni noto'g'ri hisoblab qo'ymasligi uchun.
async function reverseTradeCreditEntry(userId, entryId, reason) {
    return withTransaction(async (session) => {
        const ledgers = await readTx(session, "tradeBalances");
        const ledgersArr = Array.isArray(ledgers) ? ledgers : [];
        const ledger = ledgersArr.find(l => l.userId === userId);
        const entry = ledger?.entries.find(e => e.id === entryId);
        if (!entry) return { error: "not_found" };
        if (entry.withdrawalStatus === "withdrawn") return { error: "already_withdrawn" };
        if (entry.withdrawalStatus === "reversed") return { error: "already_reversed" };

        const rawUsers = await readTx(session, "users");
        const users = Array.isArray(rawUsers) ? rawUsers : Object.values(rawUsers);
        const user = users.find(u => u.id === userId);
        const deducted = Math.min(entry.amount, user?.balance ?? 0);

        if (user) {
            user.balance = (user.balance ?? 0) - deducted;
            if (!Array.isArray(user.balanceHistory)) user.balanceHistory = [];
            user.balanceHistory.push({
                amount: -deducted,
                reason: `Bekor qilindi (#${entry.tradeId}): ${reason}`,
                date: new Date().toISOString(),
            });
        }
        entry.withdrawalStatus = "reversed";
        entry.reversedAt = new Date().toISOString();
        entry.reverseReason = reason;

        await writeTx(session, "users", users);
        await writeTx(session, "tradeBalances", ledgersArr);
        return { entry, deducted, cacheUpdates: { users, tradeBalances: ledgersArr } };
    });
}
```

- [ ] **Step 3: `getHoldSummary`ni "reversed" holatini e'tiborsiz qoldirishini tekshirish**

`getHoldSummary` (36-qator atrofi) allaqachon `if (e.withdrawalStatus === "withdrawn") continue;` bilan boshlanadi — bu shart `"reversed"`ni QAMRAB OLMAYDI, ya'ni reversed yozuv hali `frozen`/`available`ga qo'shilib hisoblanib qolishi mumkin (xato). Shu qatorni yangilang:

```js
if (e.withdrawalStatus === "withdrawn" || e.withdrawalStatus === "reversed") continue;
```

- [ ] **Step 4: `module.exports`ga qo'shish**

```js
module.exports = {
    creditTradeProceeds, getHoldSummary,
    requestWithdrawal, getWithdrawalById, approveWithdrawal, rejectWithdrawal,
    getAllHoldsForAdmin, reverseTradeCreditEntry,
};
```

- [ ] **Step 5: Qo'lda tekshirish**

```bash
node --check balanceManager.js
node -e "
require('dotenv').config();
const db = require('./database/db');
db.connect().then(async () => {
  const bm = require('./balanceManager');
  // Test uchun haqiqiy mavjud userId va Instant Sell orqali kredit qilingan entryId kerak
  // (Task 4 tugagach to'liq oqim bilan sinaladi) — hozircha faqat 'not_found' yo'lini tekshiring:
  console.log(await bm.reverseTradeCreditEntry(999999999, 'yoq', 'test'));
  process.exit(0);
});
"
```

Kutilgan: `{ error: 'not_found' }`.

- [ ] **Step 6: Commit**

```bash
git add balanceManager.js
git commit -m "feat: Instant Sell/trade krediti uchun reversal (orqaga qaytarish) funksiyasi"
```

---

### Task 4: `instantSellManager.js` — Instant Sell so'rov hayot sikli

**Files:**
- Create: `instantSellManager.js`

**Interfaces:**
- Consumes: `lisSkinsPrice.js`'dan `getInstantSellPriceSom` (Task 2), `database/db.js`'dan `read, write` (oddiy, tranzaksiyasiz — sabab: bu yerda YANGI pul-yozish primitivi yaratilmaydi, faqat so'rov holati (`awaiting_deposit`→`credited`/`expired`/`mismatch`) kuzatiladi va pul harakati MAVJUD, o'zgartirilmagan `balanceManager.creditTradeProceeds`ga (parametr sifatida uzatiladi, to'g'ridan-to'g'ri import qilinmaydi — pastdagi Step 1'ga qarang) topshiriladi).
- Produces (Task 5, 6, 7 iste'mol qiladi) — **ANIQ imzolar, quyidagi Step 1 kodi bilan bir xil:**
  - `async function createInstantSellRequest(userId, assetId, marketHashName, steamId64): Promise<{ request } | { error }>`
  - `function getInstantSellRequest(id)`
  - `async function pollAndCreditPendingRequests(creditTradeProceeds, onCredited): Promise<Array<{request}>>` — `creditTradeProceeds` va `onCredited` CHAQIRUVCHI (Task 5/index.js) tomonidan in'ektsiya qilinadi (`balanceManager.creditTradeProceeds`ni to'g'ridan-to'g'ri import qilish o'rniga) — modulni balanceManager'dan mustaqil, sinash oson qiladi.
  - `function getMyInstantSellRequests(userId)`

- [ ] **Step 1: Faylni yozish**

```js
// Instant Sell — foydalanuvchi o'z Steam inventaridan skin tanlab, tizimga
// (bot akkauntiga) DARHOL naqd evaziga sotadi. Oqim:
//   1. createInstantSellRequest — narx hisoblanadi, relay'ga "shu itemni,
//      shu userdan kutyapman" deb ro'yxatga olinadi (POST /deposit-expect).
//   2. Foydalanuvchi Steam orqali (o'zi, tizim tashqarisida) itemni bot
//      trade-link'iga yuboradi.
//   3. pollAndCreditPendingRequests (index.js'dagi setInterval orqali,
//      tradeDelivery.js/withdrawDelivery.js bilan bir xil naqsh) relay'dan
//      holatni so'raydi: "accepted" bo'lsa — item nomi ANIQ mos kelishini
//      YANA BIR BOR tekshirib (ikki bosqichli tasdiqlash), keyingina
//      balanceManager.creditTradeProceeds() chaqiradi.
const { read, write } = require("./database/db");
const { getInstantSellPriceSom } = require("./lisSkinsPrice");

const REQUEST_TTL_MS = 15 * 60 * 1000; // 15 daqiqa — shu vaqt ichida item kelmasa eskiradi

function relayHeaders() {
    return { "x-relay-secret": process.env.STEAM_RELAY_SECRET, "content-type": "application/json" };
}
function relayBase() {
    const url = process.env.STEAM_RELAY_URL;
    if (!url) throw new Error("STEAM_RELAY_URL sozlanmagan");
    return url.replace(/\/$/, "");
}

function getAllRequests() {
    const raw = read("instantSellRequests");
    return Array.isArray(raw) ? raw : [];
}
function saveAllRequests(arr) { write("instantSellRequests", arr); }

function getInstantSellRequest(id) {
    return getAllRequests().find(r => r.id === id) || null;
}
function getMyInstantSellRequests(userId) {
    return getAllRequests().filter(r => r.userId === userId).sort((a, b) => b.id - a.id);
}

// `marketHashName` — Steam market_hash_name (masalan "AK-47 | Redline
// (Field-Tested)") — narx VA relay'dagi item-mosligini tekshirish shu
// nom bo'yicha (aniq float emas — sabab: incoming trade offer'da GC float
// ma'lumoti yo'q, faqat market_hash_name kafolatlangan bor; narxlash ham
// odatda wear-tier darajasida, aniq float darajasida emas).
async function createInstantSellRequest(userId, assetId, marketHashName, steamId64) {
    const priceSom = await getInstantSellPriceSom(marketHashName);
    if (priceSom == null) return { error: "price_not_found" };

    const id = Date.now();
    const request = {
        id, userId, assetId, marketHashName,
        priceSom, status: "awaiting_deposit",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + REQUEST_TTL_MS).toISOString(),
        creditedAt: null,
    };

    const resp = await fetch(`${relayBase()}/deposit-expect`, {
        method: "POST", headers: relayHeaders(),
        body: JSON.stringify({
            requestId: String(id),
            fromSteamId64: steamId64,
            marketHashName,
            ttlMs: REQUEST_TTL_MS,
        }),
    });
    if (!resp.ok) return { error: "relay_unavailable" };

    const all = getAllRequests();
    all.push(request);
    saveAllRequests(all);
    return { request };
}

// index.js'dagi setInterval orqali chaqiriladi. `onCredited(user, request)` —
// bildirishnoma yuborish uchun. `_polling` — agar oldingi chaqiruv (masalan
// relay sekin javob bergani uchun) hali tugamagan bo'lsa, ustma-ust
// ishga tushib bir xil so'rovni ikki marta kreditlab qo'ymasligi uchun.
let _polling = false;
async function pollAndCreditPendingRequests(creditTradeProceeds, onCredited) {
    if (_polling) return [];
    _polling = true;
    try {
        return await _pollAndCreditPendingRequestsInner(creditTradeProceeds, onCredited);
    } finally {
        _polling = false;
    }
}

async function _pollAndCreditPendingRequestsInner(creditTradeProceeds, onCredited) {
    const all = getAllRequests();
    const pending = all.filter(r => r.status === "awaiting_deposit" && new Date(r.expiresAt).getTime() > Date.now());
    if (!pending.length) {
        // Eskirganlarni belgilash
        let changed = false;
        for (const r of all) {
            if (r.status === "awaiting_deposit" && new Date(r.expiresAt).getTime() <= Date.now()) {
                r.status = "expired";
                changed = true;
            }
        }
        if (changed) saveAllRequests(all);
        return [];
    }

    const results = [];
    for (const request of pending) {
        let body;
        try {
            const resp = await fetch(`${relayBase()}/deposit-status/${request.id}`, { headers: relayHeaders() });
            body = await resp.json();
        } catch {
            continue; // relay vaqtincha ishlamasa — keyingi tsiklda qayta tekshiramiz
        }

        if (body.status === "expired") {
            request.status = "expired";
        } else if (body.status === "accepted") {
            // Ikkinchi bosqichli tekshiruv: kelgan item nomi so'ralganiga ANIQ mos kelishi shart.
            if (body.receivedItem?.marketHashName !== request.marketHashName) {
                request.status = "mismatch"; // admin diqqatiga — pul BERILMAYDI
            } else {
                request.status = "credited";
                request.creditedAt = new Date().toISOString();
                request.receivedAssetId = body.receivedItem.assetId;
                creditTradeProceeds(request.userId, request.priceSom, request.id, 0);
                results.push({ request });
            }
        }
    }
    saveAllRequests(all);
    return results;
}

module.exports = { createInstantSellRequest, getInstantSellRequest, getMyInstantSellRequests, pollAndCreditPendingRequests };
```

- [ ] **Step 2: Sintaksis tekshiruvi**

```bash
node --check instantSellManager.js
```

- [ ] **Step 3: `creditTradeProceeds` chaqiruvi mos kelishini tekshirish**

`balanceManager.creditTradeProceeds(userId, amount, tradeId, fee)` imzosi bilan yuqoridagi `creditTradeProceeds(request.userId, request.priceSom, request.id, 0)` chaqiruvini solishtiring — mos (fee=0, chunki Instant Sell'da komissiya yo'q, foyda allaqachon margin orqali olingan).

- [ ] **Step 4: Commit**

```bash
git add instantSellManager.js
git commit -m "feat: Instant Sell so'rov hayot sikli (instantSellManager.js)"
```

---

### Task 5: `index.js`ga davriy tekshiruvni ulash

**Files:**
- Modify: `index.js`

**Interfaces:**
- Consumes: `instantSellManager.pollAndCreditPendingRequests` (Task 4), `balanceManager.creditTradeProceeds` (mavjud), `notify.js`'dan `notifyUser` (mavjud).

- [ ] **Step 1: Import qo'shish**

`index.js`ning yuqorisiga (4-qator atrofi, boshqa importlar bilan birga):

```js
const instantSellManager = require("./instantSellManager");
const balanceManager = require("./balanceManager");
```

- [ ] **Step 2: setInterval qo'shish**

`tradeHandler.checkAutoDeliveries` chaqiruvchi setInterval'dan (76-83-qatorlar) keyin, xuddi shu uslubda:

```js
// ── Instant Sell: kutilayotgan depozitlarni tekshirish (relay orqali) ────
setInterval(async () => {
    try {
        const credited = await instantSellManager.pollAndCreditPendingRequests(
            balanceManager.creditTradeProceeds,
            () => {}
        );
        for (const { request } of credited) {
            notifyUser(request.userId,
                `✅ *Tezkor sotish yakunlandi!*\n\n💰 *${request.priceSom.toLocaleString()} so'm* hisobingizga tushdi.\n\n🧊 7 kundan keyin "Balans" bo'limidan yechib olishingiz mumkin bo'ladi.`,
                bot.telegram.sendMessage.bind(bot.telegram), { parse_mode: "Markdown" }
            );
        }
    } catch (err) {
        console.log("INSTANT SELL TEKSHIRUV XATO:", err.message);
    }
}, 30_000);
```

- [ ] **Step 3: Sintaksis va ishga tushirish tekshiruvi**

```bash
node --check index.js
node index.js
```

Kutilgan: bot va server xatosiz ishga tushadi, konsolda `INSTANT SELL TEKSHIRUV XATO` chiqmaydi (yoki faqat relay vaqtincha ishlamasa chiqadi — bu normal). `Ctrl+C` bilan to'xtating.

- [ ] **Step 4: Commit**

```bash
git add index.js
git commit -m "feat: Instant Sell davriy tekshiruvini index.js'ga ulash"
```

---

### Task 6: Bot (Telegram) — Instant Sell oqimi + Market'ni admin-only qilish

**Files:**
- Modify: `handlers/marketHandler.js`

**Interfaces:**
- Consumes: `instantSellManager.createInstantSellRequest` (Task 4), mavjud `fetchUserInventory`, `skinUtils.paginate`, `tradeManager.createTrade`.

- [ ] **Step 1: `market_new`ni admin-only qilish**

`handlers/marketHandler.js`, 106-qatordagi handler:

```js
bot.action("market_new", async (ctx) => {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return ctx.answerCbQuery("❌ Faqat admin sotuvga qo'ya oladi.", true);
    const user = getUser(ctx.from.id);
    ...
```

(`isAdmin(ctx)` funksiyasi 30-qatorda allaqachon mavjud — faqat shu bitta tekshiruvni qo'shing.)

- [ ] **Step 2: Katalog sahifasiga "⚡ Tezkor sotish" tugmasini qo'shish**

`showMarketList` funksiyasida (33-qator), `rows` massividagi birinchi qatorni (40-42-qatorlar) yangilang:

```js
const rows = [];
if (isAdmin({ from: { id: user.id } })) {
    rows.push([Markup.button.callback("➕ Sotuvga qo'yish", "market_new")]);
} else {
    rows.push([Markup.button.callback("⚡ Tezkor sotish (o'z skiningizni soting)", "instant_sell_new")]);
}
rows.push([Markup.button.callback("📋 Mening bozorim", "market_mine")]);
```

- [ ] **Step 3: Instant Sell oqimini yozish**

`marketHandler.js`ning `module.exports = (bot) => { ... }` ichiga, `bot.action("market_new", ...)`dan keyin qo'shing:

```js
const instantSellManager = require("../instantSellManager");
const pendingInstantSell = {}; // userId -> assetId (tanlangandan keyin, tasdiqlashni kutayotgan payt)

bot.action("instant_sell_new", async (ctx) => {
    await ctx.answerCbQuery();
    const user = getUser(ctx.from.id);
    if (!user) return;
    if (!user.steamId64) {
        const nonce = createPendingAuth(user.id, "bidder");
        const url = `${process.env.WEBAPP_URL}/api/auth/steam/start?state=${nonce}`;
        return ctx.editMessageText(
            "🔗 *Tezkor sotish uchun avval Steam hisobingizni ulang:*",
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([
                [Markup.button.url("🔗 Steam orqali ulash", url)],
                [Markup.button.callback("⬅️ Orqaga", "back_to_market")],
            ])}
        ).catch(() => {});
    }
    if (!user.tradeLink) {
        return ctx.editMessageText(
            "⚠️ *Tezkor sotish uchun avval Trade Link kiritishingiz kerak.* Profil bo'limidan kiriting.",
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", "back_to_market")]]) }
        ).catch(() => {});
    }
    await showInstantSellInventoryPicker(ctx, user, true);
});

async function showInstantSellInventoryPicker(ctx, user, edit) {
    let items;
    try { items = await fetchUserInventory(user.steamId64); }
    catch (err) {
        const msg = `❌ Inventarni olishda xato: ${err.message}`;
        const opts = Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", "back_to_market")]]);
        try { return edit ? await ctx.editMessageText(msg, opts) : await ctx.reply(msg, opts); } catch {}
        return;
    }
    const tradable = items.filter(it => it.tradable !== false);
    const { pageItems, totalPages, total } = skinUtils.paginate(tradable, 0, INVENTORY_PAGE_SIZE);
    if (!total) {
        const msg = "😔 Steam inventaringizda savdo qilinadigan itemlar topilmadi.";
        return ctx.editMessageText(msg, Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", "back_to_market")]])).catch(() => {});
    }
    const rows = pageItems.map(it => [Markup.button.callback(
        `${it.name}${it.float != null ? ` (${skinUtils.wearCode(it.float)})` : ""}`,
        `is_pick_${it.assetId}`
    )]);
    rows.push([Markup.button.callback("⬅️ Orqaga", "back_to_market")]);
    const text = `⚡ *Tezkor sotish — skinni tanlang:* (${total} ta)`;
    const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) };
    try { return edit ? await ctx.editMessageText(text, opts) : await ctx.reply(text, opts); } catch {}
}

bot.action(/^is_pick_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const user = getUser(ctx.from.id);
    if (!user) return;
    const assetId = ctx.match[1];
    let items;
    try { items = await fetchUserInventory(user.steamId64); }
    catch (err) { return ctx.answerCbQuery("❌ Inventar xatosi: " + err.message, true); }
    const item = items.find(it => String(it.assetId) === assetId);
    if (!item) return ctx.answerCbQuery("❌ Item topilmadi (kesh eskirgan).", true);
    // `marketHashName` relay javobida YO'Q — Steam formatiga mos ravishda
    // o'zimiz hosil qilamiz (Task 2'da qo'shilgan skinUtils.marketHashName).
    const marketHashName = skinUtils.marketHashName(item.name, item.float);

    let priceSom;
    try {
        const { getInstantSellPriceSom } = require("../lisSkinsPrice");
        priceSom = await getInstantSellPriceSom(marketHashName);
    } catch (err) { return ctx.answerCbQuery("❌ Narx olishda xato: " + err.message, true); }
    if (priceSom == null) return ctx.answerCbQuery("❌ Bu skin uchun narx topilmadi.", true);

    pendingInstantSell[user.id] = { assetId: item.assetId, marketHashName, name: item.name, priceSom };
    await ctx.editMessageText(
        `⚡ *"${item.name}"*\n\n💰 Taklif: *${priceSom.toLocaleString()} so'm* (darhol to'lanadi)\n\nTasdiqlaysizmi?`,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Ha, sotaman", "is_confirm")],
            [Markup.button.callback("❌ Bekor", "back_to_market")],
        ])}
    ).catch(() => {});
});

bot.action("is_confirm", async (ctx) => {
    await ctx.answerCbQuery();
    const user = getUser(ctx.from.id);
    const pending = pendingInstantSell[user.id];
    if (!pending) return ctx.answerCbQuery("❌ So'rov topilmadi, qaytadan boshlang.", true);
    delete pendingInstantSell[user.id];

    const result = await instantSellManager.createInstantSellRequest(user.id, pending.assetId, pending.marketHashName, user.steamId64);
    if (result.error) return ctx.answerCbQuery("❌ Xatolik: " + result.error, true);

    const botTradeUrl = process.env.BOT_STEAM_TRADE_URL || "(admin bilan bog'laning)";
    await ctx.editMessageText(
        `📤 *"${pending.name}"* itemini quyidagi trade-link'ga yuboring:*\n\n\`${botTradeUrl}\`\n\n` +
        `⚠️ FAQAT shu itemni yuboring, hech narsa so'ramang. Qabul qilingach, *${pending.priceSom.toLocaleString()} so'm* darhol balansingizga tushadi.\n\n⏰ So'rov 15 daqiqa amal qiladi.`,
        { parse_mode: "Markdown" }
    ).catch(() => {});
});
```

Eslatma: `process.env.BOT_STEAM_TRADE_URL` — bu YANGI `.env` o'zgaruvchisi (bot akkauntining o'zining trade-link'i, `steamcommunity.com/tradeoffer/new/?partner=...&token=...`). Uni `.env.example`ga qo'shing va foydalanuvchidan bot akkauntining haqiqiy trade-link'ini so'rab, `.env`ga yozdiring.

- [ ] **Step 2: Sintaksis tekshiruvi**

```bash
node --check "handlers/marketHandler.js"
```

- [ ] **Step 3: Botni ishga tushirib qo'lda sinash**

```bash
node index.js
```

Telegram'da: (a) admin bo'lmagan test-akkaunt bilan "🛒 Market" → "⚡ Tezkor sotish" tugmasi ko'rinishini, (b) admin akkaunt bilan "➕ Sotuvga qo'yish" hali ishlashini, (c) oddiy user "➕ Sotuvga qo'yish"ni endi umuman KO'RMASLIGINI tasdiqlang.

- [ ] **Step 4: Commit**

```bash
git add handlers/marketHandler.js .env.example
git commit -m "feat: bot'da Instant Sell oqimi, Market'ga qo'yishni admin-only qilish"
```

---

### Task 7: Mini App — Instant Sell sahifasi + Market grid'ning birinchi kartasi + API

**Files:**
- Modify: `server.js` — yangi routelar: `POST /api/instant-sell`, `GET /api/instant-sell-mine`; `POST /api/market`ni admin-only qilish
- Modify: `miniapp/src/pages/MarketSell.jsx` — oddiy user uchun Instant Sell oqimiga aylantirish (admin bo'lsa eski oqim qoladi)
- Modify: `miniapp/src/pages/Market.jsx` — grid'ning birinchi kartasi

**Interfaces:**
- Consumes: `instantSellManager` (Task 4), mavjud `api()` helper (miniapp), mavjud `auth` middleware.

- [ ] **Step 1: `server.js`ga API qo'shish**

`POST /api/market` (1116-qator) ustiga admin tekshiruvi qo'shing:

```js
app.post("/api/market", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    if (u.id !== Number(process.env.ADMIN_ID)) return res.status(403).json({ error: "forbidden" });
    ...
```

`POST /api/market/:id/cancel` (1154-qator) — o'zgarishsiz qoladi (faqat sellerId'ga tegishli, admin bo'lgani uchun avtomatik to'g'ri ishlaydi).

Shundan keyin, `/api/trade-hold-summary` (1168-qator)dan OLDIN, yangi routelarni qo'shing:

```js
// POST /api/instant-sell — { assetId } — o'z Steam inventaridan skinni
// tizimga darhol sotish (narx Lis-Skins asosida hisoblanadi).
app.post("/api/instant-sell", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    if (!u.steamId64) return res.status(400).json({ error: "Avval Steam hisobingizni ulang" });
    if (!u.tradeLink) return res.status(400).json({ error: "Avval Trade Link kiriting" });

    const assetId = req.body.assetId;
    if (!assetId) return res.status(400).json({ error: "assetId kerak" });

    let items;
    try { items = await fetchUserInventory(u.steamId64); }
    catch (err) { return res.status(500).json({ error: err.message }); }
    const item = items.find(it => String(it.assetId) === String(assetId));
    if (!item) return res.status(404).json({ error: "Item topilmadi (kesh eskirgan)" });
    // `marketHashName` relay javobida YO'Q — Task 2'da qo'shilgan
    // skinUtils.marketHashName orqali Steam formatiga mos hosil qilinadi.
    const marketHashName = skinUtils.marketHashName(item.name, item.float);

    const result = await instantSellManager.createInstantSellRequest(u.id, item.assetId, marketHashName, u.steamId64);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ request: result.request, botTradeUrl: process.env.BOT_STEAM_TRADE_URL || null });
});

// GET /api/instant-sell-mine — mening Instant Sell so'rovlarim tarixi
app.get("/api/instant-sell-mine", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json(instantSellManager.getMyInstantSellRequests(u.id));
});
```

Fayl boshiga `const instantSellManager = require("./instantSellManager");` qo'shing (boshqa require'lar bilan birga).

- [ ] **Step 2: Sintaksis tekshiruvi va manual curl**

```bash
node --check server.js
node index.js
```

Alohida terminalda (server ishlab turganda, haqiqiy `x-init-data` yoki `x-dev-uid`/`x-dev-secret` bilan — `.env`dagi `DEV_BYPASS_SECRET` orqali, lokal muhitda):

```bash
curl -s -X POST http://localhost:3000/api/instant-sell -H "content-type: application/json" -H "x-dev-uid: <TEST_USER_ID>" -H "x-dev-secret: <DEV_BYPASS_SECRET>" -d '{"assetId":"<HAQIQIY_ASSET_ID>"}'
```

Kutilgan: `{ request: {...}, botTradeUrl: ... }` yoki aniq xato (`price_not_found`, `forbidden` va h.k.).

- [ ] **Step 3: `MarketSell.jsx`ni Instant Sell'ga moslashtirish**

`miniapp/src/pages/MarketSell.jsx`da, `confirmCreate` funksiyasi (56-qator atrofi, joriy kodni to'liq o'qib) — admin bo'lmagan userlar uchun oqimni o'zgartiring: narx input o'rniga, item tanlangach DARHOL `/api/instant-sell` chaqiriladigan tasdiqlash ekrani ko'rsating (bot UI'dagi Step 3-4'ga o'xshab). Admin (`user.id === ADMIN_ID` — buni frontendga `user` obyekti orqali `isAdmin` maydoni sifatida `server.js`ning `/api/me`ga o'xshash joyidan uzatilishini tekshiring) hali eski "narx kiriting → `/api/market` chaqiring" oqimini ko'radi.

Aniq UI: item tanlangach narx input o'rniga:
```jsx
{selected && !user.isAdmin && (
  <div className="space-y-3">
    <InstantSellQuote item={selected} />
    {/* InstantSellQuote — /api/instant-sell-price?marketHashName=... kabi
        yordamchi endpoint chaqirib (yoki to'g'ridan-to'g'ri POST /api/instant-sell
        chaqirib natijasini ko'rsatib), tasdiqlash tugmasini chiqaradi */}
  </div>
)}
```

(Bu qadam UI-og'ir bo'lgani uchun, aniq JSX'ni implementatsiya paytida mavjud `MarketSell.jsx`'ning to'liq faylini o'qib, uning holat-boshqaruv (state) uslubiga moslab yozing — yuqoridagi server-tomon API allaqachon to'liq, frontend faqat shuni chaqiradi.)

- [ ] **Step 4: `Market.jsx`ga "Tezkor sotish" kartasi**

`miniapp/src/pages/Market.jsx`, `GRID_CLASSES` bilan chizilgan grid (186-192-qatorlar) ustiga, birinchi element sifatida qo'shing:

```jsx
{listings && listings.length >= 0 && (
  <div className={GRID_CLASSES}>
    <InstantSellCard onClick={goSell} delay={0} />
    {listings.map((l, i) => (
      <MarketCard key={l.id} listing={l} delay={(i + 1) * 45} onClick={() => navigate("market-detail", l.id)} />
    ))}
  </div>
)}
```

`InstantSellCard` — `MarketCard`ga o'xshash komponent, lekin skin rasmi o'rniga ⚡ ikonka va "Tezkor sotish" matni bilan (fayl boshiga, `MarketCard`dan keyin qo'shing).

- [ ] **Step 5: Miniapp build tekshiruvi**

```bash
cd miniapp && npm run build
```

Kutilgan: xatosiz build. Xato chiqsa, JSX sintaksisini to'g'rilang.

- [ ] **Step 6: Commit**

```bash
git add server.js miniapp/src/pages/MarketSell.jsx miniapp/src/pages/Market.jsx
git commit -m "feat: miniapp'da Instant Sell UI va Market grid'ning birinchi kartasi"
```

---

### Task 8: Admin — bulk-list va auto-list (bot akkaunti inventari asosida)

**Files:**
- Create: `miniapp/src/admin/pages/AdminMarket.jsx`
- Modify: `miniapp/src/admin/AdminApp.jsx` — yangi sahifa route'i (mavjud route'lar qanday ro'yxatlanganini ko'rib, shu naqsh bilan qo'shing)
- Modify: `server.js` — yangi admin routelar

**Interfaces:**
- Consumes: `steam.js`'dan `fetchInventory()` (bot akkaunti, mavjud — admin.steamId64 EMAS), `lisSkinsPrice.getListPriceSom` (Task 2), `tradeManager.createTrade` (mavjud).

- [ ] **Step 1: `server.js`ga admin bulk/auto-list API**

`GET /api/admin/steam-inventory` (1549-qator)dan keyin qo'shing:

```js
// GET /api/admin/steam-inventory-grouped — bot akkauntining inventarini
// nom+wear bo'yicha guruhlab qaytaradi (bulk-list uchun — bir xil skinning
// nechta nusxasi bo'lsa bittasiga narx belgilab, hammasini birdaniga
// sotuvga chiqarish mumkin bo'lishi uchun).
app.get("/api/admin/steam-inventory-grouped", requireAdminPanel, async (req, res) => {
    try {
        const items = await fetchInventory(req.query.refresh === "1");
        const groups = new Map();
        for (const it of items) {
            if (it.tradable === false) continue;
            const key = `${it.name}::${skinUtils.wearCode(it.float) ?? ""}`;
            if (!groups.has(key)) groups.set(key, { name: it.name, wear: skinUtils.wearCode(it.float), marketHashName: skinUtils.marketHashName(it.name, it.float), items: [] });
            groups.get(key).items.push(it);
        }
        res.json([...groups.values()].map(g => ({ ...g, count: g.items.length })));
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// GET /api/admin/list-price?marketHashName=...
app.get("/api/admin/list-price", requireAdminPanel, async (req, res) => {
    try {
        const price = await lisSkinsPrice.getListPriceSom(String(req.query.marketHashName || ""));
        res.json({ priceSom: price });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// POST /api/admin/market-bulk-list — { assetIds: string[], price: number }
// Bir xil guruhdagi bir nechta itemni bittasiga narx belgilab, HAMMASINI
// alohida-alohida market e'loni qilib bir vaqtda yaratadi.
app.post("/api/admin/market-bulk-list", requireAdminPanel, async (req, res) => {
    const { assetIds, price } = req.body || {};
    if (!Array.isArray(assetIds) || !assetIds.length) return res.status(400).json({ error: "assetIds kerak" });
    if (!Number.isFinite(price) || price < MIN_TRADE_PRICE) return res.status(400).json({ error: "min_price" });

    let items;
    try { items = await fetchInventory(); }
    catch (err) { return res.status(502).json({ error: err.message }); }

    const created = [];
    const adminId = Number(process.env.ADMIN_ID);
    for (const assetId of assetIds) {
        const item = items.find(it => String(it.assetId) === String(assetId));
        if (!item) continue;
        const trade = tradeManager.createTrade(adminId, [buildSkin(item)], "website", price, "public", null, "market");
        created.push(trade.id);
    }
    res.json({ created });
});
```

`lisSkinsPrice` require qiling (fayl boshida): `const lisSkinsPrice = require("./lisSkinsPrice");`.

- [ ] **Step 2: `AdminMarket.jsx` sahifasini yozish**

`miniapp/src/admin/pages/AdminAuctionForm.jsx`ni AVVAL o'qib, uning inventar-tanlash UI naqshini (bot inventaridan item(lar) tanlash) namuna qilib oling. `AdminMarket.jsx`:

```jsx
import { useEffect, useState } from "react";
import { adminApi } from "../adminApi"; // mavjud admin-panel API helper — aniq nomini AdminAuctionForm.jsx'dan tasdiqlang

export default function AdminMarket() {
  const [groups, setGroups] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [price, setPrice] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi("/api/admin/steam-inventory-grouped").then(setGroups);
  }, []);

  async function suggestPrice() {
    setSuggesting(true);
    try {
      const r = await adminApi(`/api/admin/list-price?marketHashName=${encodeURIComponent(selectedGroup.marketHashName)}`);
      if (r.priceSom != null) setPrice(String(r.priceSom));
    } finally {
      setSuggesting(false);
    }
  }

  async function submitBulkList() {
    setBusy(true);
    try {
      await adminApi("/api/admin/market-bulk-list", {
        method: "POST",
        body: JSON.stringify({ assetIds: selectedGroup.items.map(i => i.assetId), price: Number(price) }),
      });
      setSelectedGroup(null);
      setPrice("");
      const fresh = await adminApi("/api/admin/steam-inventory-grouped");
      setGroups(fresh);
    } finally {
      setBusy(false);
    }
  }

  if (!groups) return <p>Yuklanmoqda...</p>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Market — bot inventaridan sotuvga qo'yish</h1>
      <div className="space-y-2">
        {groups.map((g, i) => (
          <button key={i} type="button" onClick={() => setSelectedGroup(g)} className="flex w-full items-center justify-between border p-3 text-left">
            <span>{g.name} {g.wear ? `(${g.wear})` : ""}</span>
            <span className="font-bold">{g.count} ta</span>
          </button>
        ))}
      </div>
      {selectedGroup && (
        <div className="space-y-2 border p-4">
          <p>{selectedGroup.name} — {selectedGroup.count} ta nusxa sotuvga chiqariladi</p>
          <div className="flex gap-2">
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Narx (so'm)" className="border p-2" />
            <button type="button" onClick={suggestPrice} disabled={suggesting}>Lis narxidan taklif qil</button>
          </div>
          <button type="button" onClick={submitBulkList} disabled={busy || !price}>Hammasini sotuvga qo'yish ({selectedGroup.count} ta)</button>
        </div>
      )}
    </div>
  );
}
```

(`adminApi` helper'ning haqiqiy import yo'li/imzosi `AdminAuctions.jsx`dan tasdiqlanadi — yuqoridagi taxminiy, implementatsiya paytida moslang.)

- [ ] **Step 3: Route'ga qo'shish**

`AdminApp.jsx`da mavjud sahifalar (masalan `AdminAuctions`) qanday route qilinganini ko'rib, `AdminMarket`ni xuddi shunday (masalan yon menyuga "🛒 Market" havolasi + route) qo'shing.

- [ ] **Step 4: Build va qo'lda tekshirish**

```bash
cd miniapp && npm run build
```

Admin panelga kirib (mavjud login orqali), yangi "Market" sahifasini oching, bot inventaridan bir nechta bir xil skin guruhini ko'ring, narx taklif qiling, bulk-list qiling, so'ng oddiy Market sahifasida (`/api/market`) yangi e'lonlar ko'rinishini tasdiqlang.

- [ ] **Step 5: Commit**

```bash
git add server.js miniapp/src/admin/pages/AdminMarket.jsx miniapp/src/admin/AdminApp.jsx
git commit -m "feat: admin panelda market bulk-list va Lis-Skins narx taklifi"
```

---

### Task 9: Admin — Instant Sell yozuvini bekor qilish (reversal) UI

**Files:**
- Modify: `handlers/adminHandler.js`

**Interfaces:**
- Consumes: `balanceManager.reverseTradeCreditEntry` (Task 3), `balanceManager.getAllHoldsForAdmin` (mavjud).

- [ ] **Step 1: "🔒 muzlatilgan mablag'lar" ko'rinishiga har bir yozuv uchun tugma qo'shish**

`handlers/adminHandler.js`, 179-194-qatorlardagi `bot.hears(ADMIN_BTNS.holds, ...)` handlerini kengaytiring — hozir faqat JAMI summalarni matn sifatida ko'rsatadi, endi har bir USER uchun alohida tugma qo'shing (bosilganda o'sha userning yozuvlari ro'yxati chiqadi):

```js
bot.hears(ADMIN_BTNS.holds, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const holds = balanceManager.getAllHoldsForAdmin();
    if (!holds.length) return ctx.reply("📭 Hozircha obmen orqali muzlatilgan mablag' yo'q.");
    const users = readUsers();
    const rows = holds.map(h => {
        const u = users.find(x => x.id === h.userId);
        return [Markup.button.callback(`👤 ${u?.name ?? h.userId} — 🧊 ${h.frozen.toLocaleString()} so'm`, `holds_user_${h.userId}`)];
    });
    ctx.reply("🔒 *Obmen — muzlatilgan mablag'lar*\n\nBatafsil ko'rish uchun userni tanlang:", { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
});

bot.action(/^holds_user_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;
    const userId = Number(ctx.match[1]);
    const ledger = require("../database/db").read("tradeBalances").find(l => l.userId === userId);
    const entries = (ledger?.entries || []).filter(e => e.withdrawalStatus !== "withdrawn" && e.withdrawalStatus !== "reversed");
    if (!entries.length) return ctx.editMessageText("📭 Bu userda faol yozuv yo'q.").catch(() => {});
    const rows = entries.map(e => [Markup.button.callback(
        `#${e.tradeId} — ${e.amount.toLocaleString()} so'm (${new Date(e.receivedAt).toLocaleDateString("uz-UZ")})`,
        `holds_entry_${userId}_${e.id}`
    )]);
    ctx.editMessageText(`👤 *User ${userId}* — faol yozuvlar:`, { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) }).catch(() => {});
});

bot.action(/^holds_entry_(\d+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;
    const userId = Number(ctx.match[1]);
    const entryId = ctx.match[2];
    ctx.editMessageText(
        `⚠️ *#${entryId} yozuvini bekor qilasizmi?* Bu userning balansidan mos summa AYIRILADI.`,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Ha, bekor qilish", `holds_reverse_${userId}_${entryId}`)],
            [Markup.button.callback("❌ Yo'q", "back_to_admin_home")],
        ])}
    ).catch(() => {});
});

bot.action(/^holds_reverse_(\d+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;
    const userId = Number(ctx.match[1]);
    const entryId = ctx.match[2];
    const result = await balanceManager.reverseTradeCreditEntry(userId, entryId, "Admin tomonidan bekor qilindi");
    if (result.error) return ctx.editMessageText(`❌ Xatolik: ${result.error}`).catch(() => {});
    ctx.editMessageText(`✅ Bekor qilindi. ${result.deducted.toLocaleString()} so'm balansdan ayirildi.`).catch(() => {});
    notifyUser(userId,
        `⚠️ *Diqqat!* Sizning oldingi Instant Sell/Obmen tranzaksiyangiz (#${entryId}) bekor qilindi, ${result.deducted.toLocaleString()} so'm balansingizdan ayirildi. Savol bo'lsa admin bilan bog'laning.`,
        bot.telegram.sendMessage.bind(bot.telegram), { parse_mode: "Markdown" }
    );
});
```

Eslatma: `back_to_admin_home` — mavjud bo'lmasa, o'rniga oddiy `ctx.editMessageText("Bekor qilindi.")` qo'ying (mavjud admin menyu callback nomlarini `adminHandler.js`dan tasdiqlang).

- [ ] **Step 2: Sintaksis va qo'lda tekshirish**

```bash
node --check "handlers/adminHandler.js"
node index.js
```

Telegram'da admin sifatida "🔒 muzlatilgan mablag'lar"ni bosib, bitta test userning bitta yozuvini bekor qiling, uning balansi kamayganini (`/api/inventory` yoki bot orqali "Balans"ni tekshirib) tasdiqlang.

- [ ] **Step 3: Commit**

```bash
git add handlers/adminHandler.js
git commit -m "feat: admin uchun Instant Sell/trade krediti yozuvini bekor qilish (reversal) UI"
```

---

### Task 10: Xaridor — "Mening inventarim" (site inventory) + istalgan payt Steam'ga chiqarib olish

**Files:**
- Modify: `withdrawDelivery.js` — generic qilish (`wins`dan tashqari `marketPurchases`ni ham qo'llab-quvvatlash)
- Modify: `server.js` — market xaridida `user.marketPurchases`ga yozish + yangi `POST /api/market-withdraw/:purchaseId`
- Modify: `miniapp/src/pages/Market.jsx` (yoki alohida `MarketMine.jsx`, mavjud "Mening bozorim" tab'ini kengaytirib) — xarid qilingan itemlar uchun "Chiqarib olish" tugmasi

**Interfaces:**
- Consumes: `steamTradeOffer.sendTradeOffer` (mavjud), mavjud `withdrawDelivery.trySendAutoOffer` naqshi.
- Produces: `withdrawDelivery.js`'dagi `checkPendingWithdrawals(notifyFn, arrayField)` — ikkinchi parametr qo'shiladi (default `"wins"`).

- [ ] **Step 1: `withdrawDelivery.js`ni generic qilish**

`withdrawDelivery.js`, `checkPendingWithdrawals` funksiyasini (55-92-qatorlar) o'zgartiring:

```js
async function checkPendingWithdrawals(notifyFn, arrayField = "wins") {
    const users = readUsers();
    let changed = false;

    for (const user of users) {
        for (const win of user[arrayField] || []) {
            if (win.status !== "auto_sent" || !win.tradeOfferId) continue;
            // ... (qolgan kod O'ZGARISHSIZ, faqat `user.wins` deb yozilgan joy yo'q — allaqachon `user[arrayField]` orqali)
```

(Funksiya tanasining qolgan qismi o'zgarmaydi — faqat sarlavha va `for...of` qatori. `notifyFn(user, ...)` chaqiruvlari o'zgarishsiz qoladi.)

`maybeCheckPendingWithdrawals`ni ham yangilang:

```js
function maybeCheckPendingWithdrawals(notifyFn, arrayField = "wins") {
    const now = Date.now();
    const key = arrayField; // har bir arrayField uchun ALOHIDA throttle vaqti kerak
    if (!maybeCheckPendingWithdrawals._last) maybeCheckPendingWithdrawals._last = {};
    if (now - (maybeCheckPendingWithdrawals._last[key] || 0) < CHECK_INTERVAL_MS) return;
    maybeCheckPendingWithdrawals._last[key] = now;
    checkPendingWithdrawals(notifyFn, arrayField).catch(err => console.log("WITHDRAW TEKSHIRUV XATO:", err.message));
}
```

(Eslatma: bu o'zgarish `lastCheckAt` global o'zgaruvchisini almashtiradi — `let lastCheckAt = 0;` qatorini o'chiring, chunki endi funksiya ustida saqlanadi.)

- [ ] **Step 2: `server.js`da market xaridida `marketPurchases`ga yozish**

`POST /api/market/:id/buy` (1140-qator)ni yangilang — xarid muvaffaqiyatli bo'lgach, buyer'ning `marketPurchases`siga yozuv qo'shing:

```js
app.post("/api/market/:id/buy", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    await Promise.all([refresh("trades"), refresh("users")]).catch(() => {});

    const result = await tradeManager.buyMarketListing(Number(req.params.id), u.id);
    if (result.error) return res.status(400).json({ error: result.error });

    const locked = result.trade;
    const arr = getUsers();
    const buyer = arr.find(x => x.id === u.id);
    if (buyer) {
        if (!Array.isArray(buyer.marketPurchases)) buyer.marketPurchases = [];
        const skin = locked.skins?.[0];
        buyer.marketPurchases.push({
            lotId: locked.id, lotName: skin?.name ?? "Skin",
            image: skin?.imageUrl ?? null, float: skin?.float ?? null,
            assetId: skin?.assetId ?? null, price: locked.agreedPrice,
            status: "pending", requestedAt: null,
        });
        saveUsers(arr);
    }

    notifyUser(locked.sellerId, `🛒 *Market #${locked.id}*: "${locked.skins?.[0]?.name}" sotildi! *${locked.agreedPrice.toLocaleString()} so'm*.`, tgSendMessage);
    res.json(enrichTrade(locked));
});
```

- [ ] **Step 3: `POST /api/market-withdraw/:purchaseId` qo'shish**

`POST /api/withdraw/:lotId` (578-619-qatorlar)ning DAROSTIDA (keyin), deyarli bir xil kodni yozing — faqat `user.wins`o'rniga `user.marketPurchases`:

```js
app.post("/api/market-withdraw/:purchaseId", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    if (!u.tradeLink) return res.status(400).json({ error: "Trade link kerak" });

    const purchaseId = Number(req.params.purchaseId);
    const arr = getUsers();
    const user = arr.find(x => x.id === u.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const purchase = (user.marketPurchases || []).find(p => p.lotId === purchaseId && (!p.status || p.status === "pending" || p.status === "auto_failed"));
    if (!purchase) return res.status(404).json({ error: "Item topilmadi yoki allaqachon so'ralgan" });

    const auto = await trySendAutoOffer(user, purchase);
    if (auto?.offerId) {
        purchase.status = "auto_sent";
        purchase.tradeOfferId = auto.offerId;
        purchase.autoSentAt = new Date().toISOString();
        saveUsers(arr);
        return res.json({ success: true, auto: true });
    }

    purchase.status = "requested";
    purchase.requestedAt = new Date().toISOString();
    saveUsers(arr);
    tgSendMessage(
        Number(process.env.ADMIN_ID),
        `📤 *MARKET SKIN CHIQARISH!*\n\n👤 *${user.name}*\n🏷 *${purchase.lotName}*\n💰 ${(purchase.price ?? 0).toLocaleString()} so'm\n🔗 \`${user.tradeLink}\``,
        { inline_keyboard: [
            [{ text: "✅ Skin yuborildi", callback_data: `mkt_skin_sent_${user.id}_${purchaseId}` }],
            [{ text: "❌ Rad etish", callback_data: `mkt_skin_reject_${user.id}_${purchaseId}` }],
        ]}
    );
    res.json({ success: true, auto: false });
});
```

`GET /api/inventory` (543-qator)ga o'xshash `GET /api/market-inventory` qo'shing (buyer'ning `marketPurchases`sini qaytaradi):

```js
app.get("/api/market-inventory", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json(u.marketPurchases || []);
});
```

- [ ] **Step 4: `index.js`da `checkPendingWithdrawals`ni ikkinchi array uchun ham chaqirish**

`server.js`ning `/api` middleware'idagi `maybeCheckPendingWithdrawals(...)` chaqiruvi (yoki `index.js`dagi ekvivalenti — Step 1'da qaysi faylda ekanini tasdiqlang, `server.js`ning boshida ko'rilgan edi) yoniga qo'shing:

```js
maybeCheckPendingWithdrawals((user, text) => notifyUser(user, text, tgSendMessage));
maybeCheckPendingWithdrawals((user, text) => notifyUser(user, text, tgSendMessage), "marketPurchases");
```

- [ ] **Step 5: Miniapp — "Mening bozorim" xarid qismiga "Chiqarib olish" tugmasi**

`Market.jsx`da `mine.buying` ro'yxati (233-242-qatorlar) — hozir faqat `MyListingRow` ko'rsatadi (holat belgisi bilan, tugmasiz). Xarid qilingan va hali "Steam'ga chiqarilmagan" itemlar uchun alohida bo'lim qo'shing, `Inventory.jsx`dagi `sendWithdrawRequest` naqshiga o'xshab, lekin `/api/market-inventory` + `/api/market-withdraw/:id` chaqirib.

- [ ] **Step 6: Sintaksis, build va qo'lda oxirigacha sinov**

```bash
node --check withdrawDelivery.js server.js
cd miniapp && npm run build
node index.js
```

Ikkita test-akkaunt bilan (yoki admin + 1 test user): admin market'ga bulk-list qilgan itemlardan birini test user sotib oladi → "Mening bozorim → Xaridlarim"da ko'rinadi → "Chiqarib olish" bosadi → (agar relay ishlab tursa) avtomatik Steam trade offer keladi, aks holda admin qo'lda xabarnoma oladi.

- [ ] **Step 7: Commit**

```bash
git add withdrawDelivery.js server.js miniapp/src/pages/Market.jsx
git commit -m "feat: xaridor uchun Mening inventarim + istalgan payt Steam'ga chiqarib olish"
```

---

## Self-Review (bajarildi)

- **Spec qamrovi:** Spec'ning 3.1-3.7 bo'limlari — Task 2 (3.1), Task 1 (3.2), Task 4/6/7 (3.3), Task 3/9 (3.4), Task 10 (3.5), Task 8 (3.6), Task 6/7 (3.7) orqali qoplangan. Bo'lim 5 (xavfsizlik) — Task 1 (ikki shart bilan qabul), Task 4 (ikkinchi bosqichli tekshiruv), Task 3/9 (reversal+audit), Task 4 (muddatli so'rov) orqali qoplangan. Bo'lim 6 (bosqichlar) — Task tartibi shu ketma-ketlikka mos.
- **Placeholder skan:** Ikkita joyda ("TAXMINIY" URL Task 2 Step 1'da, "implementatsiya paytida moslang" Task 7/8'da UI-og'ir joylarda) ataylab ochiq qoldirilgan — bular haqiqiy tashqi noaniqlik (Lis-Skins aniq endpoint, mavjud `adminApi`/`MarketSell.jsx` state-uslubi ko'rilmaguncha aniq bo'lmaydigan JSX) va HAR BIRI keyingi qadam bilan "avval tasdiqlang, keyin implement qiling" tarzida hal qilinadi — bu "TODO qoldiring" emas, "birinchi qadam sifatida tekshiring" degani.
- **Tur mosligi:** `creditTradeProceeds(userId, amount, tradeId, fee)` — Task 4da xuddi shu imzo bilan chaqirilgan. `reverseTradeCreditEntry(userId, entryId, reason)` — Task 3'da e'lon qilingan, Task 9'da xuddi shu argumentlar bilan chaqirilgan. `checkPendingWithdrawals(notifyFn, arrayField)` — Task 10'da ikkalasi (default va `"marketPurchases"`) bilan chaqirilgan.

## Execution Handoff

Reja saqlandi: `docs/superpowers/plans/2026-09-13-market-redesign.md`. Ikkita bajarish varianti bor:

**1. Subagent-Driven (tavsiya etiladi)** — har bir vazifa uchun yangi subagent yuboraman, ular orasida tekshirib boraman, tez iteratsiya.

**2. Inline Execution** — shu sessiyada, vazifa-vazifa bo'lib, tekshirish nuqtalari bilan.

Qaysi birini tanlaysiz?
