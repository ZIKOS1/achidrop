const crypto     = require("crypto");
const SteamAuth   = require("node-steam-openid");
const { read, write, refresh } = require("./database/db");

const PENDING_TTL_MS = 10 * 60_000; // 10 daqiqa

// /start va /callback so'rovlari Vercel serverless'da turli instance'larga tushishi
// mumkin — shu instance hali ko'rmagan nonce'ni topish uchun Mongo'dan qayta o'qiladi.
async function getPendingFresh() {
    const raw = await refresh("steamAuthPending");
    return Array.isArray(raw) ? {} : raw;
}

function getPending() {
    const raw = read("steamAuthPending");
    return Array.isArray(raw) ? {} : raw;
}

function cleanupExpired(pending) {
    const now = Date.now();
    for (const nonce of Object.keys(pending)) {
        if (pending[nonce].expiresAt <= now) delete pending[nonce];
    }
}

// Mini-app'dan (auth bilan) chaqirilganda — kim so'raganini (tgId) va nima uchun
// (admin o'ziga SteamID64 yozadimi, yoki bidchi o'z akkauntini bog'laydimi) eslab
// qolish uchun. Vercel serverless'da /start va /callback so'rovlari turli
// instance'larga tushishi mumkin, shu sabab in-memory Map emas, mavjud
// Mongo-backed keshda saqlanadi (settings/auctions bilan bir xil naqsh).
function createPendingAuth(tgId, purpose) {
    const pending = getPending();
    cleanupExpired(pending);
    const nonce = crypto.randomBytes(16).toString("hex");
    pending[nonce] = { tgId, purpose, expiresAt: Date.now() + PENDING_TTL_MS };
    write("steamAuthPending", pending);
    return nonce;
}

// /start bosqichida — hali o'chirilmaydi, chunki keyin /callback ham shu nonce'ni
// so'raydi (Steam login jarayoni davomida bir necha redirect bo'lishi mumkin).
async function peekPendingAuth(nonce) {
    if (!nonce) return null;
    const pending = await getPendingFresh();
    cleanupExpired(pending);
    return pending[nonce] || null;
}

// /callback bosqichida — bir martalik ishlatiladi, keyin o'chiriladi.
async function consumePendingAuth(nonce) {
    if (!nonce) return null;
    const pending = await getPendingFresh();
    cleanupExpired(pending);
    const entry = pending[nonce];
    if (!entry) return null;
    delete pending[nonce];
    write("steamAuthPending", pending);
    return entry;
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
