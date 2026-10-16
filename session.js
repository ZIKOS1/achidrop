const { read, write, refresh } = require("./database/db");
const { findUserById } = require("./userLifecycle");

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 kun
const COOKIE_NAME = "sid";

const { createTokenStore } = require("./tokenStore");
const store = createTokenStore("sess_", SESSION_TTL_MS);

// Websaytda (Steam orqali) muvaffaqiyatli autentifikatsiyadan keyin chaqiriladi —
// tasodifiy token yaratib, cookie orqali brauzerga beriladi (30 kunga).
async function createSession(userId) {
    return store.create({ userId });
}

// Yangi sessiyalar alohida hujjatlarda (tokenStore.js). Eski bitta `sessions`
// hujjatidagilar muddati tugaguncha o'qiladi — deploydan keyin hech kim chiqib ketmasin.
async function getSessionUser(token) {
    if (!token) return null;
    let entry = await store.get(token);
    if (!entry) {
        const raw = await refresh("sessions");
        const legacy = raw && !Array.isArray(raw) ? raw[token] : null;
        if (legacy && legacy.expiresAt > Date.now()) entry = legacy;
    }
    return entry ? findUserById(entry.userId) : null;
}

async function destroySession(token) {
    await store.destroy(token);
    const raw = read("sessions");
    if (token && raw && !Array.isArray(raw) && raw[token]) { delete raw[token]; write("sessions", raw); }
}

function parseCookie(req) {
    const header = req.headers.cookie;
    if (!header) return {};
    const out = {};
    for (const part of header.split(";")) {
        const eq = part.indexOf("=");
        if (eq === -1) continue;
        out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
    }
    return out;
}

function getSessionToken(req) {
    return parseCookie(req)[COOKIE_NAME] || null;
}

// Lokal (http://localhost) test paytida "Secure" cookie brauzer tomonidan
// umuman o'rnatilmaydi (HTTPS talab qiladi) — shu sabab faqat Vercel'da yoqiladi.
function cookieFlags() {
    return process.env.VERCEL ? "Secure; " : "";
}

function setSessionCookie(res, token) {
    const maxAge = Math.floor(SESSION_TTL_MS / 1000);
    res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; HttpOnly; ${cookieFlags()}SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}

function clearSessionCookie(res) {
    res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; ${cookieFlags()}SameSite=Lax; Path=/; Max-Age=0`);
}

module.exports = { createSession, getSessionUser, destroySession, getSessionToken, setSessionCookie, clearSessionCookie, parseCookie, cookieFlags };
