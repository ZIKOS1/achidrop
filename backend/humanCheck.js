// "Odammisiz?" tekshiruvi (admin Sozlamalar → `settings.humanCheckEnabled`).
// Cloudflare Turnstile: brauzer token oladi, server uni siteverify'da tekshiradi
// va 24 soatlik imzolangan `hv` cookie beradi. Env: TURNSTILE_SITE_KEY,
// TURNSTILE_SECRET. Kalitlar sozlanmagan bo'lsa tekshiruv o'chiq hisoblanadi.
const crypto = require("crypto");

const COOKIE_NAME = "hv";
const PASS_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function configured() {
    return !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET);
}

function sign(exp) {
    return crypto.createHmac("sha256", process.env.TURNSTILE_SECRET).update(`hv.${exp}`).digest("base64url");
}

// Cookie qiymati: "<exp>.<imzo>".
function makePass(now = Date.now()) {
    const exp = now + PASS_TTL_MS;
    return `${exp}.${sign(exp)}`;
}

function isValidPass(value, now = Date.now()) {
    if (!value || !configured()) return false;
    const [expStr, sig] = String(value).split(".");
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < now || !sig) return false;
    const expected = sign(exp);
    return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

async function verifyToken(token, ip, deps = { fetch }) {
    if (!token || !configured()) return false;
    try {
        const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: String(token), remoteip: ip || "" });
        const r = await deps.fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
        const json = await r.json();
        return json.success === true;
    } catch (err) {
        console.log("TURNSTILE ERROR:", err.message);
        return false;
    }
}

module.exports = { COOKIE_NAME, PASS_TTL_MS, configured, makePass, isValidPass, verifyToken };
