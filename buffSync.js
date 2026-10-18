// BUFF buy order narxlarini EGANING KOMPYUTERIDAN olib Mongo'ga yozadi
// (sabab: backend/buffPrice.js boshidagi izoh). Ishga tushirish:
// `node buffSync.js` yoki `buff-sync.bat`.
//
// Navbat: avval sayt so'ragan yangi nomlar (`buffReq_*`), so'ng eng eski
// narx (1 soatdan eski bo'lsa). BUFF tez so'rovlarni bloklagani uchun har
// so'rov orasida PACE_MS kutiladi.
//
// Cookie har so'rovda `buff_sync/.env` dan qayta o'qiladi — cookie
// yangilanganda dasturni qayta ishga tushirish shart emas.
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const fs = require("fs");
const path = require("path");
const db = require("./backend/database/db");
const { envValue } = require("./backend/lisAutosell");
const { PRICES_ID, REQ_PREFIX, REFRESH_AGE_MS, reqId, fetchBuffItem } = require("./backend/buffPrice");

const COOKIE_ENV = path.join(__dirname, "buff_sync", ".env");
const PACE_MS = 4000;
const IDLE_MS = 5000;
const FAIL_RETRY_MS = 15 * 60 * 1000;
const RATE_REFRESH_MS = 6 * 60 * 60 * 1000;
const FALLBACK_CNY_PER_USD = 7.1;

function log(...a) { console.log(new Date().toLocaleTimeString(), ...a); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function readCookie() {
    const text = fs.existsSync(COOKIE_ENV) ? fs.readFileSync(COOKIE_ENV, "utf8") : "";
    return envValue(text, "BUFF_COOKIE");
}

async function fetchCnyPerUsd() {
    try {
        const r = await fetch("https://open.er-api.com/v6/latest/USD");
        const rate = Number((await r.json())?.rates?.CNY);
        if (rate > 0) return rate;
    } catch (err) { log("kurs xatosi:", err.message); }
    return null;
}

const failedAt = new Map(); // name -> ts (topilmagan/xato nomlar tez-tez qayta so'ralmasin)

async function nextName(doc) {
    const ids = await db.listIds(REQ_PREFIX);
    for (const id of ids) {
        const req = await db.readDoc(id).catch(() => null);
        if (!req?.name) { await db.removeDoc(id).catch(() => {}); continue; }
        const p = doc.items[req.name];
        if (p && Date.now() - p.ts < REFRESH_AGE_MS) { await db.removeDoc(id).catch(() => {}); continue; }
        if (Date.now() - (failedAt.get(req.name) || 0) < FAIL_RETRY_MS) continue;
        return req.name;
    }
    let oldest = null;
    for (const [name, p] of Object.entries(doc.items)) {
        if (Date.now() - p.ts < REFRESH_AGE_MS) continue;
        if (Date.now() - (failedAt.get(name) || 0) < FAIL_RETRY_MS) continue;
        if (!oldest || p.ts < doc.items[oldest].ts) oldest = name;
    }
    return oldest;
}

async function main() {
    await db.connect();
    log("BUFF sync ishga tushdi. To'xtatish: Ctrl+C");
    const doc = (await db.readDoc(PRICES_ID).catch(() => null)) || {};
    doc.items = doc.items || {};
    let rateAt = 0;

    for (;;) {
        if (Date.now() - rateAt > RATE_REFRESH_MS) {
            doc.cnyPerUsd = (await fetchCnyPerUsd()) || doc.cnyPerUsd || FALLBACK_CNY_PER_USD;
            rateAt = Date.now();
            log(`kurs: 1 $ = ${doc.cnyPerUsd} ¥`);
        }
        const cookie = readCookie();
        if (!cookie) { log("buff_sync/.env da BUFF_COOKIE yo'q"); await sleep(30_000); continue; }

        const name = await nextName(doc).catch(err => { log("navbat xatosi:", err.message); return null; });
        if (!name) { await sleep(IDLE_MS); continue; }

        try {
            const it = await fetchBuffItem(name, cookie);
            const prev = doc.items[name];
            doc.items[name] = { cny: it?.cny ?? null, buyNum: it?.buyNum ?? 0, sellMinCny: it?.sellMinCny ?? null, ts: Date.now() };
            if (!it) failedAt.set(name, Date.now());
            doc.updatedAt = Date.now();
            doc.error = null;
            await db.writeDoc(PRICES_ID, doc);
            await db.removeDoc(reqId(name)).catch(() => {});
            log(`${name}: ${it?.cny != null ? `¥${it.cny} (${it.buyNum} ta buy order)` : "BUFF'da buy order yo'q"}${prev?.cny != null ? ` [oldin ¥${prev.cny}]` : ""}`);
        } catch (err) {
            log(`${name}: XATO ${err.message}`);
            if (err.code === "cookie_expired") {
                doc.error = err.message;
                await db.writeDoc(PRICES_ID, doc).catch(() => {});
                await sleep(60_000);
                continue;
            }
            failedAt.set(name, Date.now());
        }
        await sleep(PACE_MS);
    }
}

main().catch(err => { console.error(err); process.exit(1); });
