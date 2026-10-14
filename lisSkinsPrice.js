// Lis-Skins'dan CS2 skin narxini olish — Skin sotish (biz userdan sotib
// olamiz) narxini hisoblash uchun asos. Narxlar skin TURI (market_hash_name
// = nom + wear) bo'yicha, BITTA so'rovda ko'p nom uchun (chunk'lab) olinadi.
//
// Natija 1 soatga keshlanadi. Narx TOPILMAGAN (null) natija esa faqat 1
// daqiqaga — API javob shakli kutilganidan farq qilsa (yoki kalit endigina
// sozlansa), soat davomida "narx yo'q" deb qotib qolmasligi uchun.
//
// ⚠ API javob shakli hali TASDIQLANMAGAN (kalit olinmagan). Kalit kelgach
// `extractRows`/`rowName`/`rowPrice` haqiqiy javobga moslab tekshirilsin.
// Kalit (LIS_SKINS_API_KEY) yo'q bo'lsa — hech qanday so'rov yuborilmaydi,
// barcha narxlar null (UI "Tez orada" ko'rsatadi).
const CACHE_MS = 60 * 60 * 1000;
const NULL_CACHE_MS = 60 * 1000;
const CHUNK = 50;
const MAX_PAGES = 10;
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

async function fetchChunk(names, apiKey) {
    const found = new Map(); // name -> min usd
    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams();
        params.set("game", "csgo");
        params.set("sort_by", "lowest_price");
        for (const n of names) params.append("names[]", n);
        if (cursor) params.set("cursor", cursor);
        const resp = await fetch(`https://api.lis-skins.com/v1/market/search?${params}`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        });
        if (!resp.ok) throw new Error(`Lis-Skins API xato (HTTP ${resp.status})`);
        const body = await resp.json();
        for (const row of extractRows(body)) {
            const name = rowName(row);
            const usd = rowPrice(row);
            if (!name || usd == null) continue;
            const prev = found.get(name);
            if (prev == null || usd < prev) found.set(name, usd);
        }
        cursor = body?.meta?.next_cursor || null;
        // Hamma nomning narxi topilgan bo'lsa — keyingi sahifa kerak emas
        // (lowest_price bo'yicha tartiblangan, birinchi uchragani eng arzoni).
        if (!cursor || names.every(n => found.has(n))) break;
    }
    return found;
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

    for (let i = 0; i < missing.length; i += CHUNK) {
        const chunk = missing.slice(i, i + CHUNK);
        const found = await fetchChunk(chunk, apiKey);
        for (const n of chunk) {
            const usd = found.get(n) ?? null;
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

// names[] → Map(name -> priceSom|null)
async function getInstantSellPricesSom(names) {
    const usdMap = await fetchLisPricesUsd(names);
    const rate = getUsdToSomRate();
    const margin = getInstantSellMarginPercent();
    const out = new Map();
    for (const [name, usd] of usdMap) out.set(name, instantSellPriceSom(usd, rate, margin));
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
};
