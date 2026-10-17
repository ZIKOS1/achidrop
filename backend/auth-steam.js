const crypto     = require("crypto");
const SteamAuth   = require("node-steam-openid");

const PENDING_TTL_MS = 10 * 60_000; // 10 daqiqa

// Har kod (nonce) Mongo'da ALOHIDA hujjat: `steamAuth_<nonce>`. Avval hammasi bitta
// `steamAuthPending` hujjatida edi va har yaratishda butunligicha qayta yozilardi —
// Vercel'ning turli nusxalari va VPS'dagi bot eski nusxasi bilan yozib, boshqa
// birovning hozirgina yaratgan kodini o'chirib yuborardi ("Sessiya muddati o'tgan
// yoki allaqachon ishlatilgan"). Ishlatish atomik (takeDoc = findOneAndDelete).
const PREFIX = "steamAuth_";
const docId = (nonce) => PREFIX + nonce;
const validNonce = (nonce) => typeof nonce === "string" && /^[a-f0-9]{32}$/.test(nonce);

function mongoDeps() {
    const db = require("./database/db");
    return { now: () => Date.now(), readDoc: db.readDoc, writeDoc: db.writeDoc, takeDoc: db.takeDoc, removeDoc: db.removeDoc, listIds: db.listIds };
}

// Tashlab ketilgan (Steam'dan qaytilmagan) kodlarni tozalash.
async function removeExpired(deps) {
    for (const id of await deps.listIds(PREFIX)) {
        const entry = await deps.readDoc(id);
        if (!entry || entry.expiresAt <= deps.now()) await deps.removeDoc(id);
    }
}

// Kim so'raganini (tgId) va nima uchun (admin / bidchi / websayt) eslab qoladi.
async function createPendingAuth(tgId, purpose, deps = mongoDeps()) {
    await removeExpired(deps);
    const nonce = crypto.randomBytes(16).toString("hex");
    await deps.writeDoc(docId(nonce), { tgId, purpose, expiresAt: deps.now() + PENDING_TTL_MS });
    return nonce;
}

// /start bosqichida — hali o'chirilmaydi, keyin /callback ham shu kodni so'raydi.
async function peekPendingAuth(nonce, deps = mongoDeps()) {
    if (!validNonce(nonce)) return null;
    const entry = await deps.readDoc(docId(nonce));
    return entry && entry.expiresAt > deps.now() ? entry : null;
}

// /callback bosqichida — bir martalik: o'qish va o'chirish bitta amal.
async function consumePendingAuth(nonce, deps = mongoDeps()) {
    if (!validNonce(nonce)) return null;
    const entry = await deps.takeDoc(docId(nonce));
    return entry && entry.expiresAt > deps.now() ? entry : null;
}

function getSteamAuth(returnUrl) {
    return new SteamAuth({
        realm:     process.env.WEBAPP_URL,
        returnUrl,
        apiKey:    process.env.STEAM_API_KEY,
    });
}

function steamConnectedHtml(botUsername) {
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Steam ulandi</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:sans-serif;background:#1c1c1e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px}
a{display:inline-block;margin-top:20px;background:#0088cc;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600}</style>
</head><body>
<div style="font-size:48px">✅</div>
<h2>Steam akkaunt ulandi!</h2>
<p>Endi botga qaytishingiz mumkin.</p>
${botUsername ? `<a href="https://t.me/${botUsername}">🔙 Botga qaytish</a>` : ""}
</body></html>`;
}

module.exports = { createPendingAuth, peekPendingAuth, consumePendingAuth, getSteamAuth, steamConnectedHtml };
