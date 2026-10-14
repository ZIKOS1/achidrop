# Lis-Skins narxlash + ko'p skinli Autosell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Market e'lonlari narxini Lis-Skins narxidan avtomatik (ustama + minimal foyda bilan) hisoblash va odamlarga bir nechta skinni Lis narxidan arzonroq darhol sotish imkonini berish — sayt va miniapp'da.

**Architecture:** Sof (DB'siz) `pricing.js` barcha formulalarni saqlaydi va unit-test qilinadi. `lisSkinsPrice.js` Lis API'dan nomlar ro'yxati bo'yicha batch narx oladi (kalit yo'q bo'lsa `null`). `marketPriceSync.js` bot jarayonida soatlik avto-narxlarni tranzaksiyada yangilaydi. `instantSellManager.js` bot o'zi yuboradigan "itemlarni so'rovchi" trade offer'ga o'tadi (relay'ga yangi endpoint, mirror'da yoziladi, deploy keyin). UI: admin "Narx sozlamalari" sahifasi, AdminMarket'da e'lonlar boshqaruvi, `MarketSell.jsx`da Lis-Skins uslubidagi ko'p tanlovli sotish ekrani.

**Tech Stack:** Node 24 (CommonJS, `node:test`), Express, Telegraf, MongoDB (`database/db.js` kesh + `withTransaction`), React + Vite + Tailwind (`miniapp/`), steam relay (steam-tradeoffer-manager).

**Spec:** `docs/superpowers/specs/2026-10-14-lis-pricing-autosell-design.md`

## Global Constraints

- Ishchi papka: `C:\Users\User\Desktop\auction bot\auction bot`, branch `feature/market-redesign`. `main`ga to'g'ridan-to'g'ri commit qilinmaydi.
- Pul yoki Market narxini o'zgartiruvchi har bir YANGI yozish — `withTransaction` + `readTx`/`writeTx` ichida; tashqi so'rov (Lis, relay) tranzaksiyadan TASHQARIDA.
- `MIN_TRADE_PRICE = 999` so'm — hech qanday narx undan past bo'lmaydi.
- E'lon narxi (Avto) = `ceil(max(999, Lis$ × kurs × (1 + ustama%), costSom × (1 + minFoyda%)))`.
- Autosell narxi = `floor(Lis$ × kurs × (1 − marja%))`.
- Standartlar: `marketMarkupPercent` 10, `instantSellMarginPercent` 12, `usdToSomRate` 12700, `minProfitTiers` `[{maxUsd:10,percent:15},{maxUsd:50,percent:10},{maxUsd:null,percent:7}]`.
- Foizlar 0–90, kurs > 0, pog'onalar `maxUsd` bo'yicha qat'iy o'suvchi, oxirgisi `maxUsd: null`.
- Narx skin TURI bo'yicha (`skinUtils.marketHashName(name, float)`), Lis'ga har skin uchun alohida so'rov YO'Q (batch).
- `LIS_SKINS_API_KEY` yo'q bo'lsa hech narsa xato tashlamaydi: narx `null`, autosell UI "Tez orada ishga tushadi".
- UI matnlari o'zbekcha (lotin), mavjud `t()` i18n kalitlari orqali (miniapp); admin panel — to'g'ridan-to'g'ri o'zbekcha matn (mavjud naqsh).
- Sayt va miniapp bitta React ilova — UI responsiv: telefon 2–3 ustun, kompyuter 5–6 ustun.
- Kod izohlari mavjud uslubda (o'zbekcha, "nega" ni tushuntiradi).
- Commit xabarlari o'zbekcha `feat:`/`fix:` uslubida, oxirida `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Avto-sinxron e'lon narxini yangilayotgan paytda odam xuddi shu e'lonni sotib olsa — xarid o'sha paytdagi narxda bo'lishi va sotilgan e'lon narxi o'zgarmasligi kerak (Task 3: faqat `status === "open"` tranzaksiya ichida tekshiriladi, test bor).
2. Lis javobida narx `NaN`/`"abc"`/`0`/manfiy bo'lsa — narx `null`, balans hech qachon `NaN` bo'lmaydi (Task 2 testi).
3. Admin minimal foydadan past qo'lda narx kiritsa — rad etilishi va ruxsat etilgan minimal narx ko'rsatilishi (Task 1 `minAllowedPriceSom` + Task 4 route testi).
4. Odam bitta offerda 3 ta skinni yuborib, bittasini boshqa skinga almashtirsa (mos kelmasa) — pul berilmaydi, `mismatch` (Task 7 `matchReceivedItems` testi).
5. Bir xil skin turidan 2 nusxa sotilsa — ikkalasi ham to'g'ri juftlanishi (multiset moslashtirish), bittasi ikki marta hisoblanmasligi (Task 7 testi).

---

## Fayl xaritasi

| Fayl | Mas'uliyat |
|---|---|
| `pricing.js` (yangi) | Sof formulalar va sozlamalar normalizatsiyasi/validatsiyasi |
| `lisSkinsPrice.js` (o'zgaradi) | Lis API batch narx + kesh + `isLisConfigured` |
| `marketPriceSync.js` (yangi) | Avto-narx yangilanishini hisoblash (sof) va qo'llash (tx) |
| `itemCosts.js` (yangi) | Bot olgan itemlarning `costSom` reyestri |
| `tradeManager.js` (o'zgaradi) | `setListingPricing` tx-funksiyasi, `getAdminMarketListings` |
| `instantSellManager.js` (o'zgaradi) | Ko'p skinli so'rov, bot-yuboradigan offer, moslashtirish, kreditlash |
| `steamTradeOffer.js` (o'zgaradi) | Relay klient: `sendItemRequestOffer`, `getItemRequestOfferStatus` |
| `server.js` (o'zgaradi) | Admin narx/sozlama route'lari, bulk-list, autosell quote/sell |
| `index.js` (o'zgaradi) | Soatlik sinxron, bildirishnoma matni |
| `handlers/marketHandler.js` (o'zgaradi) | Bot autosell oqimi yangi imzoga |
| `docs/superpowers/relay/server.js`, `DEPLOY.md` | Relay yangi endpointlari (mirror, deploy qilinmaydi) |
| `miniapp/src/admin/pages/AdminPricing.jsx` (yangi) | Narx sozlamalari sahifasi |
| `miniapp/src/admin/pages/AdminMarket.jsx` (o'zgaradi) | Taklif narxi, e'lonlar boshqaruvi |
| `miniapp/src/pages/MarketSell.jsx` (o'zgaradi) | Lis-Skins uslubidagi autosell ekrani |
| `miniapp/src/i18n.js` (o'zgaradi) | Yangi matn kalitlari |
| `tests/*.test.js` (yangi) | `node --test` testlari |

---

### Task 1: `pricing.js` — sof narx formulalari

**Files:**
- Create: `pricing.js`
- Create: `tests/pricing.test.js`
- Modify: `package.json` (`"test"` skripti)

**Interfaces:**
- Produces:
  - `DEFAULTS` — `{ marketMarkupPercent:10, instantSellMarginPercent:12, usdToSomRate:12700, minProfitTiers:[...] }`
  - `normalizePricingSettings(raw: object|any[]) → { marketMarkupPercent, instantSellMarginPercent, usdToSomRate, minProfitTiers }`
  - `validateMinProfitTiers(tiers) → tiers|null`
  - `validatePercent(v) → number|null` (0–90)
  - `minProfitPercent(costSom: number, s) → number`
  - `minAllowedPriceSom(costSom: number|null, s) → number` (≥ 999)
  - `autoListPriceSom(usd: number|null, costSom: number|null, s) → number|null` (`usd==null && costSom==null` → `null`)
  - `instantSellPriceSom(usd: number|null, s) → number|null`
  - `MIN_TRADE_PRICE = 999`

- [ ] **Step 1: Test skriptini qo'shish**

`package.json` `"scripts"` ichiga qo'shing:

```json
"test": "node --test tests/"
```

- [ ] **Step 2: Failing testni yozish** — `tests/pricing.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const p = require("../pricing");

const S = p.normalizePricingSettings({});

test("normalize — bo'sh/massiv settings standartlarni beradi", () => {
    assert.deepEqual(p.normalizePricingSettings([]), p.normalizePricingSettings({}));
    assert.equal(S.marketMarkupPercent, 10);
    assert.equal(S.instantSellMarginPercent, 12);
    assert.equal(S.usdToSomRate, 12700);
    assert.equal(S.minProfitTiers.length, 3);
});

test("normalize — noto'g'ri qiymatlar standartga qaytadi", () => {
    const s = p.normalizePricingSettings({ marketMarkupPercent: "x", usdToSomRate: -5, minProfitTiers: [{ maxUsd: 5 }] });
    assert.equal(s.marketMarkupPercent, 10);
    assert.equal(s.usdToSomRate, 12700);
    assert.equal(s.minProfitTiers.length, 3);
});

test("validateMinProfitTiers — o'suvchi, oxirgisi cheksiz", () => {
    assert.ok(p.validateMinProfitTiers([{ maxUsd: 10, percent: 15 }, { maxUsd: null, percent: 7 }]));
    assert.equal(p.validateMinProfitTiers([{ maxUsd: 10, percent: 15 }, { maxUsd: 5, percent: 7 }]), null);
    assert.equal(p.validateMinProfitTiers([{ maxUsd: 10, percent: 15 }]), null); // oxirgisi cheksiz emas
    assert.equal(p.validateMinProfitTiers([{ maxUsd: null, percent: 95 }]), null); // >90
    assert.equal(p.validateMinProfitTiers([]), null);
});

test("minProfitPercent — pog'ona chegaralari (aniq 10$ va 50$)", () => {
    assert.equal(p.minProfitPercent(10 * 12700, S), 15);       // aniq 10$ → 1-pog'ona
    assert.equal(p.minProfitPercent(10 * 12700 + 1, S), 10);   // 10$ dan sal ko'p
    assert.equal(p.minProfitPercent(50 * 12700, S), 10);       // aniq 50$
    assert.equal(p.minProfitPercent(50 * 12700 + 1, S), 7);
});

test("minAllowedPriceSom — costSom yo'q bo'lsa 999", () => {
    assert.equal(p.minAllowedPriceSom(null, S), 999);
    assert.equal(p.minAllowedPriceSom(100000, S), 115000);     // 7.87$ → 15%
});

test("autoListPriceSom — Lis + ustama", () => {
    assert.equal(p.autoListPriceSom(10, null, S), Math.ceil(10 * 12700 * 1.10)); // 139700
});

test("autoListPriceSom — minimal foyda Lis narxidan katta bo'lsa u ustun", () => {
    // Lis 5$ → 69 850; cost 100 000 → min 115 000
    assert.equal(p.autoListPriceSom(5, 100000, S), 115000);
});

test("autoListPriceSom — 999 dan past bo'lmaydi; usd ham cost ham yo'q → null", () => {
    assert.equal(p.autoListPriceSom(0.01, null, S), 999);
    assert.equal(p.autoListPriceSom(null, null, S), null);
    assert.equal(p.autoListPriceSom(null, 100000, S), 115000);
});

test("autoListPriceSom — NaN/manfiy usd e'tiborsiz qoldiriladi", () => {
    assert.equal(p.autoListPriceSom(NaN, null, S), null);
    assert.equal(p.autoListPriceSom(-3, null, S), null);
});

test("instantSellPriceSom — Lis − marja, pastga yaxlitlanadi", () => {
    assert.equal(p.instantSellPriceSom(10, S), Math.floor(10 * 12700 * 0.88)); // 111760
    assert.equal(p.instantSellPriceSom(null, S), null);
    assert.equal(p.instantSellPriceSom(NaN, S), null);
});
```

- [ ] **Step 3: Testni ishga tushirib yiqilishini tekshirish**

Run: `npm test`
Expected: FAIL — `Cannot find module '../pricing'`

- [ ] **Step 4: `pricing.js`ni yozish**

```js
// Market va Instant Sell narx formulalari — SOF funksiyalar (DB/tarmoqqa
// tegmaydi), shu sabab to'liq unit-test qilinadi. Sozlamalar `settings`
// kolleksiyasidan keladi, lekin bu yerga allaqachon o'qilgan obyekt sifatida
// uzatiladi (normalizePricingSettings orqali tozalangan holda).
const MIN_TRADE_PRICE = 999;

const DEFAULTS = Object.freeze({
    marketMarkupPercent: 10,
    instantSellMarginPercent: 12,
    usdToSomRate: 12700,
    minProfitTiers: [
        { maxUsd: 10, percent: 15 },
        { maxUsd: 50, percent: 10 },
        { maxUsd: null, percent: 7 },
    ],
});

function validatePercent(v) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 90 ? n : null;
}

// Pog'onalar `maxUsd` bo'yicha qat'iy o'suvchi, oxirgisi `maxUsd: null`
// (cheksiz) — aks holda qaysidir narx hech bir pog'onaga tushmay qolardi.
function validateMinProfitTiers(tiers) {
    if (!Array.isArray(tiers) || tiers.length < 1) return null;
    const parsed = [];
    for (let i = 0; i < tiers.length; i++) {
        const isLast = i === tiers.length - 1;
        const percent = validatePercent(tiers[i]?.percent);
        if (percent == null) return null;
        if (isLast) {
            if (tiers[i].maxUsd != null) return null;
            parsed.push({ maxUsd: null, percent });
        } else {
            const maxUsd = Number(tiers[i]?.maxUsd);
            if (!Number.isFinite(maxUsd) || maxUsd <= 0) return null;
            if (parsed.length && maxUsd <= parsed[parsed.length - 1].maxUsd) return null;
            parsed.push({ maxUsd, percent });
        }
    }
    return parsed;
}

function normalizePricingSettings(raw) {
    const s = Array.isArray(raw) || !raw ? {} : raw;
    const rate = Number(s.usdToSomRate);
    return {
        marketMarkupPercent: validatePercent(s.marketMarkupPercent) ?? DEFAULTS.marketMarkupPercent,
        instantSellMarginPercent: validatePercent(s.instantSellMarginPercent) ?? DEFAULTS.instantSellMarginPercent,
        usdToSomRate: Number.isFinite(rate) && rate > 0 ? rate : DEFAULTS.usdToSomRate,
        minProfitTiers: validateMinProfitTiers(s.minProfitTiers) ?? DEFAULTS.minProfitTiers.map(t => ({ ...t })),
    };
}

function validUsd(usd) {
    return typeof usd === "number" && Number.isFinite(usd) && usd > 0;
}

// Pog'ona skin bizga tushgan narxning DOLLARDAGI qiymati bo'yicha tanlanadi.
function minProfitPercent(costSom, s) {
    const costUsd = costSom / s.usdToSomRate;
    const tier = s.minProfitTiers.find(t => t.maxUsd == null || costUsd <= t.maxUsd);
    return tier ? tier.percent : 0;
}

function minAllowedPriceSom(costSom, s) {
    if (!Number.isFinite(costSom) || costSom <= 0) return MIN_TRADE_PRICE;
    return Math.max(MIN_TRADE_PRICE, Math.ceil(costSom * (1 + minProfitPercent(costSom, s) / 100)));
}

function autoListPriceSom(usd, costSom, s) {
    const hasUsd = validUsd(usd);
    const hasCost = Number.isFinite(costSom) && costSom > 0;
    if (!hasUsd && !hasCost) return null;
    const fromLis = hasUsd ? Math.ceil(usd * s.usdToSomRate * (1 + s.marketMarkupPercent / 100)) : 0;
    return Math.max(fromLis, minAllowedPriceSom(hasCost ? costSom : null, s));
}

function instantSellPriceSom(usd, s) {
    if (!validUsd(usd)) return null;
    const v = Math.floor(usd * s.usdToSomRate * (1 - s.instantSellMarginPercent / 100));
    return v > 0 ? v : null;
}

module.exports = {
    MIN_TRADE_PRICE, DEFAULTS,
    validatePercent, validateMinProfitTiers, normalizePricingSettings,
    minProfitPercent, minAllowedPriceSom, autoListPriceSom, instantSellPriceSom,
};
```

- [ ] **Step 5: Testlar o'tishini tekshirish**

Run: `npm test`
Expected: PASS (barcha `pricing` testlari)

- [ ] **Step 6: Commit**

```bash
git add pricing.js tests/pricing.test.js package.json
git commit -m "feat: sof narx formulalari (ustama, marja, minimal foyda pog'onalari)"
```

---

### Task 2: `lisSkinsPrice.js` — batch narx olish

**Files:**
- Modify: `lisSkinsPrice.js` (to'liq qayta yoziladi)
- Create: `tests/lisSkinsPrice.test.js`

**Interfaces:**
- Consumes: `pricing.normalizePricingSettings`, `pricing.autoListPriceSom`, `pricing.instantSellPriceSom` (Task 1)
- Produces:
  - `isLisConfigured() → boolean`
  - `fetchLisPricesUsd(names: string[]) → Promise<Map<string, number|null>>` — kalit yo'q bo'lsa barcha qiymat `null`, xato tashlamaydi; API HTTP xatosida `throw`.
  - `getPricingSettings() → normalized settings` (`settings` kolleksiyasidan)
  - `getInstantSellPricesSom(names: string[]) → Promise<Map<string, number|null>>`
  - `getListPriceSom(marketHashName, costSom=null) → Promise<number|null>`
  - `getInstantSellPriceSom(marketHashName) → Promise<number|null>` (orqaga moslik, bot uchun)
  - `_clearCache()` (faqat testlar uchun)

- [ ] **Step 1: Failing test** — `tests/lisSkinsPrice.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const lis = require("../lisSkinsPrice");

function mockFetch(pages) {
    const calls = [];
    global.fetch = async (url) => {
        calls.push(url);
        const body = pages.shift() ?? { data: [] };
        return { ok: true, status: 200, json: async () => body };
    };
    return calls;
}

test.beforeEach(() => { lis._clearCache(); process.env.LIS_SKINS_API_KEY = "test-key"; });

test("kalit yo'q — xato yo'q, hammasi null", async () => {
    delete process.env.LIS_SKINS_API_KEY;
    assert.equal(lis.isLisConfigured(), false);
    const m = await lis.fetchLisPricesUsd(["A (Field-Tested)"]);
    assert.equal(m.get("A (Field-Tested)"), null);
});

test("bitta so'rovda ko'p nom, har nom uchun eng arzoni", async () => {
    const calls = mockFetch([{ data: [
        { name: "A (Field-Tested)", price: 3.5 },
        { name: "A (Field-Tested)", price: 2.1 },
        { name: "B (Minimal Wear)", price: "7.25" },
    ] }]);
    const m = await lis.fetchLisPricesUsd(["A (Field-Tested)", "B (Minimal Wear)", "C (Battle-Scarred)"]);
    assert.equal(calls.length, 1);
    assert.equal(m.get("A (Field-Tested)"), 2.1);
    assert.equal(m.get("B (Minimal Wear)"), 7.25);
    assert.equal(m.get("C (Battle-Scarred)"), null);
});

test("NaN / 0 / manfiy / matn narx — null", async () => {
    mockFetch([{ data: [
        { name: "A", price: "abc" }, { name: "B", price: 0 }, { name: "C", price: -1 }, { name: "D", price: {} },
    ] }]);
    const m = await lis.fetchLisPricesUsd(["A", "B", "C", "D"]);
    for (const n of ["A", "B", "C", "D"]) assert.equal(m.get(n), null);
});

test("kesh — ikkinchi chaqiruv so'rov yubormaydi", async () => {
    const calls = mockFetch([{ data: [{ name: "A", price: 1 }] }]);
    await lis.fetchLisPricesUsd(["A"]);
    await lis.fetchLisPricesUsd(["A"]);
    assert.equal(calls.length, 1);
});

test("50 tadan ortiq nom bo'laklarga bo'linadi", async () => {
    const names = Array.from({ length: 120 }, (_, i) => `N${i}`);
    const calls = mockFetch([]);
    await lis.fetchLisPricesUsd(names);
    assert.equal(calls.length, 3);
});

test("HTTP xato — throw", async () => {
    global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await assert.rejects(() => lis.fetchLisPricesUsd(["X"]), /HTTP 500/);
});

test("getListPriceSom — Lis + ustama, cost bilan", async () => {
    mockFetch([{ data: [{ name: "A", price: 10 }] }]);
    assert.equal(await lis.getListPriceSom("A"), Math.ceil(10 * 12700 * 1.1));
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npm test`
Expected: FAIL — `lis._clearCache is not a function` / `isLisConfigured is not a function`

- [ ] **Step 3: `lisSkinsPrice.js`ni qayta yozish**

```js
// Lis-Skins'dan CS2 skin narxlarini olish — Market avto-narxi va Instant Sell
// uchun asos. Narx SKIN TURI (market_hash_name) bo'yicha olinadi va bir
// so'rovda ko'p nom yuboriladi (har skin uchun alohida so'rov YO'Q).
// Topilgan narx 1 soat, topilmagani 1 daqiqa keshlanadi.
//
// DIQQAT: API javob shakli (`data[]`/`items[]`, `name`/`market_hash_name`,
// `price`) va `names[]` parametri kalit kelgach haqiqiy so'rov bilan
// tasdiqlanishi kerak — hozircha hujjat/PyPI klient asosida yozilgan.
const { read } = require("./database/db");
const pricing = require("./pricing");

const CACHE_MS = 60 * 60 * 1000;
const NULL_CACHE_MS = 60 * 1000;
const CHUNK = 50;
const MAX_PAGES_PER_CHUNK = 10;
const priceCache = new Map(); // marketHashName -> { usd, ts }

function isLisConfigured() {
    return !!process.env.LIS_SKINS_API_KEY;
}

function cachedUsd(name) {
    const c = priceCache.get(name);
    if (!c) return undefined;
    const ttl = c.usd == null ? NULL_CACHE_MS : CACHE_MS;
    return Date.now() - c.ts < ttl ? c.usd : undefined;
}

// `Number(...)` NaN qaytarsa u `== null` tekshiruvlaridan jimgina o'tib,
// balansni NaN qilib buzishi mumkin edi — shu sabab ANIQ tekshiriladi.
function parseUsd(v) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchChunk(names, apiKey, out) {
    let cursor = null;
    for (let page = 0; page < MAX_PAGES_PER_CHUNK; page++) {
        const qs = new URLSearchParams({ game: "csgo", sort_by: "lowest_price" });
        for (const n of names) qs.append("names[]", n);
        if (cursor) qs.set("cursor", cursor);
        const resp = await fetch(`https://api.lis-skins.com/v1/market/search?${qs}`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        });
        if (!resp.ok) throw new Error(`Lis-Skins API xato (HTTP ${resp.status})`);
        const body = await resp.json();
        const items = body?.data ?? body?.items ?? [];
        for (const it of Array.isArray(items) ? items : []) {
            const name = it?.name ?? it?.market_hash_name;
            const usd = parseUsd(it?.price);
            if (!name || usd == null || !out.has(name)) continue;
            const prev = out.get(name);
            if (prev == null || usd < prev) out.set(name, usd);
        }
        cursor = body?.meta?.next_cursor ?? null;
        if (!cursor) break;
    }
}

async function fetchLisPricesUsd(names) {
    const unique = [...new Set((names || []).filter(Boolean))];
    const result = new Map();
    const missing = [];
    for (const n of unique) {
        const c = cachedUsd(n);
        if (c !== undefined) result.set(n, c);
        else missing.push(n);
    }
    if (!missing.length) return result;

    const apiKey = process.env.LIS_SKINS_API_KEY;
    if (!apiKey) {
        for (const n of missing) result.set(n, null); // keshlanmaydi — kalit qo'shilsa darhol ishlasin
        return result;
    }

    for (let i = 0; i < missing.length; i += CHUNK) {
        const chunk = missing.slice(i, i + CHUNK);
        const found = new Map(chunk.map(n => [n, null]));
        await fetchChunk(chunk, apiKey, found);
        for (const [n, usd] of found) {
            priceCache.set(n, { usd, ts: Date.now() });
            result.set(n, usd);
        }
    }
    return result;
}

function getPricingSettings() {
    return pricing.normalizePricingSettings(read("settings"));
}

async function getInstantSellPricesSom(names) {
    const usd = await fetchLisPricesUsd(names);
    const s = getPricingSettings();
    const out = new Map();
    for (const [n, v] of usd) out.set(n, pricing.instantSellPriceSom(v, s));
    return out;
}

async function getInstantSellPriceSom(marketHashName) {
    return (await getInstantSellPricesSom([marketHashName])).get(marketHashName) ?? null;
}

async function getListPriceSom(marketHashName, costSom = null) {
    const usd = (await fetchLisPricesUsd([marketHashName])).get(marketHashName) ?? null;
    return pricing.autoListPriceSom(usd, costSom, getPricingSettings());
}

function _clearCache() { priceCache.clear(); }

module.exports = {
    isLisConfigured, fetchLisPricesUsd, getPricingSettings,
    getInstantSellPricesSom, getInstantSellPriceSom, getListPriceSom, _clearCache,
};
```

- [ ] **Step 4: Eski eksportlarni ishlatgan joylarni tekshirish**

Run: `grep -rn "getInstantSellMarginPercent\|getUsdToSomRate" --include=*.js . | grep -v node_modules`
Expected: hech narsa topilmaydi. Topilsa — o'sha joyni `getPricingSettings().instantSellMarginPercent` / `.usdToSomRate` ga almashtiring.

- [ ] **Step 5: Testlar**

Run: `npm test`
Expected: PASS (pricing + lisSkinsPrice)

- [ ] **Step 6: Commit**

```bash
git add lisSkinsPrice.js tests/lisSkinsPrice.test.js
git commit -m "feat: Lis-Skins narxlarini nomlar ro'yxati bo'yicha bitta so'rovda olish"
```

---

### Task 3: Market e'lon narx maydonlari va soatlik avto-sinxron

**Files:**
- Create: `marketPriceSync.js`
- Create: `tests/marketPriceSync.test.js`
- Modify: `index.js` (yangi `setInterval`)

**Interfaces:**
- Consumes: `pricing.autoListPriceSom`, `lisSkinsPrice.fetchLisPricesUsd`, `lisSkinsPrice.getPricingSettings`, `lisSkinsPrice.isLisConfigured`
- Produces:
  - E'lon maydonlari (`trades`, `kind:"market"`): `priceMode: "auto"|"pinned"` (yo'q = `"pinned"`), `marketHashName`, `costSom` (number|null), `priceUpdatedAt`.
  - `computeListingUpdates(trades, usdByName: Map, settings) → Array<{ id, price }>` — sof; faqat `kind==="market" && status==="open" && priceMode==="auto"`, narx o'zgargan va `null` bo'lmaganlari.
  - `applyListingUpdates(updates) → Promise<number>` — tx ichida, faqat hali `open` + `auto` bo'lsa yozadi; yangilanganlar sonini qaytaradi.
  - `syncMarketPrices() → Promise<{ at, updated, skipped, error }>` — natijani `settings.lisPriceSync`ga yozadi; reentrancy guard.

- [ ] **Step 1: Failing test** — `tests/marketPriceSync.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { computeListingUpdates } = require("../marketPriceSync");
const { normalizePricingSettings } = require("../pricing");

const S = normalizePricingSettings({});
const L = (o) => ({ kind: "market", status: "open", priceMode: "auto", marketHashName: "A", agreedPrice: 1000, costSom: null, ...o });

test("faqat open + auto e'lonlar yangilanadi", () => {
    const trades = [
        L({ id: 1 }),
        L({ id: 2, priceMode: "pinned" }),
        L({ id: 3, priceMode: undefined }),     // eski e'lon → pinned
        L({ id: 4, status: "completed" }),      // sotilgan — tegilmaydi
        L({ id: 5, kind: "obmen" }),
    ];
    const ups = computeListingUpdates(trades, new Map([["A", 10]]), S);
    assert.deepEqual(ups.map(u => u.id), [1]);
    assert.equal(ups[0].price, Math.ceil(10 * 12700 * 1.1));
});

test("Lis narx bermasa va cost yo'q — o'zgarmaydi", () => {
    assert.deepEqual(computeListingUpdates([L({ id: 1 })], new Map([["A", null]]), S), []);
});

test("Lis narx bermasa, lekin cost bor va joriy narx minimal foydadan past — ko'tariladi", () => {
    const ups = computeListingUpdates([L({ id: 1, costSom: 100000, agreedPrice: 100000 })], new Map([["A", null]]), S);
    assert.deepEqual(ups, [{ id: 1, price: 115000 }]);
});

test("Lis narx bermasa, cost bor, joriy narx yetarli — o'zgarmaydi", () => {
    assert.deepEqual(computeListingUpdates([L({ id: 1, costSom: 100000, agreedPrice: 130000 })], new Map([["A", null]]), S), []);
});

test("narx bir xil bo'lsa update yo'q", () => {
    const price = Math.ceil(10 * 12700 * 1.1);
    assert.deepEqual(computeListingUpdates([L({ id: 1, agreedPrice: price })], new Map([["A", 10]]), S), []);
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npm test`
Expected: FAIL — `Cannot find module '../marketPriceSync'`

- [ ] **Step 3: `marketPriceSync.js`ni yozish**

```js
// Market e'lonlarining avto-narxini Lis-Skins narxiga qarab yangilash.
// Bot jarayonida soatda bir marta (index.js) va admin "Hozir yangilash"
// tugmasidan chaqiriladi. Lis'ga barcha noyob skin turlari uchun BITTA
// batch so'rov ketadi (lisSkinsPrice.fetchLisPricesUsd).
//
// Xarid bilan to'qnashuv: odam xaridni bosganda tradeManager.buyMarketListing
// narxni tranzaksiya ichida o'qiydi. Bu yerda yozish ham tranzaksiyada va
// faqat e'lon HALI "open" + "auto" bo'lsa — sotilgan e'lonning narxi hech
// qachon o'zgarmaydi.
const { read, write, refresh, withTransaction, readTx, writeTx } = require("./database/db");
const pricing = require("./pricing");
const lis = require("./lisSkinsPrice");

function isAutoOpen(t) {
    return t && t.kind === "market" && t.status === "open" && t.priceMode === "auto";
}

function computeListingUpdates(trades, usdByName, s) {
    const out = [];
    for (const t of trades || []) {
        if (!isAutoOpen(t)) continue;
        const usd = usdByName.get(t.marketHashName) ?? null;
        let price;
        if (usd != null) {
            price = pricing.autoListPriceSom(usd, t.costSom ?? null, s);
        } else {
            // Lis narx bermadi — eski narx qoladi, faqat minimal foyda
            // qoidasini buzayotgan bo'lsa yuqoriga ko'tariladi.
            const floor = pricing.minAllowedPriceSom(t.costSom ?? null, s);
            price = (t.agreedPrice ?? 0) < floor ? floor : null;
        }
        if (price != null && price !== t.agreedPrice) out.push({ id: t.id, price });
    }
    return out;
}

async function applyListingUpdates(updates) {
    if (!updates.length) return 0;
    const byId = new Map(updates.map(u => [u.id, u.price]));
    const result = await withTransaction(async (session) => {
        const raw = await readTx(session, "trades");
        const trades = Array.isArray(raw) ? raw : [];
        let n = 0;
        const now = new Date().toISOString();
        for (const t of trades) {
            if (!byId.has(t.id) || !isAutoOpen(t)) continue;
            t.agreedPrice = byId.get(t.id);
            t.priceUpdatedAt = now;
            n++;
        }
        if (!n) return { n: 0 };
        await writeTx(session, "trades", trades);
        return { n, cacheUpdates: { trades } };
    });
    return result?.n ?? 0;
}

let _running = false;
async function syncMarketPrices() {
    if (_running) return { skipped: true, reason: "running" };
    _running = true;
    const status = { at: new Date().toISOString(), updated: 0, skipped: false, error: null };
    try {
        if (!lis.isLisConfigured()) {
            status.skipped = true;
            status.error = "no_key";
        } else {
            await refresh("trades").catch(() => {});
            const trades = read("trades");
            const names = [...new Set((Array.isArray(trades) ? trades : []).filter(isAutoOpen).map(t => t.marketHashName).filter(Boolean))];
            const usd = await lis.fetchLisPricesUsd(names);
            const updates = computeListingUpdates(trades, usd, lis.getPricingSettings());
            status.updated = await applyListingUpdates(updates);
        }
    } catch (err) {
        status.error = err.message;
    } finally {
        _running = false;
    }
    await refresh("settings").catch(() => {});
    const raw = read("settings");
    const s = Array.isArray(raw) ? {} : (raw || {});
    s.lisPriceSync = status;
    write("settings", s);
    return status;
}

module.exports = { computeListingUpdates, applyListingUpdates, syncMarketPrices, isAutoOpen };
```

- [ ] **Step 4: Testlar**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: `index.js`ga soatlik sinxronni ulash**

`index.js` yuqorisidagi `require`lar qatoriga (`instantSellManager` yonida) qo'shing:

```js
const marketPriceSync = require("./marketPriceSync");
```

Instant Sell `setInterval` blokidan keyin qo'shing:

```js
    // ── Market avto-narxlari: Lis-Skins narxiga qarab soatda bir marta ──────
    setInterval(async () => {
        try {
            const r = await marketPriceSync.syncMarketPrices();
            if (r.updated) console.log(`💹 Market narxlari yangilandi: ${r.updated} ta e'lon`);
            if (r.error && r.error !== "no_key") console.log("MARKET NARX SINXRON XATO:", r.error);
        } catch (err) {
            console.log("MARKET NARX SINXRON XATO:", err.message);
        }
    }, 60 * 60_000);
```

- [ ] **Step 6: Bot yuklanishini tekshirish (sintaksis)**

Run: `node -e "require('./marketPriceSync'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 7: Commit**

```bash
git add marketPriceSync.js tests/marketPriceSync.test.js index.js
git commit -m "feat: Market avto-narxlarini Lis-Skins bo'yicha soatlik yangilash"
```

---

### Task 4: Olingan narx reyestri, bulk-list va admin e'lon boshqaruvi (backend)

**Files:**
- Create: `itemCosts.js`
- Modify: `tradeManager.js` (yangi `setListingPricing`, `createTrade`ga `extra` parametri)
- Modify: `server.js` (`/api/admin/list-price`, `/api/admin/market-bulk-list`, yangi `/api/admin/market-listings*`)
- Create: `tests/listingPricing.test.js`

**Interfaces:**
- Consumes: `pricing.*` (Task 1), `lisSkinsPrice.getListPriceSom`, `getPricingSettings`, `fetchLisPricesUsd` (Task 2), `marketPriceSync.isAutoOpen` (Task 3)
- Produces:
  - `itemCosts.getCostSom(botAssetId) → number|null`; `itemCosts.recordCostsInTx(costsArray, entries)` — tx ichida massivga qo'shish (Task 7 ishlatadi); kolleksiya nomi `"itemCosts"`, yozuv `{ botAssetId: string, marketHashName, costSom, instantSellRequestId, at }`.
  - `tradeManager.createTrade(sellerId, skins, origin, initialPrice, visibility, promoCode, kind, extra = {})` — `extra` maydonlari e'longa qo'shiladi (`priceMode`, `marketHashName`, `costSom`, `priceUpdatedAt`).
  - `tradeManager.setListingPricing(tradeId, patch: { agreedPrice?, priceMode?, costSom? }) → Promise<{ trade } | { error }>` — tx, faqat `kind:"market"` + `status:"open"`.
  - `pricing.validatePinnedPrice(price, costSom, s) → { ok: true } | { ok: false, minPrice }` (Task 4'da `pricing.js`ga qo'shiladi).
  - Route'lar (hammasi `requireAdminPanel`):
    - `GET /api/admin/list-price?marketHashName=&costSom=` → `{ priceSom, minPriceSom }`
    - `POST /api/admin/market-bulk-list` `{ assetIds, price? }` — `price` yo'q → `auto`, bor → `pinned` (har item uchun minimal foyda tekshiruvi) → `{ created, rejected: [{assetId, minPrice}] }`
    - `GET /api/admin/market-listings` → admin'ning ochiq market e'lonlari `[{ id, name, image, float, marketHashName, price, priceMode, costSom, minPriceSom, priceUpdatedAt, hasStickers, hasCharm }]`
    - `POST /api/admin/market-listings/:id/price` `{ price }` → pinned
    - `POST /api/admin/market-listings/:id/auto` → auto + darhol qayta hisoblanadi
    - `POST /api/admin/market-listings/:id/cost` `{ costSom }` (`null` = o'chirish)

- [ ] **Step 1: Failing test** — `tests/listingPricing.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const p = require("../pricing");
const S = p.normalizePricingSettings({});

test("validatePinnedPrice — cost yo'q, 999 dan yuqori ok", () => {
    assert.deepEqual(p.validatePinnedPrice(5000, null, S), { ok: true });
});
test("validatePinnedPrice — 999 dan past rad", () => {
    assert.deepEqual(p.validatePinnedPrice(500, null, S), { ok: false, minPrice: 999 });
});
test("validatePinnedPrice — minimal foydadan past rad, minPrice qaytadi", () => {
    assert.deepEqual(p.validatePinnedPrice(110000, 100000, S), { ok: false, minPrice: 115000 });
    assert.deepEqual(p.validatePinnedPrice(115000, 100000, S), { ok: true });
});
test("validatePinnedPrice — NaN rad", () => {
    assert.equal(p.validatePinnedPrice(NaN, null, S).ok, false);
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npm test`
Expected: FAIL — `p.validatePinnedPrice is not a function`

- [ ] **Step 3: `pricing.js`ga qo'shish** (`module.exports`dan oldin, eksportga ham qo'shing)

```js
// Admin qo'lda yozgan (qotirilgan) narx ham olingan narx + minimal foydadan
// past bo'lmasligi kerak — skin hech qachon zarariga sotilmaydi.
function validatePinnedPrice(price, costSom, s) {
    const minPrice = minAllowedPriceSom(costSom, s);
    if (!Number.isFinite(price) || price < minPrice) return { ok: false, minPrice };
    return { ok: true };
}
```

`module.exports`ga `validatePinnedPrice` ni qo'shing.

- [ ] **Step 4: Testlar**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: `itemCosts.js` yaratish**

```js
// Bot akkauntiga kelgan itemlar bizga necha so'mga tushgani (costSom).
// Steam item boshqa akkauntga o'tganda YANGI assetId beradi — shu sabab
// kalit botdagi (yangi) assetId. Yozuvlar Instant Sell kreditlash
// tranzaksiyasi ichida qo'shiladi (instantSellManager), admin Marketga
// qo'yganda costSom shu yerdan olinadi.
const { read } = require("./database/db");

function getAll() {
    const raw = read("itemCosts");
    return Array.isArray(raw) ? raw : [];
}

function getCostSom(botAssetId) {
    const rec = getAll().find(r => String(r.botAssetId) === String(botAssetId));
    return rec && Number.isFinite(rec.costSom) ? rec.costSom : null;
}

// Tranzaksiya ichida: `costs` — readTx("itemCosts") natijasi (massiv).
function recordCostsInTx(costs, entries) {
    const now = new Date().toISOString();
    for (const e of entries) {
        if (!e.botAssetId || !Number.isFinite(e.costSom)) continue;
        const i = costs.findIndex(r => String(r.botAssetId) === String(e.botAssetId));
        const rec = { botAssetId: String(e.botAssetId), marketHashName: e.marketHashName, costSom: e.costSom, instantSellRequestId: e.instantSellRequestId ?? null, at: now };
        if (i >= 0) costs[i] = rec; else costs.push(rec);
    }
    return costs;
}

module.exports = { getCostSom, recordCostsInTx };
```

- [ ] **Step 6: `tradeManager.js` — `createTrade`ga `extra` va `setListingPricing`**

`createTrade` imzosini o'zgartiring:

```js
function createTrade(sellerId, skins, origin, initialPrice, visibility, promoCode, kind, extra = {}) {
```

`trade` obyekti yaratilgandan keyin, `trade.inviteLink = ...` qatoridan OLDIN qo'shing:

```js
    // Market e'loni narx maydonlari (priceMode/marketHashName/costSom) —
    // faqat chaqiruvchi bergan bo'lsa; eski chaqiruvlar o'zgarishsiz.
    if (trade.kind === "market" && extra && typeof extra === "object") {
        for (const k of ["priceMode", "marketHashName", "costSom", "priceUpdatedAt"]) {
            if (extra[k] !== undefined) trade[k] = extra[k];
        }
    }
```

`buyMarketListing` funksiyasidan keyin qo'shing:

```js
// Admin e'lon narxini/rejimini/olingan narxini o'zgartiradi. Tranzaksiyada
// va faqat e'lon hali "open" bo'lsa — xarid bilan bir vaqtda kelsa, sotilgan
// e'lonning narxi o'zgarmaydi.
async function setListingPricing(tradeId, patch) {
    return withTransaction(async (session) => {
        const trades = await readTx(session, "trades");
        const trade = trades.find(t => t.id === tradeId);
        if (!trade || trade.kind !== "market") return { error: "not_found" };
        if (trade.status !== "open") return { error: "not_open" };
        if (patch.agreedPrice !== undefined) trade.agreedPrice = patch.agreedPrice;
        if (patch.priceMode !== undefined) trade.priceMode = patch.priceMode;
        if (patch.costSom !== undefined) trade.costSom = patch.costSom;
        trade.priceUpdatedAt = new Date().toISOString();
        await writeTx(session, "trades", trades);
        return { trade, cacheUpdates: { trades } };
    });
}
```

`module.exports`ga `setListingPricing` qo'shing.

- [ ] **Step 7: `server.js` — require va `list-price`**

`const lisSkinsPrice = require("./lisSkinsPrice");` qatoridan keyin qo'shing:

```js
const pricing = require("./pricing");
const itemCosts = require("./itemCosts");
const marketPriceSync = require("./marketPriceSync");
```

`GET /api/admin/list-price` route'ini almashtiring:

```js
// GET /api/admin/list-price?marketHashName=...&costSom=... — bulk-list uchun
// taklif narxi: Lis + ustama, olingan narx bo'lsa minimal foyda bilan.
app.get("/api/admin/list-price", requireAdminPanel, async (req, res) => {
    const costRaw = Number(req.query.costSom);
    const costSom = Number.isFinite(costRaw) && costRaw > 0 ? costRaw : null;
    try {
        const priceSom = await lisSkinsPrice.getListPriceSom(String(req.query.marketHashName || ""), costSom);
        res.json({ priceSom, minPriceSom: pricing.minAllowedPriceSom(costSom, lisSkinsPrice.getPricingSettings()), lisConfigured: lisSkinsPrice.isLisConfigured() });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});
```

- [ ] **Step 8: `server.js` — `steam-inventory-grouped` javobiga `costSom` qo'shish**

`steam-inventory-grouped` route'ida `groups.get(key).items.push(it);` qatorini almashtiring:

```js
            groups.get(key).items.push({ ...it, costSom: itemCosts.getCostSom(it.assetId) });
```

Route boshida (`fetchInventory`dan oldin) qo'shing: `await refresh("itemCosts").catch(() => {});`

- [ ] **Step 9: `server.js` — `market-bulk-list`ni almashtirish**

```js
// POST /api/admin/market-bulk-list — { assetIds: string[], price?: number }
// `price` berilmasa — har bir e'lon "auto" rejimda, narx Lis + ustama (va
// olingan narx bo'lsa minimal foyda) bo'yicha. `price` berilsa — "pinned",
// lekin har bir item olingan narx + minimal foydadan past bo'lsa RAD etiladi
// (`rejected` ro'yxatida minimal narx bilan qaytadi).
app.post("/api/admin/market-bulk-list", requireAdminPanel, async (req, res) => {
    const { assetIds } = req.body || {};
    const hasPrice = req.body?.price !== undefined && req.body?.price !== null && req.body?.price !== "";
    const price = Number(req.body?.price);
    if (!Array.isArray(assetIds) || !assetIds.length) return res.status(400).json({ error: "assetIds kerak" });
    if (hasPrice && (!Number.isFinite(price) || price < MIN_TRADE_PRICE)) return res.status(400).json({ error: "min_price" });

    let items;
    try { items = await fetchInventory(); }
    catch (err) { return res.status(502).json({ error: err.message }); }
    await refresh("itemCosts").catch(() => {});

    const s = lisSkinsPrice.getPricingSettings();
    const picked = assetIds.map(id => items.find(it => String(it.assetId) === String(id))).filter(Boolean);
    const names = [...new Set(picked.map(it => skinUtils.marketHashName(it.name, it.float)))];
    let usdByName = new Map();
    if (!hasPrice) {
        try { usdByName = await lisSkinsPrice.fetchLisPricesUsd(names); }
        catch (err) { return res.status(502).json({ error: err.message }); }
    }

    const created = [];
    const rejected = [];
    const adminId = Number(process.env.ADMIN_ID);
    for (const item of picked) {
        const marketHashName = skinUtils.marketHashName(item.name, item.float);
        const costSom = itemCosts.getCostSom(item.assetId);
        let listPrice;
        let priceMode;
        if (hasPrice) {
            const v = pricing.validatePinnedPrice(price, costSom, s);
            if (!v.ok) { rejected.push({ assetId: item.assetId, minPrice: v.minPrice }); continue; }
            listPrice = price;
            priceMode = "pinned";
        } else {
            listPrice = pricing.autoListPriceSom(usdByName.get(marketHashName) ?? null, costSom, s);
            if (listPrice == null) { rejected.push({ assetId: item.assetId, minPrice: null }); continue; }
            priceMode = "auto";
        }
        const trade = tradeManager.createTrade(adminId, [buildSkin(item)], "website", listPrice, "public", null, "market", {
            priceMode, marketHashName, costSom, priceUpdatedAt: new Date().toISOString(),
        });
        created.push(trade.id);
    }
    res.json({ created, rejected });
});
```

- [ ] **Step 10: `server.js` — admin e'lonlar route'lari** (`market-bulk-list`dan keyin)

```js
function listingView(t, s) {
    const skin = t.skins?.[0] || {};
    return {
        id: t.id, name: skin.name, image: skin.image, float: skin.float,
        marketHashName: t.marketHashName || (skin.name ? skinUtils.marketHashName(skin.name, skin.float) : null),
        price: t.agreedPrice, priceMode: t.priceMode === "auto" ? "auto" : "pinned",
        costSom: Number.isFinite(t.costSom) ? t.costSom : null,
        minPriceSom: pricing.minAllowedPriceSom(Number.isFinite(t.costSom) ? t.costSom : null, s),
        priceUpdatedAt: t.priceUpdatedAt || null,
        hasStickers: Array.isArray(skin.stickers) && skin.stickers.length > 0,
        hasCharm: Array.isArray(skin.keychains) && skin.keychains.length > 0,
    };
}

// GET /api/admin/market-listings — admin'ning ochiq market e'lonlari (narx boshqaruvi uchun)
app.get("/api/admin/market-listings", requireAdminPanel, async (req, res) => {
    await refresh("trades").catch(() => {});
    const adminId = Number(process.env.ADMIN_ID);
    const s = lisSkinsPrice.getPricingSettings();
    const list = read("trades")
        .filter(t => t.kind === "market" && t.status === "open" && t.sellerId === adminId)
        .sort((a, b) => b.id - a.id)
        .map(t => listingView(t, s));
    res.json(list);
});

// POST /api/admin/market-listings/:id/price — { price } → qotirilgan narx
app.post("/api/admin/market-listings/:id/price", requireAdminPanel, async (req, res) => {
    await refresh("trades").catch(() => {});
    const t = tradeManager.getTradeById(Number(req.params.id));
    if (!t || t.kind !== "market") return res.status(404).json({ error: "Topilmadi" });
    const price = Number(req.body?.price);
    const v = pricing.validatePinnedPrice(price, Number.isFinite(t.costSom) ? t.costSom : null, lisSkinsPrice.getPricingSettings());
    if (!v.ok) return res.status(400).json({ error: `Narx kamida ${v.minPrice.toLocaleString()} so'm bo'lishi kerak`, minPrice: v.minPrice });
    const r = await tradeManager.setListingPricing(t.id, { agreedPrice: price, priceMode: "pinned" });
    if (r.error) return res.status(400).json({ error: r.error === "not_open" ? "E'lon allaqachon sotilgan" : "Topilmadi" });
    res.json(listingView(r.trade, lisSkinsPrice.getPricingSettings()));
});

// POST /api/admin/market-listings/:id/auto — avto narxga qaytarish (darhol qayta hisoblanadi)
app.post("/api/admin/market-listings/:id/auto", requireAdminPanel, async (req, res) => {
    await refresh("trades").catch(() => {});
    const t = tradeManager.getTradeById(Number(req.params.id));
    if (!t || t.kind !== "market") return res.status(404).json({ error: "Topilmadi" });
    const name = t.marketHashName || skinUtils.marketHashName(t.skins?.[0]?.name, t.skins?.[0]?.float);
    let newPrice = null;
    try { newPrice = await lisSkinsPrice.getListPriceSom(name, Number.isFinite(t.costSom) ? t.costSom : null); }
    catch { /* Lis xato — narx o'zgarmaydi, soatlik sinxron keyin yangilaydi */ }
    const patch = { priceMode: "auto" };
    if (!t.marketHashName) patch.marketHashName = name;
    if (newPrice != null) patch.agreedPrice = newPrice;
    const r = await tradeManager.setListingPricing(t.id, patch);
    if (r.error) return res.status(400).json({ error: r.error === "not_open" ? "E'lon allaqachon sotilgan" : "Topilmadi" });
    res.json(listingView(r.trade, lisSkinsPrice.getPricingSettings()));
});

// POST /api/admin/market-listings/:id/cost — { costSom|null } — olingan narxni qo'lda kiritish
app.post("/api/admin/market-listings/:id/cost", requireAdminPanel, async (req, res) => {
    await refresh("trades").catch(() => {});
    const t = tradeManager.getTradeById(Number(req.params.id));
    if (!t || t.kind !== "market") return res.status(404).json({ error: "Topilmadi" });
    const raw = req.body?.costSom;
    const costSom = raw === null || raw === "" ? null : Number(raw);
    if (costSom !== null && (!Number.isFinite(costSom) || costSom <= 0)) return res.status(400).json({ error: "Olingan narx musbat raqam bo'lishi kerak" });
    const s = lisSkinsPrice.getPricingSettings();
    const patch = { costSom };
    // Yangi olingan narx joriy narxni minimal foydadan pastda qoldirsa — ko'taramiz.
    const floor = pricing.minAllowedPriceSom(costSom, s);
    if ((t.agreedPrice ?? 0) < floor) patch.agreedPrice = floor;
    const r = await tradeManager.setListingPricing(t.id, patch);
    if (r.error) return res.status(400).json({ error: r.error === "not_open" ? "E'lon allaqachon sotilgan" : "Topilmadi" });
    res.json(listingView(r.trade, s));
});
```

Eslatma: `marketHashName` qatorida `t.skins?.[0]?.name` `undefined` bo'lsa `skinUtils.marketHashName` xato tashlamasligini tekshiring (`skinUtils.js:87`); tashlasa, `name` bo'sh bo'lganda `null` qaytaradigan shart qo'shing.

- [ ] **Step 11: Yuklanish va testlar**

Run: `node -e "process.env.MONGODB_URI='mongodb://x'; require('./tradeManager'); require('./itemCosts'); console.log('ok')" && npm test`
Expected: `ok`, keyin barcha testlar PASS. (`server.js` to'liq ishga tushirilmaydi — DB kerak; sintaksisni `node --check server.js` bilan tekshiring: Expected — chiqishsiz, exit 0.)

- [ ] **Step 12: Commit**

```bash
git add pricing.js itemCosts.js tradeManager.js server.js tests/listingPricing.test.js
git commit -m "feat: e'lonlar uchun avto/qotirilgan narx, olingan narx va minimal foyda tekshiruvi"
```

---

### Task 5: Narx sozlamalari — API va admin sahifasi

**Files:**
- Modify: `server.js` (`/api/admin/settings` GET/POST, yangi `/api/admin/market-prices/sync-now`)
- Create: `miniapp/src/admin/pages/AdminPricing.jsx`
- Modify: `miniapp/src/admin/AdminApp.jsx`

**Interfaces:**
- Consumes: `pricing.validatePercent`, `pricing.validateMinProfitTiers`, `lisSkinsPrice.getPricingSettings`, `lisSkinsPrice.isLisConfigured`, `marketPriceSync.syncMarketPrices`
- Produces: `GET /api/admin/settings` javobiga qo'shimcha: `marketMarkupPercent`, `minProfitTiers`, `lisConfigured`, `lisPriceSync`; `POST /api/admin/settings` `marketMarkupPercent`, `minProfitTiers`ni qabul qiladi; `POST /api/admin/market-prices/sync-now` → `lisPriceSync` holati.

- [ ] **Step 1: `server.js` — settings javobini umumlashtirish**

`app.get("/api/admin/settings", ...)` dan oldin yordamchi qo'shing va GET hamda POST'ning oxirgi `res.json({...})` larini `res.json(settingsView(s))` / `res.json({ success: true, ...settingsView(s) })` ga almashtiring:

```js
function settingsView(s) {
    const p = pricing.normalizePricingSettings(s);
    return {
        earlyAccessEnabled: s.earlyAccessEnabled !== false,
        steamId64: s.steamId64 || null,
        referralBonus: s.referralBonus ?? 10000,
        tradeFeeTiers: tradeManager.getFeeTiers(),
        instantSellMarginPercent: p.instantSellMarginPercent,
        usdToSomRate: p.usdToSomRate,
        marketMarkupPercent: p.marketMarkupPercent,
        minProfitTiers: p.minProfitTiers,
        lisConfigured: lisSkinsPrice.isLisConfigured(),
        lisPriceSync: s.lisPriceSync || null,
    };
}
```

GET route tanasi:

```js
app.get("/api/admin/settings", requireAdminPanel, async (req, res) => {
    await refresh("settings").catch(() => {});
    res.json(settingsView(getSettings()));
});
```

- [ ] **Step 2: `server.js` — POST validatsiyasi**

`POST /api/admin/settings` ichidagi mavjud `instantSellMarginPercent` blokini almashtiring va yangilarini qo'shing (`write("settings", s)`dan oldin):

```js
    if (req.body.instantSellMarginPercent !== undefined) {
        const m = pricing.validatePercent(req.body.instantSellMarginPercent);
        if (m == null) return res.status(400).json({ error: "Autosell marjasi 0-90% orasida bo'lishi kerak" });
        s.instantSellMarginPercent = m;
    }
    if (req.body.marketMarkupPercent !== undefined) {
        const m = pricing.validatePercent(req.body.marketMarkupPercent);
        if (m == null) return res.status(400).json({ error: "Market ustamasi 0-90% orasida bo'lishi kerak" });
        s.marketMarkupPercent = m;
    }
    if (req.body.minProfitTiers !== undefined) {
        const tiers = pricing.validateMinProfitTiers(req.body.minProfitTiers);
        if (!tiers) return res.status(400).json({ error: "Minimal foyda pog'onalari noto'g'ri (o'sish tartibida, oxirgisi cheksiz, foiz 0-90)" });
        s.minProfitTiers = tiers;
    }
```

- [ ] **Step 3: `server.js` — "Hozir yangilash"**

```js
// POST /api/admin/market-prices/sync-now — soatni kutmasdan avto-narxlarni yangilash
app.post("/api/admin/market-prices/sync-now", requireAdminPanel, async (req, res) => {
    const r = await marketPriceSync.syncMarketPrices();
    if (r.skipped && r.reason === "running") return res.status(409).json({ error: "Yangilanish allaqachon ketmoqda" });
    res.json(r);
});
```

- [ ] **Step 4: Sintaksis tekshiruvi**

Run: `node --check server.js`
Expected: exit 0, chiqishsiz

- [ ] **Step 5: `AdminPricing.jsx` yaratish**

```jsx
import { useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, Save } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { hap } from "../../utils";
import BackLink from "../../components/BackLink";
import { TextCardsSkeleton } from "../../components/Skeleton";

const inputCls = "w-full border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary";
const labelCls = "mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground";

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleString("uz-UZ") : "—";
}

export default function AdminPricing() {
  const { navigate, showToast } = useApp();
  const [s, setS] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  function load() {
    api("/api/admin/settings").then((r) => {
      setS(r);
      setForm({
        marketMarkupPercent: String(r.marketMarkupPercent),
        instantSellMarginPercent: String(r.instantSellMarginPercent),
        usdToSomRate: String(r.usdToSomRate),
        tiers: r.minProfitTiers.map((t) => ({ maxUsd: t.maxUsd == null ? "" : String(t.maxUsd), percent: String(t.percent) })),
      });
    }).catch(() => showToast("Sozlamalarni olishda xato", "err"));
  }
  useEffect(load, []);

  function setTier(i, key, val) {
    setForm((f) => ({ ...f, tiers: f.tiers.map((t, j) => (j === i ? { ...t, [key]: val } : t)) }));
  }
  function addTier() {
    // Yangi pog'ona oxirgi (cheksiz) pog'onadan OLDIN qo'shiladi.
    setForm((f) => ({ ...f, tiers: [...f.tiers.slice(0, -1), { maxUsd: "", percent: "" }, f.tiers[f.tiers.length - 1]] }));
  }
  function removeTier(i) {
    setForm((f) => ({ ...f, tiers: f.tiers.filter((_, j) => j !== i) }));
  }

  async function save() {
    setSaving(true);
    try {
      const body = {
        marketMarkupPercent: Number(form.marketMarkupPercent),
        instantSellMarginPercent: Number(form.instantSellMarginPercent),
        usdToSomRate: Number(form.usdToSomRate),
        minProfitTiers: form.tiers.map((t, i) => ({
          maxUsd: i === form.tiers.length - 1 ? null : Number(t.maxUsd),
          percent: Number(t.percent),
        })),
      };
      await api("/api/admin/settings", { method: "POST", body: JSON.stringify(body) });
      hap("notif", "success");
      showToast("Saqlandi", "ok");
      load();
    } catch (e) {
      hap("notif", "error");
      showToast(e.error || "Saqlashda xato", "err");
    } finally {
      setSaving(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await api("/api/admin/market-prices/sync-now", { method: "POST" });
      if (r.error === "no_key") showToast("Lis API kaliti yo'q — yangilanmadi", "err");
      else if (r.error) showToast("Xato: " + r.error, "err");
      else showToast(`${r.updated} ta e'lon yangilandi`, "ok");
      load();
    } catch (e) {
      showToast(e.error || "Yangilashda xato", "err");
    } finally {
      setSyncing(false);
    }
  }

  if (!s || !form) return <TextCardsSkeleton />;
  const sync = s.lisPriceSync;

  return (
    <div className="max-w-xl space-y-4">
      <BackLink onClick={() => navigate("admin")} label="Admin panelga qaytish" />
      <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">Narx sozlamalari</h1>

      <div className="space-y-1 border border-border bg-card p-4 text-sm">
        <p>Lis API: {s.lisConfigured
          ? <span className="font-semibold text-success">ulangan</span>
          : <span className="font-semibold text-warning">kalit yo'q</span>}</p>
        <p className="text-muted-foreground">Oxirgi yangilanish: {fmtTime(sync?.at)}{sync ? ` · ${sync.updated ?? 0} ta e'lon` : ""}{sync?.error && sync.error !== "no_key" ? ` · xato: ${sync.error}` : ""}</p>
        <button type="button" disabled={syncing} onClick={syncNow}
          className="mt-2 inline-flex items-center gap-1.5 border border-border bg-secondary px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
          <RefreshCw className={"size-3.5" + (syncing ? " animate-spin" : "")} />
          Narxlarni hozir yangilash
        </button>
      </div>

      <div className="space-y-4 border border-border bg-card p-4">
        <div>
          <label className={labelCls}>Market ustamasi, % (e'lon = Lis + shu foiz)</label>
          <input type="number" value={form.marketMarkupPercent} onChange={(e) => setForm({ ...form, marketMarkupPercent: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Autosell marjasi, % (to'lov = Lis − shu foiz)</label>
          <input type="number" value={form.instantSellMarginPercent} onChange={(e) => setForm({ ...form, instantSellMarginPercent: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Dollar kursi (1$ = ? so'm)</label>
          <input type="number" value={form.usdToSomRate} onChange={(e) => setForm({ ...form, usdToSomRate: e.target.value })} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Minimal foyda (skin olingan narxiga qarab)</label>
          <div className="space-y-2">
            {form.tiers.map((t, i) => {
              const isLast = i === form.tiers.length - 1;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{isLast ? "qolgani" : "… $ gacha"}</span>
                  {!isLast && <input type="number" value={t.maxUsd} onChange={(e) => setTier(i, "maxUsd", e.target.value)} placeholder="$" className={inputCls} />}
                  <input type="number" value={t.percent} onChange={(e) => setTier(i, "percent", e.target.value)} placeholder="%" className={inputCls} />
                  {!isLast && form.tiers.length > 1 && (
                    <button type="button" onClick={() => removeTier(i)} className="shrink-0 p-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" onClick={addTier} className="mt-2 inline-flex items-center gap-1 text-xs text-primary"><Plus className="size-3.5" /> Pog'ona qo'shish</button>
        </div>

        <button type="button" disabled={saving} onClick={save}
          className="flex w-full items-center justify-center gap-2 bg-primary py-3 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-40">
          <Save className="size-4" /> {saving ? "..." : "Saqlash"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `AdminApp.jsx`ga ulash**

`import AdminMarket from "./pages/AdminMarket";` qatoridan keyin:

```jsx
import AdminPricing from "./pages/AdminPricing";
```

Sahifalar xaritasiga (`"admin-market": () => <AdminMarket />,` yonida):

```jsx
  "admin-pricing": () => <AdminPricing />,
```

Navigatsiya ro'yxatiga (`{ key: "admin-market", ... }` dan keyin) — mavjud `lucide-react` importiga `Percent` qo'shib:

```jsx
  { key: "admin-pricing", label: "Narxlar", icon: Percent },
```

- [ ] **Step 7: Build**

Run: `cd miniapp && npm run build`
Expected: `✓ built in ...`, xatosiz

- [ ] **Step 8: Commit**

```bash
git add server.js miniapp/src/admin/pages/AdminPricing.jsx miniapp/src/admin/AdminApp.jsx
git commit -m "feat: admin panelda narx sozlamalari (ustama, marja, kurs, minimal foyda)"
```

---

### Task 6: AdminMarket — taklif narxi va e'lonlar boshqaruvi (UI)

**Files:**
- Modify: `miniapp/src/admin/pages/AdminMarket.jsx`

**Interfaces:**
- Consumes (Task 4): `GET /api/admin/list-price?marketHashName=&costSom=` → `{priceSom, minPriceSom, lisConfigured}`; `POST /api/admin/market-bulk-list` `{assetIds, price?}` → `{created, rejected}`; `GET /api/admin/market-listings`; `POST /api/admin/market-listings/:id/price|auto|cost`. Guruh itemlarida `costSom` maydoni.

- [ ] **Step 1: Bulk-list oqimini o'zgartirish**

`AdminMarket.jsx`da:

1. State qo'shing: `const [mode, setMode] = useState("auto");` va `const [listings, setListings] = useState(null);`
2. `selectGroup` ichida `setMode("auto");` qo'shing.
3. `suggestPrice` ichidagi so'rovni guruhdagi eng katta `costSom` bilan yuboring:

```jsx
      const maxCost = Math.max(0, ...selected.items.map((i) => i.costSom || 0));
      const r = await api(`/api/admin/list-price?marketHashName=${encodeURIComponent(selected.marketHashName)}${maxCost ? `&costSom=${maxCost}` : ""}`);
      if (r.priceSom != null) {
        setPrice(String(r.priceSom));
        setMode("pinned");
        hap("notif", "success");
      } else {
        showToast(r.lisConfigured ? "Lis-Skins'da narx topilmadi" : "Lis API kaliti yo'q", "err");
      }
```

4. `submitBulkList`ni almashtiring:

```jsx
  async function submitBulkList() {
    const body = { assetIds: selected.items.map((i) => i.assetId) };
    if (mode === "pinned") {
      const numPrice = Number(price);
      if (!Number.isFinite(numPrice) || numPrice < MIN_PRICE) return showToast(`Minimal narx ${fmtMoney(MIN_PRICE)}`, "err");
      body.price = numPrice;
    }
    setBusy(true);
    try {
      const r = await api("/api/admin/market-bulk-list", { method: "POST", body: JSON.stringify(body) });
      hap("notif", "success");
      const rej = r.rejected?.length ?? 0;
      const minP = Math.max(0, ...(r.rejected || []).map((x) => x.minPrice || 0));
      showToast(
        `${r.created?.length ?? 0} ta e'lon yaratildi` + (rej ? ` · ${rej} ta rad etildi${minP ? ` (minimal narx ${fmtMoney(minP)})` : " (Lis narxi yo'q)"}` : ""),
        rej ? "err" : "ok",
      );
      setSelected(null);
      setPrice("");
      load();
      loadListings();
    } catch (e) {
      showToast(e.error || "Sotuvga qo'yishda xato", "err");
      hap("notif", "error");
    } finally {
      setBusy(false);
    }
  }
```

5. Narx input blokini rejim tanlovi bilan almashtiring (`<div><label className={labelCls}>Narx ...` bloki o'rniga):

```jsx
          <div className="flex gap-2">
            {[["auto", "Avto narx (Lis + ustama)"], ["pinned", "Qo'lda narx"]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setMode(k)}
                className={"flex-1 border px-3 py-2 text-xs font-semibold " + (mode === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                {label}
              </button>
            ))}
          </div>

          {mode === "pinned" && (
            <div>
              <label className={labelCls}>Narx (har bir nusxa uchun, so'm)</label>
              <div className="flex gap-2">
                <input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Masalan: 150000" className={inputCls + " flex-1"} />
                <button type="button" disabled={suggesting} onClick={suggestPrice}
                  className="inline-flex shrink-0 items-center gap-1.5 border border-border bg-secondary px-3 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
                  <Wand2 className={"size-3.5" + (suggesting ? " animate-pulse" : "")} />
                  Lis narxidan taklif qil
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Minimal narx: {fmtMoney(MIN_PRICE)} · olingan narxi bor skinlar uchun minimal foyda qo'shiladi</p>
            </div>
          )}

          {selected.items.some((i) => i.stickers?.length || i.keychains?.length) && (
            <p className="border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              ⚠ Bu guruhda nakleyka yoki breloki bor skin bor — qimmat bo'lsa, qo'lda narx qo'ying.
            </p>
          )}
```

6. Submit tugmasining `disabled` shartini `disabled={busy || (mode === "pinned" && !price)}` ga o'zgartiring.

- [ ] **Step 2: Guruh ro'yxatida ⚠ belgisi**

Guruh tugmasi ichida, `{g.count} ta` span'idan OLDIN:

```jsx
                {g.items?.some((i) => i.stickers?.length || i.keychains?.length) && (
                  <span title="Nakleyka yoki brelok bor" className="shrink-0 text-warning">⚠</span>
                )}
```

- [ ] **Step 3: "Sotuvdagi e'lonlar" bo'limi**

`load` funksiyasidan keyin:

```jsx
  function loadListings() {
    api("/api/admin/market-listings").then(setListings).catch(() => setListings([]));
  }
  useEffect(loadListings, []);

  async function listingAction(id, path, body) {
    try {
      const updated = await api(`/api/admin/market-listings/${id}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      setListings((ls) => ls.map((l) => (l.id === id ? updated : l)));
      hap("notif", "success");
    } catch (e) {
      showToast(e.error || "Xato", "err");
      hap("notif", "error");
    }
  }

  function editPrice(l) {
    const v = window.prompt(`Yangi narx (kamida ${l.minPriceSom.toLocaleString()} so'm):`, String(l.price));
    if (v != null && v !== "") listingAction(l.id, "price", { price: Number(v) });
  }
  function editCost(l) {
    const v = window.prompt("Skin bizga necha so'mga tushgan? (bo'sh = noma'lum)", l.costSom != null ? String(l.costSom) : "");
    if (v != null) listingAction(l.id, "cost", { costSom: v === "" ? null : Number(v) });
  }
```

Eslatma: `window.prompt` admin panelda (oddiy brauzer sahifasi) ishlatiladi — Telegram miniapp'da emas. Agar admin paneldagi boshqa sahifalar prompt o'rniga inline input ishlatsa (`grep -rn "window.prompt" miniapp/src/admin`), shu naqshga moslang.

Komponent oxirida, `{selected && (...)}` blokidan KEYIN:

```jsx
      <h2 className="pt-4 font-heading text-lg font-bold uppercase tracking-wide text-foreground">Sotuvdagi e'lonlar</h2>
      {listings === null && <TextCardsSkeleton />}
      {listings && listings.length === 0 && <Empty icon={PackageOpen} title="Sotuvda e'lon yo'q" />}
      {listings && listings.length > 0 && (
        <div className="space-y-2">
          {listings.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 border border-border bg-card p-3">
              {l.image && <img src={imgSrc(l.image)} alt="" className="size-10 shrink-0 border border-border bg-background object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {(l.hasStickers || l.hasCharm) && <span className="mr-1 text-warning" title="Nakleyka yoki brelok bor">⚠</span>}
                  {l.marketHashName || l.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtMoney(l.price)} · {l.priceMode === "auto" ? "Avto" : "Qotirilgan"}
                  {l.costSom != null && ` · olingan: ${fmtMoney(l.costSom)}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button type="button" onClick={() => editPrice(l)} className="border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">Narx</button>
                {l.priceMode !== "auto" && (
                  <button type="button" onClick={() => listingAction(l.id, "auto")} className="border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">Avtoga</button>
                )}
                <button type="button" onClick={() => editCost(l)} className="border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">Olingan narx</button>
              </div>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Build**

Run: `cd miniapp && npm run build`
Expected: `✓ built in ...`, xatosiz

- [ ] **Step 5: Commit**

```bash
git add miniapp/src/admin/pages/AdminMarket.jsx
git commit -m "feat: admin Market — avto/qo'lda narx, e'lonlar narxini boshqarish, nakleyka belgisi"
```

---

### Task 7: Ko'p skinli Instant Sell — bot yuboradigan offer, moslashtirish, kreditlash

**Files:**
- Modify: `steamTradeOffer.js`
- Modify: `instantSellManager.js` (asosan qayta yoziladi)
- Modify: `index.js` (bildirishnoma matni)
- Create: `tests/instantSell.test.js`

**Interfaces:**
- Consumes: `lisSkinsPrice.getInstantSellPricesSom` (Task 2), `itemCosts.recordCostsInTx` (Task 4)
- Produces:
  - `steamTradeOffer.sendItemRequestOffer(tradeUrl, assetIds: string[], message) → Promise<offerId>` — relay `POST /trade-offer-request`
  - `steamTradeOffer.getItemRequestOfferStatus(offerId) → Promise<{ status, receivedItems: [{assetId, marketHashName}] }>` — relay `GET /trade-offer-request/:offerId`
  - `instantSellManager.matchReceivedItems(requestItems, receivedItems) → Array<{ marketHashName, costSom, botAssetId }> | null` — sof; multiset moslashtirish, mos kelmasa `null`.
  - `instantSellManager.createInstantSellRequest(userId, items: [{assetId, marketHashName}], tradeUrl) → Promise<{ request } | { error }>` — xato kodlari: `"no_key"`, `"price_not_found"` (`{error, assetIds}` bilan), `"relay_unavailable"`, `"empty"`, `"too_many"`.
  - So'rov yozuvi: `{ id, userId, items: [{assetId, marketHashName, priceSom}], totalSom, offerId, status: "awaiting_accept"|"credited"|"expired"|"mismatch", createdAt, expiresAt, creditedAt }`.
  - `pollAndCreditPendingRequests() → Promise<Array<{ request }>>` (o'zgarmagan imzo).
  - `MAX_ITEMS_PER_REQUEST = 30`.

- [ ] **Step 1: Failing test** — `tests/instantSell.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { matchReceivedItems } = require("../instantSellManager");

const req = [
    { assetId: "1", marketHashName: "A (FT)", priceSom: 1000 },
    { assetId: "2", marketHashName: "A (FT)", priceSom: 1000 },
    { assetId: "3", marketHashName: "B (MW)", priceSom: 5000 },
];

test("hammasi mos — har biriga botdagi yangi assetId va narx", () => {
    const r = matchReceivedItems(req, [
        { assetId: "90", marketHashName: "B (MW)" },
        { assetId: "91", marketHashName: "A (FT)" },
        { assetId: "92", marketHashName: "A (FT)" },
    ]);
    assert.equal(r.length, 3);
    assert.deepEqual(r.map(x => x.botAssetId).sort(), ["90", "91", "92"]);
    assert.equal(r.find(x => x.botAssetId === "90").costSom, 5000);
});

test("bitta item boshqasiga almashtirilgan — null", () => {
    assert.equal(matchReceivedItems(req, [
        { assetId: "90", marketHashName: "B (MW)" },
        { assetId: "91", marketHashName: "A (FT)" },
        { assetId: "92", marketHashName: "C (BS)" },
    ]), null);
});

test("kam item kelgan — null", () => {
    assert.equal(matchReceivedItems(req, [{ assetId: "90", marketHashName: "B (MW)" }]), null);
});

test("ortiqcha item kelgan — null", () => {
    assert.equal(matchReceivedItems(req.slice(2), [
        { assetId: "90", marketHashName: "B (MW)" },
        { assetId: "91", marketHashName: "B (MW)" },
    ]), null);
});

test("receivedItems yo'q/massiv emas — null", () => {
    assert.equal(matchReceivedItems(req, undefined), null);
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npm test`
Expected: FAIL — `matchReceivedItems is not a function`

- [ ] **Step 3: `steamTradeOffer.js`ga relay klient funksiyalari**

Fayl boshidagi kontrakt izohiga qo'shing:

```js
//   POST /trade-offer-request    { tradeUrl, assetIds, message } -> { offerId }
//        (bot HECH NARSA bermaydi, faqat userdan itemlarni so'raydi — Instant Sell)
//   GET  /trade-offer-request/:offerId -> { status, receivedItems: [{assetId, marketHashName}] }
//        receivedItems faqat status === "Accepted" bo'lganda; assetId — BOTDAGI yangi id.
```

`cancelTradeOffer`dan keyin:

```js
async function sendItemRequestOffer(tradeUrl, assetIds, message) {
    const body = await relayRequest("/trade-offer-request", {
        method: "POST",
        body: JSON.stringify({ tradeUrl, assetIds: assetIds.map(String), message: message || "" }),
    });
    if (!body?.offerId) throw new Error("Relay offerId qaytarmadi");
    return String(body.offerId);
}

async function getItemRequestOfferStatus(offerId) {
    const body = await relayRequest(`/trade-offer-request/${offerId}`);
    return { status: body?.status || null, receivedItems: Array.isArray(body?.receivedItems) ? body.receivedItems : [] };
}
```

`module.exports`ni yangilang:

```js
module.exports = { sendTradeOffer, getTradeOfferStatus, cancelTradeOffer, sendItemRequestOffer, getItemRequestOfferStatus };
```

- [ ] **Step 4: `instantSellManager.js`ni qayta yozish**

Fayl boshidagi izohni oqimga moslang (1-qadam: bot o'zi offer yuboradi; 2: user Steam'da qabul qiladi; 3: polling `Accepted` + moslashtirish → kredit + itemCosts). `relayHeaders`/`relayBase` olib tashlanadi. Fayl tanasi:

```js
const { read, write, refresh, withTransaction, readTx, writeTx } = require("./database/db");
const lis = require("./lisSkinsPrice");
const { sendItemRequestOffer, getItemRequestOfferStatus, cancelTradeOffer } = require("./steamTradeOffer");
const itemCosts = require("./itemCosts");

const REQUEST_TTL_MS = 15 * 60 * 1000; // 15 daqiqa ichida qabul qilinmasa offer bekor qilinadi
const MAX_ITEMS_PER_REQUEST = 30;
const FAILED_STATES = new Set(["Declined", "Canceled", "Expired", "InvalidItems", "CanceledBySecondFactor", "Countered"]);

function getAllRequests() {
    const raw = read("instantSellRequests");
    return Array.isArray(raw) ? raw : [];
}
function getInstantSellRequest(id) {
    return getAllRequests().find(r => r.id === id) || null;
}
function getMyInstantSellRequests(userId) {
    return getAllRequests().filter(r => r.userId === userId).sort((a, b) => b.id - a.id);
}

// Kelgan itemlar so'ralganlarga market_hash_name bo'yicha MULTISET sifatida
// aniq mos kelishi shart (soni ham, turi ham). Bir xil turdagi 2 nusxa
// bo'lsa — har biri alohida juftlanadi. Mos kelmasa null → pul berilmaydi.
function matchReceivedItems(requestItems, receivedItems) {
    if (!Array.isArray(receivedItems) || receivedItems.length !== requestItems.length) return null;
    const pool = requestItems.map(it => ({ ...it, used: false }));
    const out = [];
    for (const rec of receivedItems) {
        const m = pool.find(p => !p.used && p.marketHashName === rec?.marketHashName);
        if (!m) return null;
        m.used = true;
        out.push({ marketHashName: m.marketHashName, costSom: m.priceSom, botAssetId: String(rec.assetId) });
    }
    return out;
}

// `items` — [{assetId, marketHashName}] (server userning inventaridan
// tekshirib uzatadi). Narx SERVERDA qayta hisoblanadi — client narxiga
// ishonilmaydi.
async function createInstantSellRequest(userId, items, tradeUrl) {
    if (!lis.isLisConfigured()) return { error: "no_key" };
    if (!Array.isArray(items) || !items.length) return { error: "empty" };
    if (items.length > MAX_ITEMS_PER_REQUEST) return { error: "too_many" };

    const prices = await lis.getInstantSellPricesSom(items.map(i => i.marketHashName));
    const priced = items.map(i => ({ assetId: String(i.assetId), marketHashName: i.marketHashName, priceSom: prices.get(i.marketHashName) ?? null }));
    const unpriced = priced.filter(i => i.priceSom == null || !Number.isFinite(i.priceSom) || i.priceSom <= 0);
    if (unpriced.length) return { error: "price_not_found", assetIds: unpriced.map(i => i.assetId) };
    const totalSom = priced.reduce((a, i) => a + i.priceSom, 0);

    const id = Date.now();
    let offerId;
    try {
        offerId = await sendItemRequestOffer(tradeUrl, priced.map(i => i.assetId), `Skin sotish #${id}`);
    } catch {
        return { error: "relay_unavailable" };
    }

    const request = {
        id, userId, items: priced, totalSom, offerId,
        status: "awaiting_accept",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + REQUEST_TTL_MS).toISOString(),
        creditedAt: null,
    };
    // Bot ⇄ mini-app alohida jarayonlar — yozishni tranzaksiyada qilamiz,
    // boshqa jarayon shu orada qo'shgan so'rovni bosib yubormaslik uchun.
    await withTransaction(async (session) => {
        const raw = await readTx(session, "instantSellRequests");
        const all = Array.isArray(raw) ? raw : [];
        all.push(request);
        await writeTx(session, "instantSellRequests", all);
        return { cacheUpdates: { instantSellRequests: all } };
    });
    return { request };
}

// Tranzaksiya ichida balans + 7 kunlik hold ledgeri (balanceManager
// naqshi bilan bir xil shakl — admin "bekor qilish" ham shu yozuvni ko'radi).
function creditRequestInTx(users, ledgers, request) {
    const amount = request.totalSom;
    const user = users.find(u => u.id === request.userId);
    if (user) {
        user.balance = (user.balance ?? 0) + amount;
        if (!Array.isArray(user.balanceHistory)) user.balanceHistory = [];
        user.balanceHistory.push({ amount, reason: `Autosell — ${request.items.length} ta skin sotildi (#${request.id})`, date: new Date().toISOString() });
    }
    let ledger = ledgers.find(l => l.userId === request.userId);
    if (!ledger) { ledger = { userId: request.userId, entries: [] }; ledgers.push(ledger); }
    if (!Array.isArray(ledger.entries)) ledger.entries = [];
    ledger.entries.push({
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        amount, source: "trade", tradeId: request.id, fee: 0,
        receivedAt: new Date().toISOString(),
        withdrawalStatus: null,
    });
}

let _polling = false;
async function pollAndCreditPendingRequests() {
    if (_polling) return [];
    _polling = true;
    try {
        return await _pollInner();
    } finally {
        _polling = false;
    }
}

async function _pollInner() {
    // ── 1-bosqich: relay bilan gaplashish — tranzaksiyadan TASHQARIDA ──
    await refresh("instantSellRequests").catch(() => {});
    const all = getAllRequests();
    const now = Date.now();
    const outcomes = new Map(); // id -> { status, matched? }

    for (const r of all) {
        // Eski (deposit-expect davridagi) yozuvlar — relay ularni hech qachon
        // qo'llab-quvvatlamagan, shunchaki eskiradi.
        if (r.status === "awaiting_deposit") { outcomes.set(r.id, { status: "expired" }); continue; }
        if (r.status !== "awaiting_accept") continue;

        let st;
        try { st = await getItemRequestOfferStatus(r.offerId); }
        catch { continue; } // relay vaqtincha ishlamasa — keyingi tsiklda

        if (st.status === "Accepted") {
            const matched = matchReceivedItems(r.items, st.receivedItems);
            outcomes.set(r.id, matched ? { status: "credited", matched } : { status: "mismatch" });
        } else if (FAILED_STATES.has(st.status)) {
            outcomes.set(r.id, { status: "expired" });
        } else if (new Date(r.expiresAt).getTime() <= now) {
            await cancelTradeOffer(r.offerId).catch(() => {});
            outcomes.set(r.id, { status: "expired" });
        }
    }
    if (!outcomes.size) return [];

    // ── 2-bosqich: holat + pul + itemCosts — BITTA tranzaksiyada ──
    const result = await withTransaction(async (session) => {
        const rawReq = await readTx(session, "instantSellRequests");
        const requests = Array.isArray(rawReq) ? rawReq : [];
        const toCredit = [];
        let changed = false;
        for (const r of requests) {
            const o = outcomes.get(r.id);
            if (!o) continue;
            // Faqat hali kutilayotganlarga tegamiz — boshqa jarayon allaqachon
            // "credited" qilgan bo'lsa ikkinchi marta kreditlanmaydi.
            if (r.status !== "awaiting_accept" && r.status !== "awaiting_deposit") continue;
            r.status = o.status;
            changed = true;
            if (o.status === "credited") {
                r.creditedAt = new Date().toISOString();
                r.receivedItems = o.matched;
                toCredit.push(r);
            }
        }
        if (!changed) return { results: [] };

        const cacheUpdates = { instantSellRequests: requests };
        if (toCredit.length) {
            const rawUsers = await readTx(session, "users");
            const users = Array.isArray(rawUsers) ? rawUsers : Object.values(rawUsers);
            const rawLedgers = await readTx(session, "tradeBalances");
            const ledgers = Array.isArray(rawLedgers) ? rawLedgers : [];
            const rawCosts = await readTx(session, "itemCosts");
            const costs = Array.isArray(rawCosts) ? rawCosts : [];

            for (const r of toCredit) {
                creditRequestInTx(users, ledgers, r);
                itemCosts.recordCostsInTx(costs, r.receivedItems.map(m => ({ ...m, instantSellRequestId: r.id })));
            }
            await writeTx(session, "users", users);
            await writeTx(session, "tradeBalances", ledgers);
            await writeTx(session, "itemCosts", costs);
            Object.assign(cacheUpdates, { users, tradeBalances: ledgers, itemCosts: costs });
        }
        await writeTx(session, "instantSellRequests", requests);
        return { results: toCredit.map(r => ({ request: r })), cacheUpdates };
    });

    return result?.results || [];
}

module.exports = {
    MAX_ITEMS_PER_REQUEST,
    matchReceivedItems, createInstantSellRequest, getInstantSellRequest,
    getMyInstantSellRequests, pollAndCreditPendingRequests,
};
```

- [ ] **Step 5: Testlar**

Run: `npm test`
Expected: PASS (barcha testlar, jumladan `instantSell`)

- [ ] **Step 6: `index.js` — bildirishnoma matni**

Instant Sell `setInterval` ichidagi `notifyUser(...)` matnini almashtiring:

```js
                notifyUser(request.userId,
                    `✅ *Skin sotish yakunlandi!*\n\n📦 ${request.items.length} ta skin\n💰 *${request.totalSom.toLocaleString()} so'm* hisobingizga tushdi.\n\n🧊 7 kundan keyin "Balans" bo'limidan yechib olishingiz mumkin bo'ladi.`,
                    bot.telegram.sendMessage.bind(bot.telegram), { parse_mode: "Markdown" }
                );
```

- [ ] **Step 7: Mos kelmagan holatda adminga xabar**

`pollAndCreditPendingRequests` natijasi (kreditlanganlar) o'zgarmaydi; mos kelmaganlar uchun `index.js`da alohida tekshiruv qo'shing (xuddi shu `setInterval` ichida, `for` tsiklidan keyin). Avval `index.js`da `read`, `write`, `refresh` import qilinganini tekshiring (`grep -n "database/db" index.js`), bo'lmasa importga qo'shing.

```js
            // Mos kelmagan autosell — adminga bir marta xabar (pul berilmagan).
            await refresh("instantSellRequests").catch(() => {});
            const reqs = read("instantSellRequests");
            let notified = false;
            for (const r of Array.isArray(reqs) ? reqs : []) {
                if (r.status !== "mismatch" || r.adminNotified) continue;
                notifyUser(Number(process.env.ADMIN_ID),
                    `⚠️ *Autosell: kelgan skinlar so'ralganiga mos emas!*\n\nSo'rov #${r.id}, user \`${r.userId}\`. Pul berilmadi — qo'lda tekshiring.`,
                    bot.telegram.sendMessage.bind(bot.telegram), { parse_mode: "Markdown" });
                r.adminNotified = true;
                notified = true;
            }
            if (notified) write("instantSellRequests", reqs);
```

`adminNotified` oddiy `write` bilan yoziladi — u faqat bildirishnoma takrorlanmasligi uchun, pulga tegmaydi.

- [ ] **Step 8: Commit**

```bash
git add steamTradeOffer.js instantSellManager.js index.js tests/instantSell.test.js
git commit -m "feat: ko'p skinli Autosell — bot o'zi offer yuboradi, kelgan itemlar moslashtiriladi"
```

---

### Task 8: Autosell server route'lari va bot oqimi

**Files:**
- Modify: `server.js` (`/api/instant-sell`, yangi `/api/instant-sell/quote`)
- Modify: `handlers/marketHandler.js` (`is_confirm`)

**Interfaces:**
- Consumes: `instantSellManager.createInstantSellRequest(userId, items, tradeUrl)`, `MAX_ITEMS_PER_REQUEST` (Task 7), `lisSkinsPrice.getInstantSellPricesSom`, `isLisConfigured` (Task 2)
- Produces:
  - `GET /api/instant-sell/quote` → `{ lisConfigured: boolean, maxItems: number, items: [{ assetId, name, image, float, rarity, stickers, marketHashName, priceSom: number|null, tradable }] }`
  - `POST /api/instant-sell` `{ assetIds: string[] }` (yoki eski `{ assetId }`) → `{ request }` | `400 { error, assetIds? }`

- [ ] **Step 1: `server.js` — quote route** (`POST /api/instant-sell`dan OLDIN)

```js
// GET /api/instant-sell/quote — userning Steam inventari + har skin uchun
// darhol to'lanadigan narx (Lis − marja). Narx skin TURI bo'yicha bitta
// batch so'rov bilan olinadi. Kalit yo'q bo'lsa lisConfigured:false —
// UI "Tez orada" ko'rsatadi.
app.get("/api/instant-sell/quote", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    if (!u.steamId64) return res.status(400).json({ error: "Avval Steam hisobingizni ulang" });
    const lisConfigured = lisSkinsPrice.isLisConfigured();

    let items;
    try { items = await fetchUserInventory(u.steamId64); }
    catch (err) { return res.status(500).json({ error: err.message }); }

    const withNames = items.map(it => ({ ...it, marketHashName: skinUtils.marketHashName(it.name, it.float) }));
    let prices = new Map();
    if (lisConfigured) {
        try { prices = await lisSkinsPrice.getInstantSellPricesSom(withNames.filter(i => i.tradable !== false).map(i => i.marketHashName)); }
        catch { /* Lis xato — barcha narx null, UI "sotib bo'lmaydi" ko'rsatadi */ }
    }
    res.json({
        lisConfigured,
        maxItems: instantSellManager.MAX_ITEMS_PER_REQUEST,
        items: withNames.map(it => ({
            assetId: it.assetId, name: it.name, image: it.image, float: it.float, rarity: it.rarity,
            stickers: skinUtils.enrichStickers(it.stickers),
            marketHashName: it.marketHashName,
            tradable: it.tradable !== false,
            priceSom: it.tradable === false ? null : (prices.get(it.marketHashName) ?? null),
        })),
    });
});
```

- [ ] **Step 2: `server.js` — `POST /api/instant-sell`ni almashtirish**

```js
// POST /api/instant-sell — { assetIds: string[] } (yoki eski { assetId }) —
// tanlangan skinlarni darhol sotish. Bot userning trade link'iga itemlarni
// so'rovchi BITTA offer yuboradi; user Steam'da qabul qilgach pul tushadi.
app.post("/api/instant-sell", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    if (!u.steamId64) return res.status(400).json({ error: "Avval Steam hisobingizni ulang" });
    if (!u.tradeLink) return res.status(400).json({ error: "Avval Trade Link kiriting" });

    const ids = Array.isArray(req.body.assetIds) ? req.body.assetIds.map(String)
        : req.body.assetId ? [String(req.body.assetId)] : [];
    const unique = [...new Set(ids)];
    if (!unique.length) return res.status(400).json({ error: "assetIds kerak" });

    let inv;
    try { inv = await fetchUserInventory(u.steamId64); }
    catch (err) { return res.status(500).json({ error: err.message }); }

    const items = [];
    for (const id of unique) {
        const it = inv.find(x => String(x.assetId) === id && x.tradable !== false);
        if (!it) return res.status(404).json({ error: "Item topilmadi yoki sotib bo'lmaydi (kesh eskirgan)" });
        items.push({ assetId: it.assetId, marketHashName: skinUtils.marketHashName(it.name, it.float) });
    }

    const result = await instantSellManager.createInstantSellRequest(u.id, items, u.tradeLink);
    if (result.error) return res.status(400).json({ error: result.error, assetIds: result.assetIds });
    res.json({ request: result.request });
});
```

- [ ] **Step 3: `handlers/marketHandler.js` — `is_confirm`**

`is_confirm` ichidagi `createInstantSellRequest` chaqiruvidan boshlab handler oxirigacha almashtiring:

```js
        if (!user.tradeLink) return ctx.answerCbQuery("❌ Avval mini-app'da Trade Link kiriting.", true);

        let result;
        try {
            result = await instantSellManager.createInstantSellRequest(user.id, [{ assetId: pending.assetId, marketHashName: pending.marketHashName }], user.tradeLink);
        } catch (err) {
            return ctx.answerCbQuery("❌ Xatolik: " + err.message, true);
        }
        const errText = {
            no_key: "Skin sotish tez orada ishga tushadi.",
            price_not_found: "Bu skin uchun narx topilmadi.",
            relay_unavailable: "Hozir sotib bo'lmaydi, keyinroq urinib ko'ring.",
        };
        if (result.error) return ctx.answerCbQuery("❌ " + (errText[result.error] || result.error), true);

        await ctx.answerCbQuery();
        await ctx.editMessageText(
            `📨 *"${pending.name}"* uchun Steam'ga trade offer yuborildi.\n\n` +
            `Steam'da offerni qabul qiling — qabul qilingach *${result.request.totalSom.toLocaleString()} so'm* balansingizga tushadi.\n\n⏰ Offer 15 daqiqa amal qiladi.`,
            { parse_mode: "Markdown" }
        ).catch(() => {});
    });
```

Shuningdek `is_pick_*` handleridagi `getInstantSellPriceSom` chaqiruvidan OLDIN qo'shing:

```js
        if (!require("../lisSkinsPrice").isLisConfigured()) return ctx.answerCbQuery("⏳ Skin sotish tez orada ishga tushadi.", true);
```

(Agar faylning boshida `lisSkinsPrice` allaqachon require qilingan bo'lsa — o'sha o'zgaruvchidan foydalaning.)

- [ ] **Step 4: Sintaksis va testlar**

Run: `node --check server.js && node --check handlers/marketHandler.js && npm test`
Expected: exit 0, barcha testlar PASS

- [ ] **Step 5: `BOT_STEAM_TRADE_URL` endi kerak emasligini tekshirish**

Run: `grep -rn "BOT_STEAM_TRADE_URL" --include=*.js --include=*.jsx . | grep -v node_modules`
Expected: faqat `miniapp/src/pages/MarketSell.jsx` (Task 9'da olib tashlanadi) yoki hech narsa. `.env.example`dagi qatorni "ixtiyoriy, endi ishlatilmaydi" izohi bilan qoldiring.

- [ ] **Step 6: Commit**

```bash
git add server.js handlers/marketHandler.js .env.example
git commit -m "feat: Autosell quote/sell route'lari va bot oqimi yangi offer tizimiga"
```

---

### Task 9: `MarketSell.jsx` — Lis-Skins uslubidagi sotish ekrani (sayt + miniapp)

**Files:**
- Modify: `miniapp/src/pages/MarketSell.jsx`
- Modify: `miniapp/src/i18n.js`

**Interfaces:**
- Consumes (Task 8): `GET /api/instant-sell/quote`, `POST /api/instant-sell` `{assetIds}` → `{request: {totalSom, items, expiresAt}}`; xato `{error: "no_key"|"price_not_found"|"relay_unavailable"|"too_many"|...}`.

- [ ] **Step 1: i18n kalitlari**

`miniapp/src/i18n.js`da `market.instantSell*` kalitlari turgan joyga (har bir til bo'limiga — faylda qaysi tillar borligini tekshiring; faqat o'zbekcha bo'lsa, faqat unga) qo'shing:

```js
    "market.sellTitle": "Skinlarni sotish",
    "market.sellYouGet": "Sizga to'lanadi",
    "market.sellUnavailable": "Sotib bo'lmaydi",
    "market.sellTotal": "Jami",
    "market.sellBtn": "Sotish",
    "market.sellSelected": "ta tanlandi",
    "market.sellComingSoon": "Skin sotish tez orada ishga tushadi",
    "market.sellComingSoonDesc": "Narxlar Lis-Skins asosida hisoblanadi. Tez orada shu yerdan skinlaringizni darhol sotishingiz mumkin bo'ladi.",
    "market.sellOfferSentTitle": "Trade offer yuborildi",
    "market.sellOfferSentDesc": "Steam'da botdan kelgan offerni qabul qiling. Qabul qilingach balansingizga tushadi:",
    "market.sellOfferTtl": "Offer 15 daqiqa amal qiladi.",
    "market.sellOpenSteam": "Steam'da offerlarni ochish",
    "market.sellTooMany": "Bir vaqtda ko'pi bilan {n} ta skin sotish mumkin",
    "market.sellErrPriceSome": "Ba'zi skinlarning narxi o'zgardi yoki topilmadi — ro'yxat yangilandi",
    "market.sellSelectAll": "Hammasini tanlash",
    "market.sellClear": "Tozalash",
```

`t()` `{n}` o'rniga qo'yishni qo'llab-quvvatlashini tekshiring (`grep -n "function t" miniapp/src/i18n.js`); qo'llamasa, chaqiruvda `.replace("{n}", max)` ishlating.

- [ ] **Step 2: `MarketSell.jsx` — admin bo'lmaganlar uchun yangi ekran**

Admin oqimi (`priceStep`, `confirmCreate`) o'zgarmaydi. Admin bo'lmagan userlar uchun yangi `UserSellScreen` komponentini shu faylga qo'shing va asosiy komponentda `if (!isAdmin) return <UserSellScreen />;` ni `if (!user)` tekshiruvidan KEYIN qo'ying. Eski `instantStep`/`instantResult`/`confirmInstantSell`/`sellAnother`/`instantSellErr` va ularga tegishli JSX bloklari olib tashlanadi (admin endi ularni ko'rmaydi, user esa yangi ekranni ko'radi). Ishlatilmay qolgan importlarni (`Zap`, `CheckCircle2`, `Copy`) olib tashlang, agar boshqa joyda ishlatilmasa.

```jsx
function sellErr(e) {
  const code = e?.error || e;
  if (code === "no_key") return t("market.sellComingSoon");
  if (code === "relay_unavailable") return t("market.instantSellErrRelay");
  if (code === "price_not_found") return t("market.sellErrPriceSome");
  if (typeof code === "string" && code) return code;
  return t("common.genericError");
}

function UserSellScreen() {
  const { user, setUser, navigate, showToast, tg } = useApp();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [showWizard, setShowWizard] = useState(false);

  function load() {
    setQuote(null);
    setError("");
    api("/api/instant-sell/quote")
      .then((q) => { setQuote(q); setPicked(new Set()); })
      .catch((e) => setError(tradeErr(e)));
  }
  useEffect(() => { if (user?.steamId64) load(); }, [user?.steamId64]);

  async function connectSteam() {
    try {
      const r = await api("/api/steam-login-url");
      if (tg?.openLink) tg.openLink(r.url); else window.open(r.url, "_blank");
    } catch (e) { showToast(tradeErr(e), "err"); }
  }

  const sellable = (quote?.items || []).filter((i) => i.priceSom != null);
  const total = sellable.filter((i) => picked.has(i.assetId)).reduce((a, i) => a + i.priceSom, 0);
  const max = quote?.maxItems ?? 30;

  function toggle(it) {
    if (it.priceSom == null) return;
    hap("impact", "light");
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(it.assetId)) next.delete(it.assetId);
      else if (next.size >= max) { showToast(t("market.sellTooMany").replace("{n}", max), "err"); return prev; }
      else next.add(it.assetId);
      return next;
    });
  }
  function selectAll() {
    setPicked(new Set(sellable.slice(0, max).map((i) => i.assetId)));
  }

  async function sell(tradeLinkOverride) {
    if (!(tradeLinkOverride || user.tradeLink)) { setShowWizard(true); return; }
    setBusy(true);
    try {
      const r = await api("/api/instant-sell", { method: "POST", body: JSON.stringify({ assetIds: [...picked] }) });
      hap("notif", "success");
      setSent(r.request);
    } catch (e) {
      hap("notif", "error");
      showToast(sellErr(e), "err");
      if (e?.error === "price_not_found") load();
    } finally {
      setBusy(false);
    }
  }

  function handleWizardDone(patch) {
    setShowWizard(false);
    if (patch?.tradeLink) {
      setUser((u) => (u ? { ...u, tradeLink: patch.tradeLink, ...(patch.steamPublicConfirmed ? { steamPublicConfirmed: true } : {}) } : u));
      sell(patch.tradeLink);
    }
  }

  const grid = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

  return (
    <div className="space-y-5 pb-24">
      <BackLink onClick={() => navigate("market")} label={t("market.back")} />
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-bold uppercase tracking-wide text-foreground">{t("market.sellTitle")}</h2>
        {quote?.lisConfigured && sellable.length > 0 && !sent && (
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={selectAll} className="text-primary">{t("market.sellSelectAll")}</button>
            {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} className="text-muted-foreground">{t("market.sellClear")}</button>}
          </div>
        )}
      </div>

      {!user.steamId64 ? (
        <div className="flex flex-col items-center gap-3 border border-border bg-card py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("trade.connectSteamFirst")}</p>
          <button type="button" onClick={connectSteam} className="flex items-center gap-2 bg-primary px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground">
            <SteamLogo className="size-4" /> {t("trade.connectSteam")}
          </button>
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !quote ? (
        <div className={grid}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 border border-border bg-secondary/30 p-3">
              <span className="skeleton size-16" /><span className="skeleton h-3 w-4/5" /><span className="skeleton h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : !quote.lisConfigured ? (
        <Empty icon={ShoppingBag} title={t("market.sellComingSoon")}>
          <p className="max-w-sm text-sm text-muted-foreground">{t("market.sellComingSoonDesc")}</p>
        </Empty>
      ) : sent ? (
        <div className="space-y-4 border border-success/40 bg-success/10 p-5">
          <p className="font-heading text-base font-bold text-foreground">{t("market.sellOfferSentTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("market.sellOfferSentDesc")}{" "}
            <span className="font-semibold text-success">{sent.totalSom.toLocaleString()} {t("common.somWithAmount")}</span>
          </p>
          <p className="text-xs text-warning">{t("market.sellOfferTtl")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => { const url = "https://steamcommunity.com/my/tradeoffers/"; if (tg?.openLink) tg.openLink(url); else window.open(url, "_blank"); }}
              className="flex flex-1 items-center justify-center gap-2 bg-primary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground">
              <SteamLogo className="size-4" /> {t("market.sellOpenSteam")}
            </button>
            <button type="button" onClick={() => { setSent(null); load(); }} className="flex-1 border border-border py-2.5 text-sm text-muted-foreground hover:text-foreground">
              {t("market.instantSellSellAnother")}
            </button>
          </div>
        </div>
      ) : quote.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("trade.noTradable")}</p>
      ) : (
        <div className={grid}>
          {quote.items.map((it, i) => {
            const on = picked.has(it.assetId);
            const disabled = it.priceSom == null;
            return (
              <motion.button
                key={it.assetId}
                type="button"
                disabled={disabled}
                onClick={() => toggle(it)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: Math.min(i, 11) * 0.03 }}
                whileTap={disabled ? undefined : { scale: 0.95 }}
                className={
                  "relative flex flex-col items-center gap-1.5 border p-3 text-center transition-colors " +
                  (disabled ? "cursor-not-allowed border-border bg-secondary/10 opacity-50"
                    : on ? "border-primary bg-primary/10" : "border-border bg-secondary/30 hover:border-primary/40")
                }
              >
                {on && (
                  <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3.5" />
                  </span>
                )}
                <span className="flex size-16 items-center justify-center">
                  {it.image ? <img src={imgSrc(it.image)} alt="" className="size-full object-contain" /> : <Package className="size-6 text-muted-foreground" />}
                </span>
                <p className="line-clamp-2 text-xs text-foreground">{it.name}</p>
                {it.float != null && (
                  <span className={"border px-1.5 py-0.5 text-[10px] font-semibold " + wearClasses(it.float)}>{it.float.toFixed(4)}</span>
                )}
                {disabled ? (
                  <span className="text-[11px] text-muted-foreground">{t("market.sellUnavailable")}</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    {t("market.sellYouGet")}: <span className="font-semibold text-success">{it.priceSom.toLocaleString()}</span>
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      )}

      {quote?.lisConfigured && !sent && picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{picked.size} {t("market.sellSelected")}</p>
              <p className="font-heading text-base font-bold text-foreground">
                {t("market.sellTotal")}: <span className="text-success">{total.toLocaleString()} {t("common.somWithAmount")}</span>
              </p>
            </div>
            <button type="button" disabled={busy} onClick={() => sell()}
              className="flex shrink-0 items-center justify-center gap-2 bg-primary px-6 py-3 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-50">
              {busy ? <span className="spin size-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : t("market.sellBtn")}
            </button>
          </div>
        </div>
      )}

      {showWizard && <TradeOnboardingWizard onDone={handleWizardDone} />}
    </div>
  );
}
```

Eslatma: pastki yopishqoq panel (`fixed bottom-0`) miniapp'dagi pastki navigatsiya bilan ustma-ust tushmasligini tekshiring — `AppShell.jsx`da pastki nav bo'lsa (`grep -n "fixed bottom-0\|bottom-nav" miniapp/src/components/AppShell.jsx`), panelga mos `bottom-[...]` qiymat bering.

- [ ] **Step 3: Market sahifasidagi "Sotish" kirish nuqtasi**

`miniapp/src/pages/Market.jsx`dagi `InstantSellCard` matni Task 7 (eski reja) davridan — uning tugmasi `navigate("market-sell")` ga olib borishini tekshiring (`grep -n "market-sell\|InstantSellCard" miniapp/src/pages/Market.jsx`). Agar matnida "trade-link'ga yuboring" kabi eski oqim tavsifi bo'lsa — "Skinlaringizni darhol soting" ga moslang (i18n kaliti orqali).

- [ ] **Step 4: Build**

Run: `cd miniapp && npm run build`
Expected: `✓ built in ...`, xatosiz

- [ ] **Step 5: Qo'lda vizual tekshiruv (telefon + kompyuter kengligi)**

Run: `cd miniapp && npx vite preview --port 4173` (fonda), brauzerda `http://localhost:4173` — kirish talab qilinsa, mavjud `DEV_BYPASS_SECRET` naqshidan foydalaning (`grep -n "devBypass" miniapp/src/api.js`). Kalit yo'q holatda "Tez orada ishga tushadi" ekrani chiqishini, 375px va 1280px kenglikda to'r 2 va 5–6 ustun bo'lishini tekshiring. Imkon bo'lmasa — buni hisobotda ochiq ayting, soxta "tekshirildi" yozmang.

- [ ] **Step 6: Commit**

```bash
git add miniapp/src/pages/MarketSell.jsx miniapp/src/pages/Market.jsx miniapp/src/i18n.js
git commit -m "feat: Lis-Skins uslubidagi ko'p tanlovli skin sotish ekrani (sayt + miniapp)"
```

---

### Task 10: Relay — itemlarni so'rovchi offer endpointlari (mirror, deploy QILINMAYDI)

**Files:**
- Modify: `docs/superpowers/relay/server.js`
- Modify: `docs/superpowers/relay/DEPLOY.md`

**Interfaces:**
- Produces (relay kontrakti, Task 7 klienti shunga mos): `POST /trade-offer-request { tradeUrl, assetIds, message } → { offerId }`; `GET /trade-offer-request/:offerId → { status, receivedItems }`.

- [ ] **Step 1: Mirror'ga yangi bo'lim qo'shish**

`docs/superpowers/relay/server.js` oxiriga (mavjud deposit bo'limidan keyin; u endi ishlatilmasligini izohda ayting):

```js
// ── Autosell (2026-10-14): bot userdan itemlarni SO'RAYDIGAN offer ────────
// Bot hech narsa bermaydi — shu sabab Steam mobile tasdiqlash KERAK EMAS.
// Yuqoridagi deposit-expect bo'limi endi backend tomonidan ishlatilmaydi
// (backend bu yangi endpointlarga o'tdi) — deploy paytida uni qo'shmaslik mumkin.
app.post("/trade-offer-request", (req, res) => {
    const { tradeUrl, assetIds, message } = req.body || {};
    if (!tradeUrl || !Array.isArray(assetIds) || !assetIds.length || assetIds.length > 30) {
        return res.status(400).json({ error: "tradeUrl va 1-30 ta assetIds kerak" });
    }
    const offer = manager.createOffer(tradeUrl);
    offer.addTheirItems(assetIds.map(id => ({ appid: 730, contextid: "2", assetid: String(id) })));
    if (message) offer.setMessage(String(message).slice(0, 120));
    offer.send((err) => {
        if (err) return res.status(502).json({ error: err.message });
        res.json({ offerId: String(offer.id) });
    });
});

app.get("/trade-offer-request/:offerId", (req, res) => {
    manager.getOffer(req.params.offerId, (err, offer) => {
        if (err) return res.status(502).json({ error: err.message });
        const status = TradeOfferManager.ETradeOfferState[offer.state];
        if (status !== "Accepted") return res.json({ status, receivedItems: [] });
        offer.getReceivedItems((err2, items) => {
            if (err2) return res.status(502).json({ error: err2.message });
            res.json({
                status,
                receivedItems: (items || []).map(i => ({ assetId: String(i.assetid || i.id), marketHashName: i.market_hash_name })),
            });
        });
    });
});
```

- [ ] **Step 2: `DEPLOY.md`ga bo'lim qo'shish**

Fayl oxiriga:

```markdown
## 2026-10-14 — Autosell endpointlari (`/trade-offer-request`)

Backend (instantSellManager.js) endi `POST /trade-offer-request` va
`GET /trade-offer-request/:offerId` ni chaqiradi (kod: `server.js` oxiridagi
"Autosell" bo'limi). Deploy qilish uchun:

1. Foydalanuvchi real `/opt/steam-relay/server.js`ni `!`-prefiksli buyruq bilan
   ko'chirib beradi (Claude o'zi VPS'ga ulana olmaydi — sandbox cheklovi).
2. `app`, `manager`, `TradeOfferManager` nomlari real faylda tasdiqlanadi.
3. Bo'lim `x-relay-secret` middleware'dan KEYIN qo'shiladi.
4. `pm2 restart steam-relay`, keyin `curl -H "x-relay-secret: ..." .../trade-offer-request/123`
   — 502/JSON javob kelishi (404 emas) endpoint ulanganini bildiradi.
5. Haqiqiy sinov: kichik skin bilan autosell → Steam'da qabul qilish →
   `receivedItems[].marketHashName` backend hosil qilgan nom bilan bir xilligini tekshirish
   (`skinUtils.marketHashName` taxmini shu yerda tasdiqlanadi).
```

- [ ] **Step 3: Sintaksis tekshiruvi**

Run: `node --check docs/superpowers/relay/server.js`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/relay/server.js docs/superpowers/relay/DEPLOY.md
git commit -m "docs: relay uchun autosell offer endpointlari (deploy kutilmoqda)"
```

---

## Yakuniy tekshiruv (barcha tasklardan keyin)

- [ ] `npm test` — barcha testlar PASS
- [ ] `node --check server.js index.js instantSellManager.js marketPriceSync.js` — exit 0
- [ ] `cd miniapp && npm run build` — muvaffaqiyatli
- [ ] `git log --oneline` — har task alohida commit
- [ ] Kalit yo'q holat: `LIS_SKINS_API_KEY`siz bot ishga tushganda xato logi yo'q (`syncMarketPrices` `no_key` ni jim o'tkazadi)
