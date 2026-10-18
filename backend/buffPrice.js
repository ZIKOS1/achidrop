// BUFF163 buy order narxlari — Skin sotish narxining asosi (bo'lsa).
//
// Buy order — BUFF'da kimdir shu skinni hozir shu narxda olishga tayyor
// (pul oldindan bloklangan). 2026-10-18 tekshirilgan: Lis avtosell narxiga
// ±$0.02 teng, lekin Lis'dan farqli — ISTALGAN skinni nomi bo'yicha
// narxlash mumkin (Lis faqat cookie egasining inventarini narxlaydi).
//
// Manba — csgotrader.app'ning ochiq BUFF163 narx fayli (cookie kerak emas,
// USD'da, bir necha soatda yangilanadi, ~47 ming nom):
//   { "<market_hash_name>": { starting_at: { price }, highest_order: { price } } }
// `highest_order.price` — eng yuqori buy order. Fayl xotirada FEED_TTL_MS
// saqlanadi; yuklab bo'lmasa eski nusxa STALE_MAX_MS gacha ishlatiladi,
// undan keyin sayt Lis formulasiga qaytadi.
const FEED_URL = "https://prices.csgotrader.app/latest/buff163.json";
const FEED_TTL_MS = 60 * 60 * 1000;
const STALE_MAX_MS = 24 * 60 * 60 * 1000;
const FAIL_RETRY_MS = 5 * 60 * 1000;

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

// (sof funksiya) feed + nomlar → Map(name -> usd) faqat buy order bor nomlar uchun.
function usdFromFeed(feed, names) {
    const usd = new Map();
    for (const name of names) {
        const p = num(feed?.[name]?.highest_order?.price);
        if (p > 0) usd.set(name, Math.round(p * 100) / 100);
    }
    return usd;
}

let cache = null;   // { feed, ts }
let failedAt = 0;
let loading = null; // parallel so'rovlar bitta yuklashni kutadi

async function loadFeed(fetchImpl = fetch) {
    const r = await fetchImpl(FEED_URL, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`BUFF feed HTTP ${r.status}`);
    const feed = await r.json();
    if (!feed || typeof feed !== "object" || Object.keys(feed).length < 1000) throw new Error("BUFF feed bo'sh");
    return feed;
}

async function getFeed(fetchImpl = fetch, now = Date.now()) {
    const fresh = cache && now - cache.ts < FEED_TTL_MS;
    if (!fresh && now - failedAt > FAIL_RETRY_MS) {
        loading = loading || loadFeed(fetchImpl)
            .then(feed => { cache = { feed, ts: Date.now() }; })
            .catch(err => { failedAt = Date.now(); console.log("BUFF FEED XATO:", err.message); })
            .finally(() => { loading = null; });
        await loading;
    }
    return cache && Date.now() - cache.ts < STALE_MAX_MS ? cache.feed : null;
}

// names[] → Map(name -> usd) faqat BUFF buy order bor nomlar uchun.
async function getBuffPricesUsd(names, fetchImpl = fetch) {
    const feed = await getFeed(fetchImpl);
    return feed ? usdFromFeed(feed, [...new Set(names.filter(Boolean))]) : new Map();
}

function _clearCache() { cache = null; failedAt = 0; loading = null; }

module.exports = { FEED_URL, usdFromFeed, getBuffPricesUsd, _clearCache };
