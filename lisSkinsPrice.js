// Lis-Skins'dan CS2 skin narxini olish — Skin sotish (biz userdan sotib
// olamiz) narxini hisoblash uchun asos. Narxlar skin TURI (market_hash_name
// = nom + wear) bo'yicha, har nom uchun bitta so'rov (fetchOne izohiga qarang).
//
// Natija 1 soatga keshlanadi. Narx TOPILMAGAN (null) natija esa faqat 1
// daqiqaga — API javob shakli kutilganidan farq qilsa (yoki kalit endigina
// sozlansa), soat davomida "narx yo'q" deb qotib qolmasligi uchun.
//
// API javob shakli haqiqiy kalit bilan tasdiqlangan (2026-10-14): `data[]`,
// har qatorda `name` va `price` ($), `game=csgo` parametri majburiy.
// Kalit (LIS_SKINS_API_KEY) yo'q bo'lsa — hech qanday so'rov yuborilmaydi,
// barcha narxlar null (UI "Tez orada" ko'rsatadi).
const CACHE_MS = 60 * 60 * 1000;
const NULL_CACHE_MS = 60 * 1000;
const CONCURRENCY = 8;
const priceCache = new Map(); // marketHashName -> { usd, ts }

function isLisConfigured() {
    return !!process.env.LIS_SKINS_API_KEY;
}

function extractRows(body) {
    if (Array.isArray(body?.data)) return body.data;
    if (Array.isArray(body?.items)) return body.items;
    return [];
}
function rowName(row) {
    return row?.market_hash_name ?? row?.name ?? null;
}
// NaN `== null` tekshiruvidan JIMGINA o'tib ketib balansni buzishi mumkin —
// shu sabab bu yerda ANIQ tekshiriladi.
function rowPrice(row) {
    const n = Number(row?.price);
    return Number.isFinite(n) && n > 0 ? n : null;
}

// Har bir nom uchun ALOHIDA so'rov. Bitta so'rovga ko'p nom berilsa, API
// ularning hammasini narx bo'yicha bitta ro'yxatga aralashtiradi — minglab
// e'loni bor arzon skin (masalan case) birinchi sahifalarni to'ldirib, qimmat
// skinlar hech qachon topilmasdi (haqiqiy kalit bilan 10 sahifada faqat case
// narxi chiqqan). Bitta nom so'ralsa birinchi qator (lowest_price) — eng
// arzoni, shu sabab sahifalash kerak emas. Xato bo'lsa faqat shu nom null.
async function fetchOne(name, apiKey) {
    try {
        const params = new URLSearchParams();
        params.set("game", "csgo");
        params.set("sort_by", "lowest_price");
        params.append("names[]", name);
        const resp = await fetch(`https://api.lis-skins.com/v1/market/search?${params}`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const body = await resp.json();
        let min = null;
        for (const row of extractRows(body)) {
            if (rowName(row) !== name) continue;
            const usd = rowPrice(row);
            if (usd != null && (min == null || usd < min)) min = usd;
        }
        return min;
    } catch (err) {
        console.log(`LIS NARX XATO (${name}):`, err.message);
        return null;
    }
}

// names[] → Map(name -> usd|null). Kalit yo'q bo'lsa hammasi null.
async function fetchLisPricesUsd(names) {
    const unique = [...new Set(names.filter(Boolean))];
    const result = new Map();
    const apiKey = process.env.LIS_SKINS_API_KEY;
    if (!apiKey) {
        for (const n of unique) result.set(n, null);
        return result;
    }

    const missing = [];
    for (const n of unique) {
        const c = priceCache.get(n);
        if (c && Date.now() - c.ts < (c.usd == null ? NULL_CACHE_MS : CACHE_MS)) result.set(n, c.usd);
        else missing.push(n);
    }

    // CONCURRENCY tadan parallel — 100 xil skinli inventar ham bir necha
    // soniyada narxlanadi, API'ni esa bir zumda yuzlab so'rov bilan bosmaydi.
    for (let i = 0; i < missing.length; i += CONCURRENCY) {
        const chunk = missing.slice(i, i + CONCURRENCY);
        const prices = await Promise.all(chunk.map(n => fetchOne(n, apiKey)));
        for (const [j, n] of chunk.entries()) {
            const usd = prices[j];
            priceCache.set(n, { usd, ts: Date.now() });
            result.set(n, usd);
        }
    }
    return result;
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

// Userga to'lanadigan narx: Lis × kurs × (1 − marja%). Pastga yaxlitlanadi
// (biz hech qachon hisoblangandan ortiq to'lamaymiz).
function instantSellPriceSom(usd, rate, marginPercent) {
    if (!Number.isFinite(usd) || usd <= 0) return null;
    const som = Math.floor(usd * rate * (1 - marginPercent / 100));
    return som > 0 ? som : null;
}

// ── Pog'onali marja ──────────────────────────────────────────────────────────
// Skinning Lis narxiga ($) qarab turli marja: masalan 10 $ gacha 20%,
// 50 $ gacha 15%, qolgani 10%. Pog'ona: usd <= maxUsd bo'lgan birinchisi;
// oxirgisi har doim maxUsd:null (cheksiz). Saqlanmagan bo'lsa — eski bitta
// `instantSellMarginPercent` hamma narxga qo'llanadi (narxlar o'zgarmaydi).

// Admin kiritgan pog'onalarni tekshiradi va sonlarga o'tkazadi; noto'g'ri
// bo'lsa null.
function normalizeMarginTiers(tiers) {
    if (!Array.isArray(tiers) || !tiers.length) return null;
    const out = [];
    for (const [i, t] of tiers.entries()) {
        const last = i === tiers.length - 1;
        const rawMax = t?.maxUsd;
        const maxUsd = rawMax === null || rawMax === undefined || rawMax === "" ? null : Number(rawMax);
        const percent = Number(t?.percent);
        if (!Number.isFinite(percent) || percent < 0 || percent >= 100) return null;
        if (last ? maxUsd !== null : !(Number.isFinite(maxUsd) && maxUsd > 0)) return null;
        if (!last && out.length && maxUsd <= out[out.length - 1].maxUsd) return null;
        out.push({ maxUsd, percent });
    }
    return out;
}

function marginTiersFromSettings(s) {
    const saved = normalizeMarginTiers(s?.instantSellMarginTiers);
    if (saved) return saved;
    const single = Number.isFinite(s?.instantSellMarginPercent) ? s.instantSellMarginPercent : 12;
    return [{ maxUsd: null, percent: single }];
}
function getMarginTiers() { return marginTiersFromSettings(getSettings()); }

function marginPercentForUsd(usd, tiers) {
    const tier = tiers.find(t => t.maxUsd === null || usd <= t.maxUsd) || tiers[tiers.length - 1];
    return tier.percent;
}

// Skin sotish narxi Lis'dagi eng arzon narxning shu qismidan boshlanadi (egasi
// belgilagan). Admin paneldagi marja (0% bo'lishi mumkin) shundan keyin ayriladi.
const SELL_PRICE_RATIO = 0.89;

// Pog'ona Lis bozor narxi bo'yicha tanlanadi (admin shu narxni ko'radi).
function instantSellPriceSomTiered(usd, rate, tiers) {
    if (!Number.isFinite(usd) || usd <= 0) return null;
    return instantSellPriceSom(usd * SELL_PRICE_RATIO, rate, marginPercentForUsd(usd, tiers));
}

// names[] → Map(name -> priceSom|null)
async function getInstantSellPricesSom(names) {
    const usdMap = await fetchLisPricesUsd(names);
    const rate = getUsdToSomRate();
    const tiers = getMarginTiers();
    const out = new Map();
    for (const [name, usd] of usdMap) out.set(name, instantSellPriceSomTiered(usd, rate, tiers));
    return out;
}

async function getInstantSellPriceSom(marketHashName) {
    const m = await getInstantSellPricesSom([marketHashName]);
    return m.get(marketHashName) ?? null;
}

// Admin auto-list — Lis narxining o'zi (Market hozir o'chiq, lekin admin
// panel narx tavsiyasi shu funksiyani ishlatadi).
async function getListPriceSom(marketHashName) {
    const m = await fetchLisPricesUsd([marketHashName]);
    const usd = m.get(marketHashName);
    if (usd == null) return null;
    return Math.round(usd * getUsdToSomRate());
}

function _clearCache() { priceCache.clear(); }

module.exports = {
    isLisConfigured, fetchLisPricesUsd, instantSellPriceSom,
    getInstantSellPricesSom, getInstantSellPriceSom, getListPriceSom,
    getInstantSellMarginPercent, getUsdToSomRate, _clearCache,
    normalizeMarginTiers, marginTiersFromSettings, getMarginTiers, marginPercentForUsd, instantSellPriceSomTiered, SELL_PRICE_RATIO,
};
