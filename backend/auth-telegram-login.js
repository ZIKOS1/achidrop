const crypto = require("crypto");
const { read, write, refresh } = require("./database/db");

const PENDING_TTL_MS = 5 * 60_000; // 5 daqiqa
const MAX_CODE_ATTEMPTS = 5;

// Steam login (auth-steam.js) bilan bir xil naqsh: bot (alohida jarayon) va
// mini-app API (Vercel) turli process'lar bo'lgani uchun har doim Mongo'dan
// qayta o'qib/yozamiz, in-memory keshga ishonmaymiz.
async function getPendingFresh() {
    const raw = await refresh("telegramLoginPending");
    return Array.isArray(raw) ? {} : raw;
}

function cleanupExpired(pending) {
    const now = Date.now();
    for (const nonce of Object.keys(pending)) {
        if (pending[nonce].expiresAt <= now) delete pending[nonce];
    }
}

// Sayt "Telegram orqali kirish"ni bosganda chaqiradi — botga o'tish uchun
// noyob nonce yaratadi, hali kodi yo'q holatda saqlaydi.
async function createPendingLogin() {
    const pending = await getPendingFresh();
    cleanupExpired(pending);
    const nonce = crypto.randomBytes(12).toString("hex");
    const expiresAt = Date.now() + PENDING_TTL_MS;
    pending[nonce] = { code: null, tgFrom: null, expiresAt };
    write("telegramLoginPending", pending);
    return { nonce, expiresAt };
}

// Bot /start?weblogin_<nonce> qabul qilganda chaqiradi — 6 xonali kod
// generatsiya qilib, foydalanuvchi ma'lumotini (from) shu nonce'ga bog'laydi.
async function attachCodeToPending(nonce, from) {
    const pending = await getPendingFresh();
    cleanupExpired(pending);
    const entry = pending[nonce];
    if (!entry) return null;
    const code = String(crypto.randomInt(100000, 1000000));
    entry.code = code;
    entry.tgFrom = { id: from.id, first_name: from.first_name, last_name: from.last_name, username: from.username };
    entry.expiresAt = Date.now() + PENDING_TTL_MS;
    write("telegramLoginPending", pending);
    return code;
}

// Sayt kodni tasdiqlash uchun chaqiradi — mos kelsa foydalanuvchi ma'lumotini
// qaytaradi va bir martalik ishlatilgani uchun yozuvni o'chiradi.
async function consumePendingLogin(nonce, code) {
    if (!nonce || !code) return null;
    const pending = await getPendingFresh();
    cleanupExpired(pending);
    const entry = pending[nonce];
    if (!entry || !entry.code || !entry.tgFrom) return null;
    // Noto'g'ri kod — urinish sanaladi; MAX_CODE_ATTEMPTS dan keyin nonce
    // butunlay o'chadi (6 xonali kodni ko'p IP'dan terib topib bo'lmasin).
    if (entry.code !== String(code).trim()) {
        entry.attempts = (entry.attempts || 0) + 1;
        if (entry.attempts >= MAX_CODE_ATTEMPTS) delete pending[nonce];
        write("telegramLoginPending", pending);
        return null;
    }
    delete pending[nonce];
    write("telegramLoginPending", pending);
    return entry.tgFrom;
}

module.exports = { createPendingLogin, attachCodeToPending, consumePendingLogin };
