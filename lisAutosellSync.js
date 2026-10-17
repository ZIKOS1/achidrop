// Lis avtosell narxlarini EGANING KOMPYUTERIDAN olib Mongo'ga yozadi
// (sabab: lisAutosell.js boshidagi izoh). Ishga tushirish: `node lisAutosellSync.js`
// yoki `lis-sync.bat`.
//
// Cookie har siklda `lis_autosell/.env` dan qayta o'qiladi — cookie
// yangilanganda dasturni qayta ishga tushirish shart emas.
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const fs = require("fs");
const path = require("path");
const db = require("./database/db");
const { STATE_ID, REQ_ID, envValue, fetchState } = require("./lisAutosell");

const COOKIE_ENV = path.join(__dirname, "lis_autosell", ".env");
const INTERVAL_MS = 3 * 60 * 1000;
const REQ_POLL_MS = 5 * 1000;

function log(...a) { console.log(new Date().toLocaleTimeString(), ...a); }

function readCreds() {
    const text = fs.existsSync(COOKIE_ENV) ? fs.readFileSync(COOKIE_ENV, "utf8") : "";
    return { cookie: envValue(text, "LIS_COOKIE"), sessionId: envValue(text, "LIS_SESSION_ID") };
}

let running = false;
async function syncOnce(reason) {
    if (running) return;
    running = true;
    const now = Date.now();
    try {
        const creds = readCreds();
        if (!creds.cookie) throw new Error("lis_autosell/.env da LIS_COOKIE yo'q");
        const state = await fetchState(creds);
        await db.writeDoc(STATE_ID, { ...state, fetchedAt: now, aliveAt: now, error: null, errorCode: null });
        log(`[${reason}] ${state.items.length} ta skin, sotiladigan ${state.sellableCount} ta, jami $${state.totalUsd}`);
    } catch (err) {
        // Oxirgi muvaffaqiyatli ro'yxat saqlanadi, ustiga xato belgilanadi.
        const prev = (await db.readDoc(STATE_ID).catch(() => null)) || {};
        await db.writeDoc(STATE_ID, { ...prev, aliveAt: now, error: err.message, errorCode: err.code || null }).catch(() => {});
        log(`[${reason}] XATO: ${err.message}`);
    } finally {
        running = false;
    }
}

async function main() {
    await db.connect();
    log("Lis avtosell sync ishga tushdi. To'xtatish: Ctrl+C");
    await db.removeDoc(REQ_ID).catch(() => {});
    await syncOnce("start");
    setInterval(() => syncOnce("timer"), INTERVAL_MS);
    setInterval(async () => {
        try {
            if (await db.takeDoc(REQ_ID)) await syncOnce("admin");
        } catch (err) { log("so'rov tekshirish xatosi:", err.message); }
    }, REQ_POLL_MS);
}

main().catch(err => { console.error(err); process.exit(1); });
