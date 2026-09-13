const crypto = require("crypto");
const { read, write, refresh } = require("./database/db");
const { findUserById } = require("./userLifecycle");

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 kun
const COOKIE_NAME = "sid";

function getSessions() {
    const raw = read("sessions");
    return Array.isArray(raw) ? {} : raw;
}

function cleanupExpired(sessions) {
    const now = Date.now();
    for (const token of Object.keys(sessions)) {
        if (sessions[token].expiresAt <= now) delete sessions[token];
    }
}

// Websaytda (Telegram Login Widget yoki Steam orqali) muvaffaqiyatli
// autentifikatsiyadan keyin chaqiriladi — tasodifiy token yaratib, cookie
// orqali brauzerga beriladi (30 kunga).
function createSession(userId) {
    const sessions = getSessions();
    cleanupExpired(sessions);
    const token = crypto.randomBytes(32).toString("hex");
    sessions[token] = { userId, expiresAt: Date.now() + SESSION_TTL_MS };
    write("sessions", sessions);
    return token;
}

// Vercel serverless'da har so'rov turli instance'ga tushishi mumkin — shu
// sabab Mongo'dan qayta o'qiladi (auth-steam.js'dagi steamAuthPending bilan
// bir xil naqsh).
async function getSessionUser(token) {
    if (!token) return null;
    const raw = await refresh("sessions");
    const sessions = Array.isArray(raw) ? {} : raw;
    cleanupExpired(sessions);
    const entry = sessions[token];
    if (!entry) return null;
    return findUserById(entry.userId);
}

function destroySession(token) {
    if (!token) return;
    const sessions = getSessions();
    delete sessions[token];
    write("sessions", sessions);
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
