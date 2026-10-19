// Steam inventarini sayt (Vercel) uchun BOT orqali olish.
//
// Muammo: steamcommunity.com inventar endpointi datacenter IP'larni (Vercel)
// 429 bilan bloklaydi — saytda "Steam hozir band" chiqardi. Bot esa
// foydalanuvchining kompyuterida (oddiy uy IP'si) ishlaydi va u yerdan
// so'rov ishlaydi. Shu sabab sayt Mongo'ga "so'rov" hujjati qoldiradi, bot
// uni bir necha soniyada ko'rib, inventarni Steam'dan oladi va "natija"
// hujjatiga yozadi, sayt esa natijani kutib turadi.
//
// Har steamId uchun ALOHIDA hujjatlar (`invReq_<id>`, `inv_<id>`) — umumiy
// navbat massivi bo'lganda sayt va bot bir-birining yozganini bosib
// yuborardi (db.js'dagi read/write "butun massiv" naqshi).
//
// Barcha I/O `deps` orqali beriladi — testda soxta ombor ishlatiladi.
const FRESH_MS = 3 * 60 * 1000;   // shu vaqtdan yosh natija qayta olinmaydi
const WAIT_MS = 22 * 1000;        // Vercel maxDuration (30s) ichida qolish uchun
const POLL_MS = 1000;
const STALE_REQ_MS = 60 * 1000;   // bot o'chiq paytida qolib ketgan so'rovlar

const reqId = (sid) => `invReq_${sid}`;
const resId = (sid) => `inv_${sid}`;

// Sayt tomoni.
// maxAgeMs — shu yoshdagi natija qayta olinmaydi (sotish so'rovini tekshirish
// sahifa ochilganda olingan inventarni qayta ishlatadi — Steam 429'ni kamaytiradi).
async function requestInventory(steamId64, { force = false, token = null, maxAgeMs = FRESH_MS } = {}, deps) {
    if (!steamId64) throw new Error("Steam hisobingiz ulanmagan");
    const started = deps.now();
    const cached = await deps.readDoc(resId(steamId64));
    if (!force && cached && !cached.error && started - cached.fetchedAt < maxAgeMs) return cached.items;

    // token — userning Steam access_token'i (trade-himoyadagi "16" bo'limi uchun);
    // so'rov hujjati bot uni olishi bilan o'chiriladi.
    await deps.writeDoc(reqId(steamId64), { at: started, force: !!force, token: token || null });
    while (deps.now() - started < WAIT_MS) {
        await deps.sleep(POLL_MS);
        const res = await deps.readDoc(resId(steamId64));
        if (res && res.fetchedAt >= started) {
            if (res.error) throw new Error(res.error);
            return res.items;
        }
    }
    throw new Error("Inventarni hozir yuklab bo'lmadi, keyinroq qayta urinib ko'ring");
}

// Bot tomoni — index.js'dagi setInterval chaqiradi.
async function processPendingRequests(deps) {
    const ids = await deps.listIds("invReq_");
    for (const id of ids) {
        const req = await deps.readDoc(id);
        await deps.removeDoc(id);
        if (!req || deps.now() - req.at > STALE_REQ_MS) continue;
        const steamId64 = id.slice("invReq_".length);
        let doc;
        try {
            const items = await deps.fetchInventory(steamId64, req.force, req.token || null);
            doc = { items, fetchedAt: deps.now(), error: null };
        } catch (err) {
            console.log(`INVENTAR ${steamId64}: ${err.message}`);
            doc = { items: [], fetchedAt: deps.now(), error: err.message };
        }
        await deps.writeDoc(resId(steamId64), doc);
    }
}

// Haqiqiy (Mongo) bog'liqliklar.
function mongoDeps() {
    const db = require("./database/db");
    return {
        now: () => Date.now(),
        sleep: (ms) => new Promise(r => setTimeout(r, ms)),
        readDoc: (id) => db.readDoc(id),
        writeDoc: (id, data) => db.writeDoc(id, data),
        removeDoc: (id) => db.removeDoc(id),
        listIds: (prefix) => db.listIds(prefix),
    };
}

module.exports = { requestInventory, processPendingRequests, mongoDeps };
