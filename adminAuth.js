// Admin Panel (miniapp/src/admin) uchun — oddiy foydalanuvchi sessiyasi
// (session.js, Telegram/Steam orqali) bilan hech qanday aloqasi yo'q, alohida
// login/parol bilan kirish. Bir xil naqsh (Mongo-backed token, session.js
// bilan bir xil), lekin alohida cookie nomi va Mongo store'i — ikkalasi
// mustaqil, biri ikkinchisini bekor qilmaydi/almashtirmaydi.
//
// Admin akkauntlari endi .env'dagi bitta login/parolga bog'liq emas — Mongo'da
// "adminAccounts" ro'yxatida saqlanadi, har biri "ceo" yoki "admin" rolига ega.
// Faqat "ceo" boshqa admin akkauntlarini qo'shishi/o'chirishi/o'zgartirishi
// mumkin. .env'dagi ADMIN_PANEL_USER/ADMIN_PANEL_PASS_HASH faqat BIR MARTA,
// ro'yxat bo'sh bo'lganda, birinchi "ceo" akkauntini yaratish uchun ishlatiladi
// (shu bilan avval ishlagan login/parol o'zgarishsiz davom etadi).
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { read, write, refresh } = require("./database/db");
const { parseCookie, cookieFlags } = require("./session");

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 soat — user sessiyasidan (30 kun) qisqaroq
const COOKIE_NAME = "admin_sid";

function getSessions() {
    const raw = read("adminSessions");
    return Array.isArray(raw) ? {} : raw;
}

function cleanupExpiredSessions(sessions) {
    const now = Date.now();
    for (const token of Object.keys(sessions)) {
        if (sessions[token].expiresAt <= now) delete sessions[token];
    }
}

function createAdminSession(accountId, role) {
    const sessions = getSessions();
    cleanupExpiredSessions(sessions);
    const token = crypto.randomBytes(32).toString("hex");
    sessions[token] = { accountId, role, expiresAt: Date.now() + SESSION_TTL_MS };
    write("adminSessions", sessions);
    return token;
}

// Vercel serverless'da har so'rov turli instance'ga tushishi mumkin — session.js
// bilan bir xil sabab uchun Mongo'dan qayta o'qiladi. To'liq sessiya obyektini
// ({accountId, role}) qaytaradi — requireAdminPanel shundan req.adminSession'ni
// to'ldiradi, requireCeo esa role'ni tekshiradi.
async function getAdminSession(token) {
    if (!token) return null;
    const raw = await refresh("adminSessions");
    const sessions = Array.isArray(raw) ? {} : raw;
    cleanupExpiredSessions(sessions);
    return sessions[token] || null;
}

function destroyAdminSession(token) {
    if (!token) return;
    const sessions = getSessions();
    delete sessions[token];
    write("adminSessions", sessions);
}

function getAdminSessionToken(req) {
    return parseCookie(req)[COOKIE_NAME] || null;
}

function setAdminSessionCookie(res, token) {
    const maxAge = Math.floor(SESSION_TTL_MS / 1000);
    res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; HttpOnly; ${cookieFlags()}SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}

function clearAdminSessionCookie(res) {
    res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; ${cookieFlags()}SameSite=Lax; Path=/; Max-Age=0`);
}

// ── Admin akkauntlari (Mongo "adminAccounts") ──────────────────────────────

// Vercel serverless'da sovuq instance hali "adminAccounts"ni ko'rmagan bo'lishi
// mumkin — "oxirgi CEO"ni o'chirib qo'yish kabi xavfli tekshiruvlar va ro'yxat
// har doim Mongo'dan yangilab olinishi kerak (oddiy `read()` yetarli emas).
async function getAccountsFresh() {
    const raw = await refresh("adminAccounts");
    return Array.isArray(raw) ? raw : [];
}

// Ro'yxat hali bo'sh bo'lsa, .env'dagi ADMIN_PANEL_USER/ADMIN_PANEL_PASS_HASH'dan
// birinchi "ceo" akkauntini bir martalik yaratadi — shu orqali avval sozlangan
// login/parol o'zgarishsiz ishlayveradi, endi shunchaki DB-backed akkauntga aylanadi.
async function ensureSeedAccount() {
    const raw = await refresh("adminAccounts");
    const list = Array.isArray(raw) ? raw : [];
    if (list.length > 0) return list;

    const seedUser = process.env.ADMIN_PANEL_USER;
    const seedHash = process.env.ADMIN_PANEL_PASS_HASH;
    if (!seedUser || !seedHash) return list;

    const seeded = [{
        id: crypto.randomBytes(8).toString("hex"),
        username: seedUser,
        passwordHash: seedHash,
        role: "ceo",
        active: true,
        createdAt: new Date().toISOString(),
    }];
    write("adminAccounts", seeded);
    return seeded;
}

// bcrypt.compare vaqti hash uzunligiga bog'liq — login mavjud bo'lmaganda
// bu qadam butunlay o'tkazib yuborilsa, javob deyarli darhol qaytadi, mavjud
// login uchun esa sezilarli sekinroq (bcrypt hisoblashi tufayli). Shu farq
// orqali tashqi kuzatuvchi qaysi login'lar mavjudligini bilib olishi mumkin
// (timing side-channel) — shu sabab login topilmasa ham STATIK hash bilan
// bcrypt.compare bajariladi, javob vaqti har doim bir xil bo'lishi uchun.
const DUMMY_HASH = "$2a$10$7iC/zJj0BJiZ5cLHU4oBHu57Y.GEMxRJNHgOkm47RxDmZKXg/4AXa";

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 daqiqa

// Ketma-ket LOCKOUT_THRESHOLD marta xato parol kiritilsa, akkaunt vaqtincha
// (LOCKOUT_MS) qulflanadi — bu C1 (brute-force himoyasi yo'qligi) uchun
// asosiy tuzatish, chunki /api/admin/login'ga hech qanday rate-limit qadam
// ostida ham parolni cheksiz urinib ko'rish endi ishlamaydi.
async function verifyAdminCredentials(username, password) {
    if (!username || !password) return null;
    const accounts = await ensureSeedAccount();
    const account = accounts.find(a => a.username === username && a.active !== false);

    if (account?.lockedUntil && account.lockedUntil > Date.now()) {
        await bcrypt.compare(password, DUMMY_HASH); // javob vaqti bir xil qolishi uchun
        return { locked: true, retryAfterMs: account.lockedUntil - Date.now() };
    }

    const ok = await bcrypt.compare(password, account?.passwordHash || DUMMY_HASH);
    if (!account) return null;

    if (ok) {
        if (account.failedAttempts || account.lockedUntil) {
            account.failedAttempts = 0;
            account.lockedUntil = null;
            write("adminAccounts", accounts);
        }
        return account;
    }

    account.failedAttempts = (account.failedAttempts || 0) + 1;
    if (account.failedAttempts >= LOCKOUT_THRESHOLD) account.lockedUntil = Date.now() + LOCKOUT_MS;
    write("adminAccounts", accounts);
    return null;
}

// Admin panel'ga faqat "ceo"/"admin" kirishi mumkin, lekin ular ham kuchli
// parol tanlashi shart — aks holda C1 (brute-force) himoyasi ham foyda
// bermaydi. Kamida 10 belgi, kamida bitta harf va bitta raqam.
function passwordPolicyError(password) {
    if (!password || password.length < 10) return "Parol kamida 10 belgidan iborat bo'lishi kerak";
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return "Parolda kamida bitta harf va bitta raqam bo'lishi kerak";
    return null;
}

async function listAdminAccounts() {
    const accounts = await getAccountsFresh();
    return accounts.map(({ passwordHash, ...rest }) => rest);
}

async function createAdminAccount({ username, password, role }) {
    const accounts = await ensureSeedAccount();
    if (!username || !password) return { error: "Login va parol kerak" };
    const pwErr = passwordPolicyError(password);
    if (pwErr) return { error: pwErr };
    if (accounts.some(a => a.username === username)) return { error: "Bu login allaqachon band" };
    const account = {
        id: crypto.randomBytes(8).toString("hex"),
        username,
        passwordHash: await bcrypt.hash(password, 12),
        role: role === "ceo" ? "ceo" : "admin",
        active: true,
        createdAt: new Date().toISOString(),
    };
    accounts.push(account);
    write("adminAccounts", accounts);
    const { passwordHash, ...safe } = account;
    return { account: safe };
}

async function setAdminAccountActive(id, active) {
    const accounts = await ensureSeedAccount();
    const account = accounts.find(a => a.id === id);
    if (!account) return { error: "Akkaunt topilmadi" };
    account.active = !!active;
    write("adminAccounts", accounts);
    return { ok: true };
}

async function deleteAdminAccount(id) {
    const accounts = await ensureSeedAccount();
    const idx = accounts.findIndex(a => a.id === id);
    if (idx === -1) return { error: "Akkaunt topilmadi" };
    accounts.splice(idx, 1);
    write("adminAccounts", accounts);
    return { ok: true };
}

async function changeAdminAccountPassword(id, newPassword) {
    const accounts = await ensureSeedAccount();
    const account = accounts.find(a => a.id === id);
    if (!account) return { error: "Akkaunt topilmadi" };
    const pwErr = passwordPolicyError(newPassword);
    if (pwErr) return { error: pwErr };
    account.passwordHash = await bcrypt.hash(newPassword, 12);
    write("adminAccounts", accounts);
    return { ok: true };
}

function countActiveCeos(accounts) {
    return accounts.filter(a => a.role === "ceo" && a.active !== false).length;
}

module.exports = {
    createAdminSession, getAdminSession, destroyAdminSession,
    getAdminSessionToken, setAdminSessionCookie, clearAdminSessionCookie,
    verifyAdminCredentials, passwordPolicyError,
    listAdminAccounts, createAdminAccount, setAdminAccountActive,
    deleteAdminAccount, changeAdminAccountPassword,
    getAccountsFresh, countActiveCeos,
};
