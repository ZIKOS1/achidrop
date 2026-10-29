// Trade akkaunt (bot Steam akkaunti) — admin panel orqali ulash/uzish.
//
// Steam bilan ishni faqat VPS'dagi bot qiladi (Vercel IP'lari steamcommunity'da
// bloklangan). Admin panel (Vercel) login so'rovini Mongo'ga shifrlab qoldiradi
// (`tradeLoginReq_<rid>`), bot uni bir necha soniyada olib DARHOL o'chiradi,
// Steam'ga kiradi va natijani `tradeLoginRes_<rid>` ga yozadi. Parol hech
// qayerda saqlanmaydi; saqlanadigani — shifrlangan refresh token (`tradeAccount`).
// inventoryBridge.js bilan bir xil naqsh; I/O `deps` orqali (testda soxta ombor).
const crypto = require("crypto");
const { seal, open } = require("./secretBox");

const ACCOUNT_ID = "tradeAccount";
const REQ = "tradeLoginReq_";
const RES = "tradeLoginRes_";
const WAIT_MS = 25 * 1000;       // Vercel maxDuration (30s) ichida
const POLL_MS = 1000;
const STALE_REQ_MS = 60 * 1000;

// ── Sayt tomoni ──────────────────────────────────────────────────────────────
async function requestLogin({ accountName, password, guardCode }, deps) {
    const rid = crypto.randomBytes(8).toString("hex");
    const started = deps.now();
    await deps.writeDoc(REQ + rid, { at: started, accountName, passwordSealed: seal(password), guardCode });
    while (deps.now() - started < WAIT_MS) {
        await deps.sleep(POLL_MS);
        const res = await deps.readDoc(RES + rid);
        if (res) {
            await deps.removeDoc(RES + rid);
            return res.ok ? { ok: true, account: await getAccount(deps) } : { ok: false, error: res.error };
        }
    }
    await deps.removeDoc(REQ + rid);
    return { ok: false, error: "Bot javob bermadi. Bot serverda ishlayaptimi?" };
}

function publicView(acc) {
    if (!acc) return null;
    const { accountName, steamId64, connectedAt, tokenExpiresAt, lastError } = acc;
    return { accountName, steamId64, connectedAt, tokenExpiresAt, lastError: lastError ?? null };
}

async function getAccount(deps) {
    return publicView(await deps.readDoc(ACCOUNT_ID));
}

async function disconnect(deps) {
    await deps.removeDoc(ACCOUNT_ID);
}

// ── Bot tomoni ───────────────────────────────────────────────────────────────
async function processLoginRequests(deps) {
    for (const id of await deps.listIds(REQ)) {
        const req = await deps.readDoc(id);
        await deps.removeDoc(id);
        if (!req || deps.now() - req.at > STALE_REQ_MS) continue;
        const rid = id.slice(REQ.length);
        let res;
        try {
            const r = await deps.login({ accountName: req.accountName, password: open(req.passwordSealed), guardCode: req.guardCode });
            await deps.writeDoc(ACCOUNT_ID, {
                accountName: req.accountName, steamId64: String(r.steamId64),
                refreshTokenSealed: seal(r.refreshToken),
                connectedAt: new Date(deps.now()).toISOString(),
                tokenExpiresAt: r.tokenExpiresAt || null, lastError: null,
            });
            res = { ok: true };
        } catch (err) {
            console.log("TRADE AKKAUNT LOGIN XATO:", err.message);
            res = { ok: false, error: err.message };
        }
        await deps.writeDoc(RES + rid, res);
    }
}

async function loadSession(deps) {
    const acc = await deps.readDoc(ACCOUNT_ID);
    if (!acc?.refreshTokenSealed) return null;
    return { accountName: acc.accountName, steamId64: acc.steamId64, connectedAt: acc.connectedAt, refreshToken: open(acc.refreshTokenSealed) };
}

async function setLastError(message, deps) {
    const acc = await deps.readDoc(ACCOUNT_ID);
    if (acc) await deps.writeDoc(ACCOUNT_ID, { ...acc, lastError: message });
}

// ── Steam'ga kirish (faqat bot) ──────────────────────────────────────────────
function loginErrorText(eresult) {
    const { EResult } = require("steam-session");
    if (eresult === EResult.InvalidPassword) return "Login yoki parol noto'g'ri";
    if (eresult === EResult.TwoFactorCodeMismatch) return "Steam Guard kodi noto'g'ri yoki eskirgan";
    if (eresult === EResult.RateLimitExceeded) return "Steam juda ko'p urinish deb blokladi, 30 daqiqadan keyin urining";
    return `Steam'ga kirib bo'lmadi: ${EResult[eresult] ?? eresult}`;
}

function jwtExpiry(token) {
    try { return new Date(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).exp * 1000).toISOString(); }
    catch { return null; }
}

async function steamLogin({ accountName, password, guardCode }) {
    const { LoginSession, EAuthTokenPlatformType } = require("steam-session");
    const session = new LoginSession(EAuthTokenPlatformType.WebBrowser);
    const done = new Promise((resolve, reject) => {
        session.once("authenticated", resolve);
        session.once("error", reject);
        session.once("timeout", () => reject(new Error("Steam javob bermadi (timeout)")));
    });
    done.catch(() => {}); // start xato bersa — "unhandled rejection" bo'lmasin
    const timer = setTimeout(() => session.cancelLoginAttempt(), 30_000);
    try {
        const start = await session.startWithCredentials({ accountName, password, steamGuardCode: guardCode });
        if (start.actionRequired) { session.cancelLoginAttempt(); throw new Error("Steam Guard kodi noto'g'ri yoki eskirgan"); }
        await done;
    } catch (err) {
        throw err.eresult !== undefined ? new Error(loginErrorText(err.eresult)) : err;
    } finally {
        clearTimeout(timer);
    }
    return { steamId64: session.steamID.getSteamID64(), refreshToken: session.refreshToken, tokenExpiresAt: jwtExpiry(session.refreshToken) };
}

function mongoDeps() {
    const db = require("./database/db");
    return {
        now: () => Date.now(),
        sleep: (ms) => new Promise(r => setTimeout(r, ms)),
        readDoc: db.readDoc, writeDoc: db.writeDoc, removeDoc: db.removeDoc, listIds: db.listIds,
    };
}

module.exports = { requestLogin, getAccount, disconnect, processLoginRequests, loadSession, setLastError, loginErrorText, steamLogin, mongoDeps };
