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
// `highest_order.price` — eng yuqori buy order. Fayl HAR so'rovda qaytadan
// yuklanadi (kesh yo'q, eski nusxa ishlatilmaydi) — yuklab bo'lmasa narx yo'q.
const FEED_URL = "https://prices.csgotrader.app/latest/buff163.json";

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

async function loadFeed(fetchImpl = fetch) {
    const r = await fetchImpl(FEED_URL, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!r.ok) throw new Error(`BUFF feed HTTP ${r.status}`);
    const feed = await r.json();
    if (!feed || typeof feed !== "object" || Object.keys(feed).length < 1000) throw new Error("BUFF feed bo'sh");
    return feed;
}

// names[] → Map(name -> usd) faqat BUFF buy order bor nomlar uchun.
async function getBuffPricesUsd(names, fetchImpl = fetch) {
    let feed;
    try { feed = await loadFeed(fetchImpl); }
    catch (err) { console.log("BUFF FEED XATO:", err.message); return new Map(); }
    return usdFromFeed(feed, [...new Set(names.filter(Boolean))]);
}

module.exports = { FEED_URL, usdFromFeed, getBuffPricesUsd };
