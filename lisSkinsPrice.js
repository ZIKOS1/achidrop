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
