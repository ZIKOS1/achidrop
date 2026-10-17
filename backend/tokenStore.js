// Sessiya tokenlari — har token Mongo'da ALOHIDA hujjat (`<prefix><token>`).
// Avval barcha sessiyalar bitta hujjatda edi va har kirishda butunligicha qayta
// yozilardi: Vercel'ning turli nusxalari / VPS'dagi bot eski nusxasi bilan yozib,
// boshqalarning sessiyasini o'chirib yuborardi (foydalanuvchi o'zidan-o'zi
// chiqib ketardi). auth-steam.js'dagi bir martalik kodlar bilan bir xil naqsh.
const crypto = require("crypto");

const validToken = (t) => typeof t === "string" && /^[a-f0-9]{64}$/.test(t);

function mongoDeps() {
    const db = require("./database/db");
    return { now: () => Date.now(), random: Math.random, readDoc: db.readDoc, writeDoc: db.writeDoc, removeDoc: db.removeDoc, listIds: db.listIds };
}

function createTokenStore(prefix, ttlMs, deps) {
    const d = () => deps || (deps = mongoDeps());

    async function forEachLive(fn) {
        for (const id of await d().listIds(prefix)) {
            const s = await d().readDoc(id);
            if (!s || s.expiresAt <= d().now()) { await d().removeDoc(id); continue; }
            await fn(id, s);
        }
    }

    return {
        async create(data) {
            // Tashlab ketilgan eski sessiyalarni ba'zan tozalaymiz (har safar emas — ular ko'p).
            if (d().random() < 0.02) await forEachLive(async () => {});
            const token = crypto.randomBytes(32).toString("hex");
            await d().writeDoc(prefix + token, { ...data, expiresAt: d().now() + ttlMs });
            return token;
        },
        async get(token) {
            if (!validToken(token)) return null;
            const s = await d().readDoc(prefix + token);
            if (!s) return null;
            if (s.expiresAt <= d().now()) { await d().removeDoc(prefix + token); return null; }
            return s;
        },
        async destroy(token) {
            if (validToken(token)) await d().removeDoc(prefix + token);
        },
        async destroyWhere(pred) {
            await forEachLive(async (id, s) => { if (pred(s)) await d().removeDoc(id); });
        },
    };
}

module.exports = { createTokenStore };
