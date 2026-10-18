// BUFF163 buy order narxlari — Skin sotish narxining asosi (bo'lsa).
//
// Buy order — BUFF'da kimdir shu skinni hozir shu narxda olishga tayyor
// (pul oldindan bloklangan). 2026-10-18 tekshirilgan: Lis avtosell narxiga
// ±$0.02 teng, lekin Lis'dan farqli — ISTALGAN skinni nomi bo'yicha
// narxlash mumkin (Lis faqat cookie egasining inventarini narxlaydi).
//
// BUFF API faqat kirilgan brauzer cookie'si bilan javob beradi va tez
// so'rovlarni bloklaydi (~4 soniyada bitta). Shu sabab so'rovni EGANING
// KOMPYUTERIDAGI `buffSync.js` yuboradi (lisAutosell.js bilan bir xil naqsh):
//   - narxlar bitta hujjatda: `buff_prices` (faqat sync yozadi — poyga yo'q);
//   - sayt yangi/eskirgan nom uchun `buffReq_<hash>` qoldiradi (har nom
//     alohida hujjat, shuning uchun parallel so'rovlar bir-birini o'chirmaydi);
//   - sync so'rovlarni oladi, BUFF'dan narxlaydi, `buff_prices`ga yozadi.
// Narx hali kelmagan skin uchun sayt Lis formulasiga qaytadi.
const crypto = require("crypto");

const PRICES_ID = "buff_prices";
const REQ_PREFIX = "buffReq_";
const API = "https://buff.163.com/api/market/goods";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;   // bundan eski narx ishlatilmaydi
const REFRESH_AGE_MS = 60 * 60 * 1000;    // bundan eski narx qayta so'raladi
const DOC_CACHE_MS = 30 * 1000;

function reqId(name) {
    return REQ_PREFIX + crypto.createHash("sha1").update(name).digest("hex");
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

// BUFF qidiruv javobi → aynan shu nomli qator (sof funksiya). null — topilmadi.
function pickItem(body, name) {
    const items = Array.isArray(body?.data?.items) ? body.data.items : [];
    const it = items.find(i => i?.market_hash_name === name);
    if (!it) return null;
    const cny = num(it.buy_max_price);
    return { cny: cny > 0 ? cny : null, buyNum: num(it.buy_num) ?? 0, sellMinCny: num(it.sell_min_price) };
}

// Bitta nom uchun BUFF narxi. Kutilmagan javobda xato tashlanadi (sync shu
// nomni keyinroq qayta urinadi); "Login Required" — cookie eskirgan.
async function fetchBuffItem(name, cookie, fetchImpl = fetch) {
    const params = new URLSearchParams({ game: "csgo", page_num: "1", search: name });
    const r = await fetchImpl(`${API}?${params}`, {
        headers: { Cookie: cookie, Accept: "application/json", Referer: "https://buff.163.com/market/csgo", "User-Agent": USER_AGENT },
    });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { throw new Error(`BUFF HTTP ${r.status} (JSON emas)`); }
    if (body.code === "Login Required") {
        const e = new Error("BUFF cookie eskirgan — brauzerdan yangisini olib buff_sync/.env ga qo'ying");
        e.code = "cookie_expired";
        throw e;
    }
    if (body.code !== "OK") throw new Error(`BUFF: ${body.code || r.status}`);
    return pickItem(body, name);
}

// (sof funksiya) prices hujjati + nomlar → { usd: Map(name -> usd), need: [eskirgan/yo'q nomlar] }
function usdFromDoc(doc, names, now = Date.now()) {
    const usd = new Map();
    const need = [];
    const rate = num(doc?.cnyPerUsd);
    for (const name of names) {
        const p = doc?.items?.[name];
        const age = p?.ts ? now - p.ts : Infinity;
        if (p && age < MAX_AGE_MS && p.cny > 0 && rate > 0) {
            usd.set(name, Math.round((p.cny / rate) * 100) / 100);
        }
        if (!p || age >= REFRESH_AGE_MS) need.push(name);
    }
    return { usd, need };
}

let docCache = null; // { doc, ts }
const requested = new Map(); // name -> ts (bir nomni qayta-qayta so'ramaslik uchun)

// names[] → Map(name -> usd) faqat BUFF narxi bor nomlar uchun. Yo'q/eskirganlar
// uchun sync'ga so'rov qoldiriladi (javobni kutmaydi).
async function getBuffPricesUsd(names) {
    const db = require("./database/db");
    if (!docCache || Date.now() - docCache.ts > DOC_CACHE_MS) {
        docCache = { doc: await db.readDoc(PRICES_ID).catch(() => null), ts: Date.now() };
    }
    const { usd, need } = usdFromDoc(docCache.doc, [...new Set(names.filter(Boolean))]);
    const now = Date.now();
    const fresh = need.filter(n => !(now - (requested.get(n) || 0) < 10 * 60 * 1000));
    for (const n of fresh) requested.set(n, now);
    await Promise.all(fresh.map(n => db.writeDoc(reqId(n), { name: n, ts: now }).catch(() => {})));
    return usd;
}

function _clearCache() { docCache = null; requested.clear(); }

module.exports = {
    PRICES_ID, REQ_PREFIX, REFRESH_AGE_MS, reqId, pickItem, fetchBuffItem, usdFromDoc, getBuffPricesUsd, _clearCache,
};
