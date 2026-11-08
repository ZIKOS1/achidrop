require("dotenv").config();
const { isAdminId, toAdmins } = require("./adminIds");
const express     = require("express");
const helmet      = require("helmet");
const rateLimit   = require("express-rate-limit");
const crypto  = require("crypto");
const path    = require("path");
const { read, write, refresh, readDoc, writeDoc, flipDocField } = require("./database/db");
const { fetchInventory, fetchUserInventory, fetchCommunityInventory, communityInventoryMeta, steamWebApiInventory, steamApisGet } = require("./steam");
const inventoryBridge = require("./inventoryBridge");
const { createPendingAuth, peekPendingAuth, consumePendingAuth, getSteamAuth, steamConnectedHtml } = require("./auth-steam");
const { createPendingLogin, consumePendingLogin } = require("./auth-telegram-login");
const { finishAuction, cancelAuction } = require("./auctionLifecycle");
const { createTelegramUser, findUserBySteamId, createSteamUser } = require("./userLifecycle");
const { mergeSteamDuplicatesInto } = require("./accountMerge");
const { createSession, getSessionUser, destroySession, getSessionToken, setSessionCookie, clearSessionCookie } = require("./session");
const {
    createAdminSession, getAdminSession, destroyAdminSession,
    getAdminSessionToken, setAdminSessionCookie, clearAdminSessionCookie,
    verifyAdminCredentials,
    listAdminAccounts, createAdminAccount, setAdminAccountActive,
    deleteAdminAccount, changeAdminAccountPassword, getAccountsFresh, countActiveCeos,
} = require("./adminAuth");
const { notifyUser } = require("./notify");
const tradeManager   = require("./tradeManager");
const tradeDelivery  = require("./tradeDelivery");
const bidManager     = require("./bidManager");
const chatManager    = require("./chatManager");
const balanceManager = require("./balanceManager");
const skinUtils      = require("./skinUtils");
const { trySendAutoOffer, maybeCheckPendingWithdrawals } = require("./withdrawDelivery");
const supportManager = require("./supportManager");
const instantSellManager = require("./instantSellManager");
const buffPrice = require("./buffPrice");
const { checkPromoForUser, markPromoUsed } = require("./promoCheck");
const lisSkinsPrice = require("./lisSkinsPrice");
const lisAutosell = require("./lisAutosell");
const financeStats = require("./financeStats");
const rating = require("./rating");
const tradeAccountBridge = require("./tradeAccountBridge");
const { validateTradeUrlFor, tradeUrlOwner } = require("./tradeUrl");
const tradeOfferView = require("./tradeOfferView");
const { isVpnIp } = require("./vpnCheck");
const { realClientIp } = require("./clientIp");
const humanCheck = require("./humanCheck");
const opsAlerts = require("./opsAlerts");
const { waitUntil } = require("@vercel/functions");
const { parseCookie, cookieFlags } = require("./session");

const app  = express();
const PORT = process.env.WEBAPP_PORT || 3000;

// Bu sahifa ham Telegram Mini App sifatida iframe ichida, ham alohida sayt
// sifatida ochiladi — shu sabab CSP/frameguard/cross-origin-* siyosatlari
// O'CHIRILGAN (Telegram'ning o'z domenidan iframe orqali yuklashini
// bloklab qo'yishi mumkin edi). Faqat hech qanday joyni buzmaydigan,
// universal xavfsiz sarlavhalar yoqilgan (HSTS, MIME-sniff himoyasi va h.k.).
// Vercel oldidagi proksi haqiqiy IP'ni x-forwarded-for'da beradi — busiz
// barcha userlar bitta IP bo'lib ko'rinadi va IP bo'yicha limitlar (admin
// login) hammani birdan bloklab qo'yishi mumkin edi.
if (process.env.VERCEL) app.set("trust proxy", 1);
// Cloudflare proksisi orqali kelsa — haqiqiy IP CF-Connecting-IP'da (clientIp.js).
// req.ip shu yerda almashtiriladi: rate-limit va VPN blok shuni ishlatadi.
app.use((req, res, next) => {
    Object.defineProperty(req, "ip", { value: realClientIp(req.ip, req.headers["cf-connecting-ip"]), configurable: true });
    next();
});

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    frameguard: false,
}));

// Katta limit faqat rasm yuklash uchun — boshqa yo'llarga 12 MB'lik so'rovlar yuborib
// serverni band qilib bo'lmasin.
app.use("/api/admin/upload-image", express.json({ limit: "12mb" }));
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(__dirname, "..", "frontend", "dist")));

// ── Kirish/parol tekshiruvchi yo'llar uchun umumiy rate-limit ────────────────
// IP bo'yicha — brute-force (admin login, telegram-login kod, promo kod)
// urinishlarini sekinlashtiradi. Har biri alohida window/limit bilan, chunki
// tabiati boshqa (admin login kamdan-kam, promo tekshiruv tez-tez bo'lishi
// mumkin lekin ko'p urinish shubhali).
const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring." },
});
const telegramLoginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring." },
});
// Login qilingan user bo'yicha (auth'dan KEYIN qo'yiladi) — console'dan
// so'rovlarni ketma-ket yuborib serverni/Steam'ni band qilishning oldini oladi.
// Inventar yuklash alohida qattiqroq: har biri Steam'ga so'rov, ko'paysa VPS
// IP'si 429 oladi va hamma userlarda "Steam hozir band" chiqadi.
function userLimiter(windowMs, limit) {
    return rateLimit({
        windowMs, limit,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => (req.user?.id != null ? `u${req.user.id}` : `ip${req.ip}`),
        validate: { keyGeneratorIpFallback: false },
        message: { error: "Juda ko'p so'rov. Birozdan keyin qayta urinib ko'ring." },
    });
}
const inventoryLimiter = userLimiter(60 * 1000, 6);
// Admin panel → trade akkaunt login: Steam ko'p xato urinishni bloklaydi.
const tradeLoginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Juda ko'p urinish. 10 daqiqadan keyin qayta urinib ko'ring." },
});
const sensitiveLimiter = userLimiter(60 * 1000, 10);

const promoCheckLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring." },
});


async function tgSendMessage(chatId, text, replyMarkup) {
    try {
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: "Markdown",
                ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
            }),
        });
    } catch (err) {
        console.log("TELEGRAM SEND ERROR:", err.message);
    }
}

function lotWebAppKeyboard(lotId) {
    if (!process.env.WEBAPP_URL) return undefined;
    return { inline_keyboard: [[{ text: "📦 Auksionni ko'rish", web_app: { url: `${process.env.WEBAPP_URL}/?lot=${lotId}` } }]] };
}

// Erta kirish: yangi auction ochilganda, VIP+ (5 va undan ko'p yutuq) foydalanuvchilar
// birinchi bo'lib bid qo'ya oladi, boshqalar earlyAccessUntil o'tguncha kutadi.
// Admin bu funksiyani Sozlamalar orqali butunlay o'chirib qo'yishi mumkin.
const EARLY_ACCESS_MIN_WINS = 5;
function getSettings() {
    const s = read("settings");
    return Array.isArray(s) ? {} : s;
}
function isEarlyAccessEligible(user) {
    return (user?.wins || []).length >= EARLY_ACCESS_MIN_WINS;
}
function earlyAccessLockedFor(lot, user) {
    if (!lot.earlyAccessUntil) return false;
    if (getSettings().earlyAccessEnabled === false) return false;
    if (new Date(lot.earlyAccessUntil).getTime() <= Date.now()) return false;
    return !isEarlyAccessEligible(user);
}

// Bot (Telegram polling) va mini-app (Vercel serverless) alohida jarayonlar —
// har birining o'z xotiradagi keshi bor. Bot tomonida bergan balans/auksion
// o'zgarishi shu keshda darhol ko'rinishi uchun har bir /api so'rovidan oldin
// eng dolzarb (users, auctions) ma'lumotlarni Mongo'dan qayta o'qiymiz.
app.use("/api", async (req, res, next) => {
    try {
        await Promise.all([refresh("users"), refresh("auctions"), refresh("settings"), refresh("notifications"), refresh("trades"), refresh("tradeBalances"), refresh("tradeFees"), refresh("supportTickets")]);
    } catch (err) {
        console.log("REFRESH ERROR:", err.message);
    }

    // Vaqti tugagan auksionlarni "finished" holatiga o'girish odatda bot
    // jarayonidagi setInterval orqali bajariladi — lekin bot hali hostingga
    // qo'yilmagan bo'lsa, u umuman ishlamaydi va auksion bazada abadiy
    // "active" bo'lib qolaveradi (admin panelda ham shunday ko'rinadi).
    // Shu sabab har bir /api so'rovida bu yerda ham (Vercel'da, doim jonli)
    // tekshirib, kerak bo'lsa o'zimiz yakunlaymiz.
    try {
        const auctions = read("auctions");
        const now = Date.now();
        for (const a of auctions) {
            if (a.status !== "active" || !a.endTime) continue;
            if (new Date(a.endTime).getTime() > now) continue;
            const result = finishAuction(a.id);
            if (!result) continue;
            const { auction: fa, winner } = result;
            if (winner) {
                notifyUser(
                    winner,
                    `🏆 *Tabriklaymiz! "${fa.name}" auksionini yutdingiz!*\n\n` +
                    `💰 Yakuniy narx: ${fa.price.toLocaleString()} so'm\n\n` +
                    `🎒 Skinni olish uchun Inventarga o'ting.`,
                    tgSendMessage,
                    lotWebAppKeyboard(fa.id)
                );
            } else if (process.env.ADMIN_ID) {
                toAdmins((adminId) => tgSendMessage(adminId, `⏰ *"${fa.name}"* auksioni tugadi, lekin hech kim bid qilmadi.`));
            }
        }
    } catch (err) {
        console.log("AUTO-FINISH ERROR:", err.message);
    }

    // "Chiqarib olish"da avtomatik yuborilgan Steam trade offerlarni davriy
    // tekshirish (qabul qilindimi / 1 soatdan oshib ketdimi) — Vercel har doim
    // jonli bo'lgani uchun shu yerda, fire-and-forget, so'rovni sekinlashtirmasdan.
    maybeCheckPendingWithdrawals((user, text) => notifyUser(user, text, tgSendMessage));
    maybeCheckPendingWithdrawals((user, text) => notifyUser(user, text, tgSendMessage), "marketPurchases");

    // Bot o'chib qolganini tekshirish + kunlik hisobot (opsAlerts.js) — fire-and-forget.
    maybeRunOpsChecks();

    next();
});

// ── Adminlarga avtomatik xabarlar: bot o'chdi/yondi, kunlik hisobot (opsAlerts.js) ──
const OPS_CHECK_EVERY_MS = 60 * 1000;
let lastOpsCheckAt = 0;
const opsDeps = {
    now: () => Date.now(),
    readDoc, flipDocField,
    notifyAdmins: (text) => toAdmins((id) => tgSendMessage(id, text)),
    loadReportData: async (day) => {
        await Promise.all([instantSellManager.refreshRequests(), refresh("withdrawals"), refresh("tradeBalances")]);
        const raw = read("instantSellRequests");
        const requests = Array.isArray(raw) ? raw : [];
        const todays = requests.filter(r => r.status === "credited" && financeStats.dayKey(r.resolvedAt) === day);
        const lisUsd = await lisSkinsPrice.fetchLisPricesUsd(todays.flatMap(r => (r.items || []).map(i => i.marketHashName))).catch(() => new Map());
        const fin = financeStats.buildFinance({ requests: todays, lisUsd, rate: lisSkinsPrice.getUsdToSomRate(), holds: balanceManager.getAllHoldsForAdmin(), users: getUsers() });
        const withdrawals = read("withdrawals");
        return {
            requests, withdrawals: Array.isArray(withdrawals) ? withdrawals : [],
            profit: fin.lisTotal > 0 ? fin.profit : null, profitMissing: fin.missingLis, owedTotal: fin.owed.total,
        };
    },
};
async function runOpsChecks() {
    await opsAlerts.checkBotHealth(opsDeps).catch((err) => console.log("BOT HEALTH XATO:", err.message));
    await opsAlerts.maybeSendDailyReport(opsDeps).catch((err) => console.log("KUNLIK HISOBOT XATO:", err.message));
}
function maybeRunOpsChecks() {
    if (Date.now() - lastOpsCheckAt < OPS_CHECK_EVERY_MS) return;
    lastOpsCheckAt = Date.now();
    // waitUntil — Vercel javob qaytgandan keyin ham funksiyani tekshiruv tugaguncha tirik saqlaydi.
    waitUntil(runOpsChecks());
}
// Vercel Cron — saytga hech kim kirmasa ham kuniga bir marta (vercel.json "crons").
app.get("/api/cron/ops", async (req, res) => {
    await runOpsChecks();
    res.json({ ok: true });
});

// ── VPN blok (admin Sozlamalar → vpnBlockEnabled) ───────────────────────────
// Yoqilgan bo'lsa VPN/proksi IP'dan kelgan so'rovlar rad etiladi; sayt
// "VPN'ni o'chiring" oynasini ko'rsatadi. Admin panel bloklanmaydi.
app.get("/api/vpn-status", async (req, res) => {
    const blocked = getSettings().vpnBlockEnabled === true && await isVpnIp(req.ip);
    res.json({ blocked });
});
app.use("/api", async (req, res, next) => {
    if (getSettings().vpnBlockEnabled !== true || req.path.startsWith("/admin")) return next();
    if (await isVpnIp(req.ip)) return res.status(403).json({ error: "VPN'ni o'chiring", code: "vpn_blocked" });
    next();
});

// ── "Odammisiz?" tekshiruvi (admin Sozlamalar → humanCheckEnabled, humanCheck.js) ──
// Telegram Mini App (imzoli initData) — Telegram'ning o'zi tasdiqlagan, tekshirilmaydi.
// Steam OpenID qaytishi tashqi brauzerda ochiladi (cookie yo'q) — u ham ozod.
const HUMAN_EXEMPT = ["/admin", "/human-status", "/human-verify", "/vpn-status", "/auth/steam/"];
function humanCheckOn() {
    return getSettings().humanCheckEnabled === true && humanCheck.configured();
}
function isHuman(req) {
    return humanCheck.isValidPass(parseCookie(req)[humanCheck.COOKIE_NAME]) || !!validateInitData(req.headers["x-init-data"]);
}
app.get("/api/human-status", (req, res) => {
    const required = humanCheckOn() && !isHuman(req);
    res.json({ required, siteKey: required ? process.env.TURNSTILE_SITE_KEY : null });
});
app.post("/api/human-verify", sensitiveLimiter, async (req, res) => {
    if (!await humanCheck.verifyToken(req.body.token, req.ip)) return res.status(400).json({ error: "Tekshiruvdan o'tilmadi, qayta urinib ko'ring" });
    res.setHeader("Set-Cookie", `${humanCheck.COOKIE_NAME}=${humanCheck.makePass()}; HttpOnly; ${cookieFlags()}SameSite=Lax; Path=/; Max-Age=${humanCheck.PASS_TTL_MS / 1000}`);
    res.json({ success: true });
});
app.use("/api", (req, res, next) => {
    if (!humanCheckOn() || HUMAN_EXEMPT.some(p => req.path.startsWith(p)) || isHuman(req)) return next();
    res.status(403).json({ error: "Tekshiruvdan o'ting", code: "human_required" });
});

// ── Vaqtincha o'chirilgan bo'limlar (features.js) ─────────────────────────
// Faqat YANGI amallar bloklanadi (bid, e'lon/xarid, obmen ochish/qo'shilish).
// Boshlangan obmenlar yakunlanishi va yutilgan skinni chiqarib olish ishlaydi.
const { FEATURES } = require("./features");
app.use("/api", (req, res, next) => {
    if (req.method !== "POST") return next();
    const p = req.path;
    const blocked =
        (!FEATURES.auctions && (p === "/bid" || p.startsWith("/quickbid/"))) ||
        (!FEATURES.market && (p === "/market" || /^\/market\/[^/]+\/buy$/.test(p))) ||
        (!FEATURES.trade && (p === "/trades" || /^\/trades\/[^/]+\/join$/.test(p)));
    if (blocked) return res.status(403).json({ error: "Bu bo'lim vaqtincha o'chirilgan", code: "feature_disabled" });
    next();
});

// ── Auth ──────────────────────────────────────────────────────────────────────
const INIT_DATA_MAX_AGE_S = 24 * 60 * 60;
function validateInitData(initData) {
    if (!initData) return null;
    try {
        const params = new URLSearchParams(initData);
        const hash   = params.get("hash");
        if (!hash) return null;
        params.delete("hash");

        const dataCheckString = [...params.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join("\n");

        const secretKey = crypto.createHmac("sha256", "WebAppData")
            .update(process.env.BOT_TOKEN)
            .digest();

        const computed = crypto.createHmac("sha256", secretKey)
            .update(dataCheckString)
            .digest("hex");

        if (computed.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash))) return null;

        // Eski initData qayta ishlatilmasin (oshkor bo'lgan bo'lsa abadiy kirish bo'lardi).
        const authDate = Number(params.get("auth_date"));
        if (!authDate || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_S) return null;

        const userStr = params.get("user");
        return userStr ? JSON.parse(userStr) : null;
    } catch { return null; }
}

// Admin Panel (miniapp/src/admin, alohida build/URL) o'zining login/parol
// bilan o'rnatgan admin_sid cookie'sini tekshiradi — oddiy foydalanuvchi
// (Telegram/Steam) sessiyasi bilan hech qanday aloqasi yo'q, shu sabab
// mijoz ilovasi ichidan hech qanday yo'l bilan bu route'larga kirib bo'lmaydi.
async function requireAdminPanel(req, res, next) {
    const session = await getAdminSession(getAdminSessionToken(req));
    if (!session) return res.status(401).json({ error: "Admin sifatida kirmagansiz" });
    req.adminSession = session;
    next();
}

// CEO — boshqa admin akkauntlarini qo'shish/o'chirish/o'zgartirish faqat shu
// rolga ega bo'lganlarga ruxsat etiladi.
async function requireCeo(req, res, next) {
    const session = await getAdminSession(getAdminSessionToken(req));
    if (!session) return res.status(401).json({ error: "Admin sifatida kirmagansiz" });
    if (session.role !== "ceo") return res.status(403).json({ error: "Bu amal faqat CEO uchun" });
    req.adminSession = session;
    next();
}

function findUser(id) {
    return getUsers().find(x => x.id === id) || null;
}

// Dev bypass — `NODE_ENV !== "production"` ning o'zi yetarli emas edi (bitta
// unutilgan/noto'g'ri sozlangan env-var butun autentifikatsiyani chetlab
// o'tishga imkon berardi). Endi qo'shimcha ravishda .env'da mustaqil
// o'rnatilgan DEV_BYPASS_SECRET ham so'ralgan sarlavha bilan mos kelishi
// shart — ikkalasi ham noto'g'ri bo'lsa bypass ishlamaydi.
function devBypassAllowed(req) {
    const secret = process.env.DEV_BYPASS_SECRET;
    return process.env.NODE_ENV !== "production" && !!secret && req.headers["x-dev-secret"] === secret && !!req.headers["x-dev-uid"];
}

async function auth(req, res, next) {
    const initData = req.headers["x-init-data"];

    if (devBypassAllowed(req)) {
        const uid = Number(req.headers["x-dev-uid"]);
        req.tgUser = { id: uid };
        req.user   = findUser(uid);
        return next();
    }

    const tgUser = validateInitData(initData);
    if (tgUser) {
        req.tgUser = tgUser;
        req.user   = findUser(tgUser.id);
        return next();
    }

    // Telegram initData yo'q (masalan websaytdan to'g'ridan-to'g'ri ochilgan) —
    // Login Widget yoki Steam orqali o'rnatilgan sessiya cookie'sini tekshiramiz.
    const sessionUser = await getSessionUser(getSessionToken(req));
    if (sessionUser) {
        req.tgUser = { id: sessionUser.telegramId || sessionUser.id };
        req.user   = sessionUser;
        return next();
    }

    return res.status(401).json({ error: "Unauthorized" });
}

// Auksionlar ro'yxati/tafsiloti kabi ochiq sahifalar uchun — login bo'lmasa
// ham ko'rish mumkin (req.user shunchaki null bo'ladi), lekin bor bo'lsa
// baribir aniqlaymiz (masalan earlyAccessLocked hisobini to'g'ri chiqarish uchun).
async function optionalAuth(req, res, next) {
    const initData = req.headers["x-init-data"];

    if (devBypassAllowed(req)) {
        const uid = Number(req.headers["x-dev-uid"]);
        req.tgUser = { id: uid };
        req.user   = findUser(uid);
        return next();
    }

    const tgUser = validateInitData(initData);
    if (tgUser) {
        req.tgUser = tgUser;
        req.user   = findUser(tgUser.id);
        return next();
    }

    const sessionUser = await getSessionUser(getSessionToken(req));
    if (sessionUser) {
        req.tgUser = { id: sessionUser.telegramId || sessionUser.id };
        req.user   = sessionUser;
        return next();
    }

    req.tgUser = null;
    req.user   = null;
    next();
}

// ── DB helpers ────────────────────────────────────────────────────────────────
function getUsers() {
    const d = read("users");
    return Array.isArray(d) ? d : Object.values(d);
}
function saveUsers(arr) { write("users", arr); }

function timeLeftMs(endTime) {
    if (!endTime) return null;
    return new Date(endTime).getTime() - Date.now();
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/me
app.get("/api/me", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found. Use /start first." });
    res.json({
        id:            u.id,
        name:          u.name,
        balance:       u.balance  ?? 0,
        wins:          (u.wins    || []).length,
        lang:          u.lang,
        tradeLink:     u.tradeLink ?? null,
        steamId64:     u.steamId64 ?? null,
        steamUsername: u.steamUsername ?? null,
        steamAvatar:   u.steamAvatar ?? null,
        steamPublicConfirmed: u.steamPublicConfirmed ?? false,
        telegramId:    u.telegramId ?? null,
        favorites: u.favorites || [],
        referrals: (u.referrals || []).length,
        joined:    u.joined,
        blocked:   u.blocked  ?? false,
        role:      isAdminId(u.id) ? "admin" : (u.role || "user"),
    });
});

// GET /api/bot-info — bot username o'zi ochiq ma'lumot (t.me/username), shu
// sabab autentifikatsiyasiz ham ochiq (kirish ekrani hali login qilinmagan
// paytda Login Widget uchun shuni chaqiradi).
app.get("/api/bot-info", (req, res) => {
    res.json({ username: process.env.BOT_USERNAME || null });
});

// GET /api/payment-cards — botning to'lov qabul qilish kartalari, ochiq ma'lumot
// (handlers/clientHandler.js'dagi getPaymentCards() bilan bir xil manba).
app.get("/api/payment-cards", (req, res) => {
    const owner = process.env.CARD_OWNER || "KARTA EGASI";
    res.json({
        payme:    { name: "Payme",     emoji: "🔵", card: process.env.PAYME_CARD  || "8600 0000 0000 0000", owner },
        click:    { name: "Click",     emoji: "🟢", card: process.env.CLICK_CARD  || "8600 0000 0000 0000", owner },
        paynet:   { name: "Paynet",    emoji: "🟠", card: process.env.PAYNET_CARD || "8600 0000 0000 0000", owner },
        uzumbank: { name: "Uzum Bank", emoji: "🍇", card: process.env.UZUM_CARD   || "8600 0000 0000 0000", owner },
    });
});

// GET /api/activity — Auksionlar sahifasidagi banner ostidagi "aylanuvchi lenta"
// uchun oxirgi yakunlangan auksionlar (skin, narx, kim yutgani). Mehmonlar ham
// ko'rishi mumkin — bu shunchaki ijtimoiy dalil (social proof), maxfiy emas.
app.get("/api/activity", optionalAuth, (req, res) => {
    const list = read("auctions")
        .filter(a => a.status === "finished" && a.lastBidderName)
        .sort((a, b) => b.id - a.id)
        .slice(0, 20)
        .map(a => ({ id: a.id, name: a.name, image: a.image || null, price: a.price, winnerName: a.lastBidderName }));
    res.json(list);
});

// GET /api/auctions — mehmon (login qilmagan) foydalanuvchilar ham ko'ra oladi
// Auksion kartasidagi "👥 N" ko'rsatkichi — lotga qatnashgan (bid qo'ygan)
// UNIKAL foydalanuvchilar soni (jami bid soni emas — bitta kishi 5 marta bid
// qo'ysa ham "1" bo'lib qoladi). Ilgari bu maydon hech qayerdan qaytmasdi
// (frontend `a.bidCount ?? 0` deb yozib qo'ygan, backend esa hech qachon
// hisoblamagan edi — shu sabab doim "0" ko'rinar edi).
function uniqueBidderCount(lotId) {
    const bids = read("bids") || [];
    return new Set(bids.filter(b => b.lotId === lotId).map(b => b.userId)).size;
}

app.get("/api/auctions", optionalAuth, (req, res) => {
    const now = Date.now();
    // Bot vaqt tugagan auksionni "finished" holatiga o'girishga ulguravermasligi
    // mumkin — shu sabab vaqti tugagan lotlarni bu yerda ham darhol yashiramiz.
    const list = read("auctions").filter(a =>
        a.status === "active" && (!a.endTime || new Date(a.endTime).getTime() > now)
    );
    res.json(list.map(a => ({
        id:                 a.id,
        name:               a.name,
        price:              a.price,
        minBid:             a.minBid ?? 1000,
        image:              a.image  || null,
        endTime:            a.endTime || null,
        endTimeMs:          a.endTime ? new Date(a.endTime).getTime() : null,
        lastBidderName:     a.lastBidderName || null,
        lastBidder:         a.lastBidder     || null,
        earlyAccessUntilMs: a.earlyAccessUntil ? new Date(a.earlyAccessUntil).getTime() : null,
        earlyAccessLocked:  earlyAccessLockedFor(a, req.user),
        float:              a.float      ?? null,
        paintSeed:          a.paintSeed  ?? null,
        paintIndex:         a.paintIndex ?? null,
        stickers:           skinUtils.enrichStickers(a.stickers),
        rarity:             a.rarity     || null,
        statTrak:           a.statTrak   || false,
        tradeBanDays:       a.tradeBanDays || null,
        bidCount:           uniqueBidderCount(a.id),
    })));
});

// GET /api/auction/:id — mehmon (login qilmagan) foydalanuvchilar ham ko'ra oladi
app.get("/api/auction/:id", optionalAuth, (req, res) => {
    const a = read("auctions").find(x => x.id === Number(req.params.id));
    if (!a) return res.status(404).json({ error: "Not found" });
    const expired = a.status === "active" && a.endTime && new Date(a.endTime).getTime() <= Date.now();
    res.json({
        id:                 a.id,
        name:               a.name,
        price:              a.price,
        minBid:             a.minBid ?? 1000,
        image:              a.image  || null,
        endTime:            a.endTime || null,
        endTimeMs:          a.endTime ? new Date(a.endTime).getTime() : null,
        lastBidderName:     a.lastBidderName || null,
        lastBidder:         a.lastBidder     || null,
        status:             expired ? "finished" : a.status,
        earlyAccessUntilMs: a.earlyAccessUntil ? new Date(a.earlyAccessUntil).getTime() : null,
        earlyAccessLocked:  earlyAccessLockedFor(a, req.user),
        float:              a.float      ?? null,
        paintSeed:          a.paintSeed  ?? null,
        paintIndex:         a.paintIndex ?? null,
        stickers:           skinUtils.enrichStickers(a.stickers),
        rarity:             a.rarity     || null,
        statTrak:           a.statTrak   || false,
        tradeBanDays:       a.tradeBanDays || null,
        bidCount:           uniqueBidderCount(a.id),
    });
});

// POST /api/auctions/:id/favorite — sevimlilar ro'yxatiga qo'shish/olib
// tashlash (toggle). Auksion Auksionlar sahifasidagi "SEVIMLILAR" filtri
// shu ro'yxatga qarab ishlaydi (client-side, GET /api/me'dan olingan
// user.favorites bilan solishtirib).
app.post("/api/auctions/:id/favorite", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });

    const lotId = Number(req.params.id);
    if (!read("auctions").some(a => a.id === lotId)) return res.status(404).json({ error: "Not found" });

    const arr  = getUsers();
    const user = arr.find(x => x.id === u.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!Array.isArray(user.favorites)) user.favorites = [];
    const idx = user.favorites.indexOf(lotId);
    if (idx === -1) user.favorites.push(lotId);
    else user.favorites.splice(idx, 1);
    saveUsers(arr);

    res.json({ success: true, favorited: idx === -1, favorites: user.favorites });
});

// Bid xato kodini foydalanuvchiga tanish (eski) xabar/status shakliga
// o'giradi — ikkala route (bid/quickbid) bir xil xato to'plamini qaytaradi.
function bidErrorResponse(res, result, lot) {
    if (result.error === "lot_closed" || result.error === "time_up") return res.status(400).json({ error: result.error === "time_up" ? "Vaqt tugadi" : "Auksion yopilgan" });
    if (result.error === "too_low") return res.status(400).json({ error: `Minimal bid: ${result.minBid.toLocaleString()} so'm`, minBid: result.minBid });
    if (result.error === "insufficient_balance") return res.status(400).json({ error: "Balans yetarli emas", balance: result.balance, needed: result.needed });
    return res.status(400).json({ error: "Xatolik yuz berdi" });
}

// POST /api/bid
app.post("/api/bid", auth, async (req, res) => {
    const u = req.user;
    if (!u)         return res.status(404).json({ error: "User not found" });
    if (u.blocked)  return res.status(403).json({ error: "Bloklangansiz" });

    const { lotId, amount } = req.body;
    const num = Number(amount);
    if (!lotId || isNaN(num) || num <= 0)
        return res.status(400).json({ error: "Noto'g'ri ma'lumot" });

    // Yengil oldindan tekshiruv (early access) — xotiradagi keshdan, chunki
    // bu maydon faqat admin tomonidan o'zgartiriladi, bid orqali emas, shu
    // sabab tranzaksiyadagi kabi "yangi holat"ga muhtoj emas.
    const preLot = read("auctions").find(a => a.id === Number(lotId));
    if (!preLot) return res.status(400).json({ error: "Auksion yopilgan" });
    if (earlyAccessLockedFor(preLot, u)) {
        return res.status(403).json({
            error: `Bu auksion hozircha faqat VIP+ foydalanuvchilar uchun (kamida ${EARLY_ACCESS_MIN_WINS} ta yutuq). Ochilishiga: `,
            earlyAccessUntilMs: new Date(preLot.earlyAccessUntil).getTime(),
        });
    }

    const result = await bidManager.placeBid({
        lotId: Number(lotId), userId: u.id, userName: u.name, mode: "full",
        getAmount: () => num,
    });
    if (result.error) return bidErrorResponse(res, result);

    if (result.outbidUser) {
        notifyUser(
            result.outbidUser.id,
            `🔄 *Siz endi yetakchi emassiz!*\n\n📦 ${result.lot.name}\n💰 Yangi narx: *${result.amount.toLocaleString()} so'm*\n👤 Yangi yetakchi: ${u.name}\n\n💳 *${result.prevPrice.toLocaleString()} so'm* balansingizga qaytarildi.`,
            tgSendMessage,
            lotWebAppKeyboard(result.lot.id)
        );
    }

    res.json({ success: true, newPrice: result.lot.price, newBalance: result.newBalance });
});

// POST /api/quickbid/:id
app.post("/api/quickbid/:id", auth, async (req, res) => {
    const u = req.user;
    if (!u)        return res.status(404).json({ error: "User not found" });
    if (u.blocked) return res.status(403).json({ error: "Bloklangansiz" });

    const lotId = Number(req.params.id);
    const preLot = read("auctions").find(a => a.id === lotId);
    if (!preLot) return res.status(400).json({ error: "Auksion yopilgan" });
    if (earlyAccessLockedFor(preLot, u)) {
        return res.status(403).json({
            error: `Bu auksion hozircha faqat VIP+ foydalanuvchilar uchun (kamida ${EARLY_ACCESS_MIN_WINS} ta yutuq). Ochilishiga: `,
            earlyAccessUntilMs: new Date(preLot.earlyAccessUntil).getTime(),
        });
    }

    const result = await bidManager.placeBid({
        lotId, userId: u.id, userName: u.name, mode: "quick",
        getAmount: (lot, minNext) => minNext,
    });
    if (result.error) return bidErrorResponse(res, result);

    if (result.outbidUser) {
        notifyUser(
            result.outbidUser.id,
            `🔄 *Siz endi yetakchi emassiz!*\n\n📦 ${result.lot.name}\n💰 Yangi narx: *${result.amount.toLocaleString()} so'm*\n👤 Yangi yetakchi: ${u.name}\n\n💳 *${result.prevPrice.toLocaleString()} so'm* balansingizga qaytarildi.`,
            tgSendMessage,
            lotWebAppKeyboard(result.lot.id)
        );
    }

    res.json({ success: true, newPrice: result.lot.price, newBalance: result.newBalance });
});

// GET /api/inventory
app.get("/api/inventory", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    // Eski g'olib yozuvlarida (image/float/stickers snapshot qilinishidan oldin
    // yutilgan) bu maydonlar bo'lmasligi mumkin — asl auksion yozuvi bazada
    // hali turgan bo'lsa (o'chirilmagan bo'lsa), o'sha yerdan to'ldirib olamiz,
    // shu bilan eski yutuqlar ham rasm/float bilan chiqadi.
    const auctions = read("auctions");
    const wins = (u.wins || []).map(w => {
        let win = w;
        if (win.image == null) {
            const a = auctions.find(x => x.id === win.lotId);
            if (a) {
                win = {
                    ...win,
                    image:      a.image      || null,
                    float:      a.float      ?? null,
                    paintSeed:  a.paintSeed  ?? null,
                    paintIndex: a.paintIndex ?? null,
                    stickers:   a.stickers   || [],
                    rarity:     a.rarity     || null,
                    statTrak:   a.statTrak   || false,
                };
            }
        }
        return { ...win, stickers: skinUtils.enrichStickers(win.stickers) };
    });
    res.json(wins);
});

// POST /api/withdraw/:lotId
// Avval haqiqiy Steam trade offer'ni AVTOMATIK yuborishga urinamiz
// (withdrawDelivery.js → relay). Relay hali (VPS'da) bunga tayyor bo'lmasa
// yoki xato qaytarsa, trySendAutoOffer null qaytaradi — shu holda avvalgi
// qo'lda-admin oqimiga (admin xabar oladi, o'zi "Skin yuborildi" bosadi) tushamiz.
app.post("/api/withdraw/:lotId", auth, async (req, res) => {
    const u = req.user;
    if (!u)            return res.status(404).json({ error: "User not found" });
    if (!u.tradeLink)  return res.status(400).json({ error: "Trade link kerak" });

    const lotId = Number(req.params.lotId);
    const arr   = getUsers();
    const user  = arr.find(x => x.id === u.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // "requested" ham qayta so'rashga ochiq — avtomatik yuborish (masalan
    // Steam'ning "juda ko'p taklif" cheklovi) muvaffaqiyatsiz bo'lib qo'lda-admin
    // navbatiga tushgan itemlarni, admin hali qo'lda yakunlamagan bo'lsa
    // (yakunlansa status "delivered"ga o'tadi, bu yerga tushmaydi), foydalanuvchi
    // saytdan qayta urinib ko'rishi mumkin bo'lsin uchun.
    const win = (user.wins || []).find(w => w.lotId === lotId && (!w.status || ["pending", "rejected", "auto_failed", "requested"].includes(w.status)));
    if (!win) return res.status(404).json({ error: "Item topilmadi yoki allaqachon so'ralgan" });

    const auto = await trySendAutoOffer(user, win);
    if (auto?.offerId) {
        win.status       = "auto_sent";
        win.tradeOfferId = auto.offerId;
        win.autoSentAt   = new Date().toISOString();
        delete win.rejectComment;
        delete win.lastFailReason;
        saveUsers(arr);
        return res.json({ success: true, auto: true });
    }

    win.status      = "requested";
    win.requestedAt = new Date().toISOString();
    delete win.rejectComment;
    saveUsers(arr);

    toAdmins((adminId) => tgSendMessage(adminId, `📤 *SKIN CHIQARISH!*\n\n👤 *${user.name}*\n🪪 \`${user.id}\`\n🏷 *${win.lotName}*\n💰 ${(win.price ?? 0).toLocaleString()} so'm\n🔗 \`${user.tradeLink}\`\n⏰ ${new Date().toLocaleString("uz-UZ")}`,
        {
            inline_keyboard: [
                [{ text: "✅ Skin yuborildi", callback_data: `skin_sent_${user.id}_${lotId}` }],
                [{ text: "❌ Rad etish",      callback_data: `skin_reject_${user.id}_${lotId}` }],
            ],
        }
    ));

    res.json({ success: true, auto: false });
});

// GET /api/market-inventory — GET /api/inventory'ning market-xarid varianti:
// buyer'ning marketPurchases'ini (har biri o'z status'i bilan) qaytaradi.
app.get("/api/market-inventory", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json(u.marketPurchases || []);
});

// POST /api/market-withdraw/:purchaseId
// POST /api/withdraw/:lotId bilan bir xil naqsh — faqat user.wins o'rniga
// user.marketPurchases ustida ishlaydi (arrayField="marketPurchases").
app.post("/api/market-withdraw/:purchaseId", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    if (!u.tradeLink) return res.status(400).json({ error: "Trade link kerak" });

    const purchaseId = Number(req.params.purchaseId);
    const arr = getUsers();
    const user = arr.find(x => x.id === u.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // "rejected" ham qayta urinishga yaroqli — POST /api/withdraw/:lotId dagi
    // kabi: admin qo'lda yetkazishni rad etgan bo'lsa, foydalanuvchi Trade
    // Link'ini tuzatib qayta so'rashi mumkin bo'lishi kerak.
    const purchase = (user.marketPurchases || []).find(p => p.lotId === purchaseId && (!p.status || p.status === "pending" || p.status === "rejected" || p.status === "auto_failed"));
    if (!purchase) return res.status(404).json({ error: "Item topilmadi yoki allaqachon so'ralgan" });

    const auto = await trySendAutoOffer(user, purchase);
    if (auto?.offerId) {
        purchase.status = "auto_sent";
        purchase.tradeOfferId = auto.offerId;
        purchase.autoSentAt = new Date().toISOString();
        delete purchase.rejectComment;
        delete purchase.lastFailReason;
        saveUsers(arr);
        return res.json({ success: true, auto: true });
    }

    purchase.status = "requested";
    purchase.requestedAt = new Date().toISOString();
    delete purchase.rejectComment;
    saveUsers(arr);
    toAdmins((adminId) => tgSendMessage(adminId, `📤 *MARKET SKIN CHIQARISH!*\n\n👤 *${user.name}*\n🏷 *${purchase.lotName}*\n💰 ${(purchase.price ?? 0).toLocaleString()} so'm\n🔗 \`${user.tradeLink}\``,
        { inline_keyboard: [
            [{ text: "✅ Skin yuborildi", callback_data: `mkt_skin_sent_${user.id}_${purchaseId}` }],
            [{ text: "❌ Rad etish", callback_data: `mkt_skin_reject_${user.id}_${purchaseId}` }],
        ]}
    ));
    res.json({ success: true, auto: false });
});

// ── 🆘 Qo'llab-quvvatlash (avtomatik yetkazib berish takror muvaffaqiyatsiz
// bo'lgandan keyingi "Xatolik bo'lyapti" oqimi) ─────────────────────────────
// withdrawDelivery.js MAX_AUTO_ATTEMPTS marta urinib muvaffaqiyatsiz bo'lsa
// (win.status yana "pending"ga o'xshab qoladi, lekin lastFailReason saqlanib
// qoladi), Inventory.jsx shu yerga "Xatolik bo'lyapti" tugmasini ko'rsatadi —
// bosilganda admin bilan to'g'ridan-to'g'ri chat (ticket) ochiladi.

// POST /api/support/withdraw-issue — { lotId }
app.post("/api/support/withdraw-issue", auth, sensitiveLimiter, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const lotId = Number(req.body.lotId);
    const win = (u.wins || []).find(w => w.lotId === lotId);
    const lotName = win?.lotName || "Skin";
    const reason = win?.lastFailReason ? `Avtomatik yuborish muvaffaqiyatsiz bo'ldi: ${win.lastFailReason}` : null;
    const ticket = supportManager.openOrGet(u.id, u.name, lotId, lotName, reason);
    if (process.env.ADMIN_ID) {
        toAdmins((adminId) => tgSendMessage(adminId, `🆘 *YORDAM SO'ROVI!*\n\n👤 ${mdEscape(u.name ?? String(u.id))}\n🪪 \`${u.id}\`\n🏷 ${lotName}\n🆔 Ticket #${ticket.id}`,
            { inline_keyboard: [
                [{ text: "💬 Javob berish", callback_data: `support_reply_${ticket.id}` }],
                [{ text: "✅ Yopish", callback_data: `support_close_${ticket.id}` }],
            ]}
        ));
    }
    res.json(ticket);
});

// GET /api/support/mine
app.get("/api/support/mine", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json(supportManager.getMine(u.id));
});

// GET /api/support/:id
app.get("/api/support/:id", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const ticket = supportManager.getById(Number(req.params.id));
    if (!ticket || ticket.userId !== u.id) return res.status(404).json({ error: "not_found" });
    res.json(ticket);
});

// POST /api/support/:id/message — { text }
app.post("/api/support/:id/message", auth, sensitiveLimiter, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ error: "Xabar bo'sh" });
    const ticket = supportManager.getById(Number(req.params.id));
    if (!ticket || ticket.userId !== u.id) return res.status(404).json({ error: "not_found" });
    const result = supportManager.addMessage(ticket.id, "user", u.name, text);
    if (result.error) return res.status(400).json({ error: result.error });
    if (process.env.ADMIN_ID) {
        toAdmins((adminId) => tgSendMessage(adminId, `🆘 *Ticket #${ticket.id}* (${mdEscape(u.name ?? String(u.id))}):\n${mdEscape(text)}`,
            { inline_keyboard: [
                [{ text: "💬 Javob berish", callback_data: `support_reply_${ticket.id}` }],
                [{ text: "✅ Yopish", callback_data: `support_close_${ticket.id}` }],
            ]}
        ));
    }
    res.json(result.ticket);
});

// GET /api/admin/support — barcha tredlar (admin panel)
app.get("/api/admin/support", requireAdminPanel, (req, res) => {
    const tickets = supportManager.getAll().slice().sort((a, b) => {
        if ((a.status === "open") !== (b.status === "open")) return a.status === "open" ? -1 : 1;
        return b.lastActivityAt.localeCompare(a.lastActivityAt);
    });
    res.json(tickets);
});

// POST /api/admin/support/:id/message — { text }
app.post("/api/admin/support/:id/message", requireAdminPanel, (req, res) => {
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ error: "Xabar bo'sh" });
    const ticket = supportManager.getById(Number(req.params.id));
    if (!ticket) return res.status(404).json({ error: "not_found" });
    const accounts = read("adminAccounts") || [];
    const adminName = accounts.find(a => a.id === req.adminSession.accountId)?.username || "Admin";
    const result = supportManager.addMessage(ticket.id, "admin", adminName, text);
    if (result.error) return res.status(400).json({ error: result.error });
    notifyUser(ticket.userId, `🆘 *Yordam (Ticket #${ticket.id})* — ${adminName}:*\n${text}`, tgSendMessage);
    res.json(result.ticket);
});

// POST /api/admin/support/:id/close
app.post("/api/admin/support/:id/close", requireAdminPanel, (req, res) => {
    const result = supportManager.closeTicket(Number(req.params.id));
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result.ticket);
});

// POST /api/trade-link — { tradeLink, steamPublicConfirmed? }
// `steamPublicConfirmed` — obmen yo'riqnoma-wizard'ida foydalanuvchi Steam
// inventarini public qilganini tasdiqlaganda yuboriladi (bir marta so'raladi,
// keyingi obmenlarda wizard qayta chiqmasligi uchun saqlanadi).
app.post("/api/trade-link", auth, sensitiveLimiter, (req, res) => {
    const u   = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });

    const { tradeLink, steamPublicConfirmed } = req.body;
    if (tradeLink && !tradeLink.startsWith("https://steamcommunity.com/tradeoffer/new/"))
        return res.status(400).json({ error: "Noto'g'ri Trade Link formati" });

    const arr  = getUsers();
    const user = arr.find(x => x.id === u.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (tradeLink !== undefined) user.tradeLink = tradeLink || null;
    if (steamPublicConfirmed === true) user.steamPublicConfirmed = true;
    saveUsers(arr);
    res.json({ success: true });
});

// ── 🔄 Obmen (P2P skin savdo) — websayt ustidan tradeManager.js/chatManager.js/
// balanceManager.js'ga wrapper. Mantiq handlers/tradeHandler.js (bot UI) bilan
// bir xil — ikkalasi ham bir xil "trades" Mongo store'ini o'qiydi/yozadi, shu
// sabab bot orqali ochilgan obmen saytda ham, aksincha ham ko'rinadi.
function otherPartyId(trade, viewerId) {
    return viewerId === trade.sellerId ? trade.buyerId : trade.sellerId;
}

// GET /api/trade-inventory — foydalanuvchining o'zi ulagan Steam hisobidagi
// savdo qilinadigan itemlar (obmen ochish uchun tanlov ro'yxati).
app.get("/api/trade-inventory", auth, inventoryLimiter, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    if (!u.steamId64) return res.status(400).json({ error: "Avval Steam hisobingizni ulang" });
    try {
        const items = await fetchUserInventory(u.steamId64, req.query.refresh === "1");
        res.json(items.filter(it => it.tradable !== false).map(it => ({ ...it, stickers: skinUtils.enrichStickers(it.stickers) })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/trades — mening obmenlarim + boshqalarning ochiq e'lonlari
app.get("/api/trades", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const mine = tradeManager.getMyTrades(u.id);
    const open = tradeManager.getOpenTrades(u.id).filter(t => !mine.some(m => m.id === t.id));
    res.json({ mine, open });
});

// Sotuvchi/xaridor ismi-avatari — frontend ularni alohida so'rov qilmasligi
// uchun har bir trade javobiga qo'shiladi. MUHIM: har bir POST amaldan keyingi
// javobga ham qo'llanishi kerak (faqat GET'ga emas) — aks holda masalan
// "qo'shilish" tugmasidan keyin xaridor ismi frontendda "Hali yo'q" bo'lib
// ko'rinib qolardi, chunki tradeManager funksiyalari xom (ismsiz) trade
// obyektini qaytaradi.
function enrichTrade(trade) {
    if (!trade) return trade;
    const seller = findUser(trade.sellerId);
    const buyer  = trade.buyerId ? findUser(trade.buyerId) : null;
    return {
        ...trade,
        sellerName:   seller?.name ?? null,
        sellerAvatar: seller?.steamAvatar ?? null,
        buyerName:    buyer?.name ?? null,
        buyerAvatar:  buyer?.steamAvatar ?? null,
        // Skinni sotuvchi shu yerga yuborishi kerak — narx qulflanib, sotuvchi
        // navbati kelganda (seller_sending) ko'rinishi uchun.
        buyerTradeLink: buyer?.tradeLink ?? null,
    };
}

// GET /api/trades/:id
app.get("/api/trades/:id", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    // Boshqa jarayon (masalan bot/tradeDelivery avtomatik tekshiruvi) yozgan
    // yangilanish shu (Vercel) instance keshida hali ko'rinmagan bo'lishi
    // mumkin — boshqa /api/trades/... yo'llari kabi shu yerda ham Mongo'dan
    // qayta o'qiymiz (server.js'dagi refresh() izohiga qarang).
    await refresh("trades").catch(() => {});
    const trade = tradeManager.getTradeById(Number(req.params.id));
    if (!trade) return res.status(404).json({ error: "Topilmadi" });
    if (trade.status !== "open" && trade.sellerId !== u.id && trade.buyerId !== u.id) {
        return res.status(403).json({ error: "Ruxsat yo'q" });
    }
    res.json(enrichTrade(trade));
});

// Obmen qaysi joydan ochilganini aniqlash — taklif havolasi shunga qarab
// Telegram (t.me/...) yoki websayt (?trade=ID) havolasiga aylanadi.
function isFromTelegram(req) {
    if (devBypassAllowed(req)) return false;
    return !!validateInitData(req.headers["x-init-data"]);
}

const MIN_TRADE_PRICE = 999;

// "Obmen" turidagi promo kodni bir marta "sarflaydi" — faqat aktiv, mos
// turdagi, hali global limitidan oshmagan va shu foydalanuvchi uchun
// perUserLimit'dan oshmagan kodlarga ruxsat beradi.
function redeemTradePromo(code, userId) {
    const promos = read("promos") || [];
    const p = promos.find(x => x.code === code);
    if (!p || p.type !== "trade") return { error: "not_found" };
    const check = checkPromoForUser(p, userId);
    if (check.error) return check;
    markPromoUsed(p, userId);
    write("promos", promos);
    return { ok: true };
}

function buildSkin(item) {
    return {
        assetId: item.assetId, name: item.name,
        wear: skinUtils.wearCode(item.float), float: item.float ?? null,
        inspectLink: item.inspectLink || null, imageUrl: item.image || null,
        priceEstimate: null,
        rarity: item.rarity || null,
        paintSeed: item.paintSeed ?? null,
        paintIndex: item.paintIndex ?? null,
        stickers: skinUtils.enrichStickers(item.stickers),
        statTrak: /StatTrak/i.test(item.name || ""),
    };
}

// Bot xabarlarida ko'p skinli obmenni qisqa matn qilib ko'rsatish uchun
// ("MAC-10 | Bronzer va yana 2 ta" kabi) — trade.skins har doim massiv.
function skinsLabel(trade) {
    const skins = trade.skins || [];
    if (!skins.length) return "-";
    if (skins.length === 1) return skins[0].name;
    return `${skins[0].name} va yana ${skins.length - 1} ta`;
}

// POST /api/trades — { assetId | assetIds: [...], price?, visibility?, promoCode? }.
// Bir nechta skin tanlansa ham HAMMASI BITTA obmen ichida (bitta narx,
// bitta chat, bitta escrow) — alohida-alohida obmenlar bo'lib qolmaydi.
app.post("/api/trades", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    if (!u.steamId64) return res.status(400).json({ error: "Avval Steam hisobingizni ulang" });

    const assetIds = Array.isArray(req.body.assetIds) && req.body.assetIds.length
        ? req.body.assetIds
        : (req.body.assetId ? [req.body.assetId] : []);
    if (!assetIds.length) return res.status(400).json({ error: "assetId kerak" });

    const price = Number(req.body.price);
    const priceGiven = req.body.price !== undefined && req.body.price !== null && req.body.price !== "";
    if (priceGiven && Number.isFinite(price) && price > 0 && price < MIN_TRADE_PRICE) {
        return res.status(400).json({ error: "min_price" });
    }
    const priceOrNull = Number.isFinite(price) && price > 0 ? price : null;

    let items;
    try { items = await fetchUserInventory(u.steamId64); }
    catch (err) { return res.status(500).json({ error: err.message }); }

    const skins = assetIds.map(id => items.find(it => String(it.assetId) === String(id))).filter(Boolean).map(buildSkin);
    if (!skins.length) return res.status(404).json({ error: "Item topilmadi (kesh eskirgan bo'lishi mumkin)" });

    const visibility = req.body.visibility === "private" ? "private" : "public";
    const origin = isFromTelegram(req) ? "telegram" : "website";
    const promoCode = req.body.promoCode ? String(req.body.promoCode).toUpperCase().trim() : null;

    let usedPromo = null;
    if (promoCode) {
        await refresh("promos").catch(() => {});
        const check = redeemTradePromo(promoCode, u.id);
        if (check.error) return res.status(400).json({ error: check.error === "already_used" ? "promo_already_used" : check.error === "exhausted" ? "promo_exhausted" : "promo_not_found" });
        usedPromo = promoCode;
    }

    const trade = tradeManager.createTrade(u.id, skins, origin, priceOrNull, visibility, usedPromo);
    res.json(enrichTrade(trade));
});

// POST /api/trades/check-promo — { code } orqali "Qo'llash" tugmasi uchun
// FAQAT tekshiradi (limitni SARFLAMAYDI) — narx ustidagi "Xizmat haqi: 0"
// oldindan ko'rsatilishi uchun. Haqiqiy sarflash faqat POST /api/trades'da
// (E'lon qilish bosilganda) sodir bo'ladi.
app.post("/api/trades/check-promo", auth, promoCheckLimiter, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const code = String(req.body.code || "").toUpperCase().trim();
    if (!code) return res.status(400).json({ error: "promo_not_found" });
    await refresh("promos").catch(() => {});
    const promos = read("promos") || [];
    const p = promos.find(x => x.code === code);
    if (!p || p.type !== "trade") return res.status(400).json({ error: "promo_not_found" });
    const check = checkPromoForUser(p, u.id);
    if (check.error) return res.status(400).json({ error: check.error === "already_used" ? "promo_already_used" : "promo_exhausted" });
    res.json({ ok: true });
});

// POST /api/trades/:id/join
app.post("/api/trades/:id/join", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    await refresh("trades").catch(() => {});
    const result = tradeManager.joinTrade(Number(req.params.id), u.id);
    if (result.error) return res.status(400).json({ error: result.error });
    const trade = result.trade;
    notifyUser(trade.sellerId, `🎉 *Obmen #${trade.id}* uchun xaridor topildi!\n\nNarxni kelishish uchun obmenni oching.`, tgSendMessage);
    res.json(enrichTrade(trade));
});

// POST /api/trades/:id/price — { price }
app.post("/api/trades/:id/price", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    await refresh("trades").catch(() => {});
    const price = Number(req.body.price);
    if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: "Noto'g'ri narx" });

    const result = tradeManager.proposePrice(Number(req.params.id), u.id, price);
    if (result.error) return res.status(400).json({ error: result.error });
    const trade = result.trade;
    const otherId = otherPartyId(trade, u.id);
    if (otherId) notifyUser(otherId, `💰 *Obmen #${trade.id}* uchun yangi narx taklifi: *${price.toLocaleString()} so'm*.`, tgSendMessage);
    res.json(enrichTrade(trade));
});

// POST /api/trades/:id/confirm
app.post("/api/trades/:id/confirm", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    await Promise.all([refresh("trades"), refresh("users")]).catch(() => {});
    const result = await tradeManager.confirmTrade(Number(req.params.id), u.id);
    if (result.error) return res.status(400).json({ error: result.error, trade: enrichTrade(result.trade) });
    const trade = result.trade;
    if (result.locked) {
        [trade.sellerId, trade.buyerId].filter(Boolean).forEach(id =>
            notifyUser(id, `🔒 *Obmen #${trade.id}* narxi qulflandi: *${trade.agreedPrice.toLocaleString()} so'm*. Sotuvchi skinni yuborishi kerak.`, tgSendMessage));
    } else {
        const otherId = otherPartyId(trade, u.id);
        if (otherId) notifyUser(otherId, `✅ *Obmen #${trade.id}*: hamkoringiz narxni tasdiqladi. Sizning ham tasdig'ingiz kerak.`, tgSendMessage);
    }
    res.json({ ...result, trade: enrichTrade(trade) });
});

// POST /api/trades/:id/sent — sotuvchi skinni yubordi
app.post("/api/trades/:id/sent", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    await refresh("trades").catch(() => {});
    const result = tradeManager.markSent(Number(req.params.id), u.id);
    if (result.error) return res.status(400).json({ error: result.error });
    const trade = result.trade;
    const buyer = trade.buyerId ? findUser(trade.buyerId) : null;
    if (buyer?.steamId64) tradeDelivery.snapshotBuyerBaseline(trade, buyer.steamId64).catch(() => {});
    const label1 = trade.kind === "market" ? "Market" : "Obmen";
    if (trade.buyerId) notifyUser(trade.buyerId, `📤 *${label1} #${trade.id}*: sotuvchi skinni yubordi! Steam'da tekshirib, "Skinni oldim" tugmasini bosing.`, tgSendMessage);
    res.json(enrichTrade(trade));
});

// POST /api/trades/:id/received — xaridor qabul qildi, sotuvchiga pul o'tadi (7 kunlik hold)
app.post("/api/trades/:id/received", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    await Promise.all([refresh("trades"), refresh("users")]).catch(() => {});
    const result = tradeManager.markReceived(Number(req.params.id), u.id);
    if (result.error) return res.status(400).json({ error: result.error });
    const trade = result.trade;
    balanceManager.creditTradeProceeds(trade.sellerId, trade.sellerProceeds, trade.id, trade.feeAmount);
    const feeLine = trade.feeAmount > 0 ? `\n💸 Xizmat haqi: ${trade.feeAmount.toLocaleString()} so'm ushlab qolindi.` : "";
    const label2 = trade.kind === "market" ? "Market" : "Obmen";
    notifyUser(trade.sellerId,
        `🎉 *${label2} #${trade.id}* yakunlandi!*\n💰 *${trade.sellerProceeds.toLocaleString()} so'm* hisobingizga tushdi.${feeLine}\n\n🧊 7 kundan keyin "Balans" bo'limidan yechib olishingiz mumkin bo'ladi.`,
        tgSendMessage
    );
    res.json(enrichTrade(trade));
});

// POST /api/trades/:id/dispute
app.post("/api/trades/:id/dispute", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    await refresh("trades").catch(() => {});
    const result = tradeManager.markDisputed(Number(req.params.id), u.id);
    if (result.error) return res.status(400).json({ error: result.error });
    const trade = result.trade;
    const otherId = otherPartyId(trade, u.id);
    if (otherId) notifyUser(otherId, `⚠️ *Obmen #${trade.id}* bo'yicha muammo bildirildi. Admin tez orada bog'lanadi.`, tgSendMessage);
    if (process.env.ADMIN_ID) {
        toAdmins((adminId) => tgSendMessage(adminId, `⚠️ *NIZOLI OBMEN!*\n\n🆔 #${trade.id}\n👤 Sotuvchi: \`${trade.sellerId}\`\n🛒 Xaridor: \`${trade.buyerId ?? "-"}\`\n📦 ${skinsLabel(trade)}\n💰 ${trade.agreedPrice ? trade.agreedPrice.toLocaleString() + " so'm" : "kelishilmagan"}`
        ));
    }
    res.json(enrichTrade(trade));
});

// POST /api/trades/:id/cancel
app.post("/api/trades/:id/cancel", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    await Promise.all([refresh("trades"), refresh("users")]).catch(() => {});
    const result = tradeManager.cancelTrade(Number(req.params.id), u.id);
    if (result.error) return res.status(400).json({ error: result.error });
    const trade = result.trade;
    const otherId = otherPartyId(trade, u.id);
    if (otherId) notifyUser(otherId,
        `❌ *Obmen #${trade.id}* bekor qilindi.` + (result.refunded ? `\n💰 ${result.refunded.toLocaleString()} so'm balansingizga qaytarildi.` : ""),
        tgSendMessage
    );
    res.json({ ...result, trade: enrichTrade(trade) });
});

// POST /api/trades/:id/chat — { text }
app.post("/api/trades/:id/chat", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ error: "Xabar bo'sh" });
    const result = chatManager.addChatMessage(Number(req.params.id), u.id, text);
    if (result.error) return res.status(404).json({ error: result.error });
    const trade = result.trade;
    const otherId = otherPartyId(trade, u.id);
    if (otherId) notifyUser(otherId, `💬 *Obmen #${trade.id}* xabari:*\n${text}`, tgSendMessage);
    res.json(enrichTrade(trade));
});

// ── 🛒 Market (CS.Float uslubidagi katalog) ─────────────────────────────────
// Obmen bilan bir xil "trades" store/state machine/balans/avtomatik-yetkazish
// mantig'idan foydalanadi (tradeManager.js'ga qarang) — faqat kind:"market"
// bilan belgilangan, bitta skinli, narxi majburiy va chat/muzokarasiz bitta
// bosishda sotib olinadigan e'lonlar sifatida. Shu sabab bu yerda yangi
// escrow/hold/komissiya kodi yozilmagan — mavjud tradeManager funksiyalari
// (createTrade, joinTrade, confirmTrade, markSent, markReceived, cancelTrade)
// va GET/POST /api/trades/:id/sent|received|dispute to'g'ridan-to'g'ri qayta
// ishlatiladi (frontend market sahifasi o'sha yo'llarga ham murojaat qiladi).

// GET /api/market — katalog: qidiruv/saralash/narx filtri bilan ochiq e'lonlar.
app.get("/api/market", auth, (req, res) => {
    let listings = tradeManager.getMarketListings();

    const q = String(req.query.q || "").trim().toLowerCase();
    if (q) listings = listings.filter(t => (t.skins?.[0]?.name || "").toLowerCase().includes(q));

    const minPrice = Number(req.query.minPrice);
    if (Number.isFinite(minPrice)) listings = listings.filter(t => (t.agreedPrice ?? 0) >= minPrice);
    const maxPrice = Number(req.query.maxPrice);
    if (Number.isFinite(maxPrice)) listings = listings.filter(t => (t.agreedPrice ?? 0) <= maxPrice);

    const sort = req.query.sort || "newest";
    if (sort === "price_asc") listings.sort((a, b) => (a.agreedPrice ?? 0) - (b.agreedPrice ?? 0));
    else if (sort === "price_desc") listings.sort((a, b) => (b.agreedPrice ?? 0) - (a.agreedPrice ?? 0));
    else listings.sort((a, b) => b.id - a.id);

    res.json(listings.map(enrichTrade));
});

// GET /api/market-mine — mening sotuvlarim (sotuvchi) va xaridlarim (xaridor).
app.get("/api/market-mine", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const mine = tradeManager.getMyMarketTrades(u.id).sort((a, b) => b.id - a.id).map(enrichTrade);
    res.json({
        selling: mine.filter(t => t.sellerId === u.id),
        buying: mine.filter(t => t.buyerId === u.id),
    });
});

// GET /api/market/:id
app.get("/api/market/:id", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    await refresh("trades").catch(() => {});
    const trade = tradeManager.getTradeById(Number(req.params.id));
    if (!trade || trade.kind !== "market") return res.status(404).json({ error: "Topilmadi" });
    if (trade.status !== "open" && trade.sellerId !== u.id && trade.buyerId !== u.id) {
        return res.status(403).json({ error: "Ruxsat yo'q" });
    }
    res.json(enrichTrade(trade));
});

// POST /api/market — { assetId, price } — bitta skinni katalogga chiqarish.
// Admin-only: oddiy userlar endi faqat Instant Sell orqali sota oladi
// (POST /api/instant-sell) — o'zboshimchalik bilan narx belgilab market'ga
// qo'ya olmaydi.
app.post("/api/market", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    if (u.id !== Number(process.env.ADMIN_ID)) return res.status(403).json({ error: "forbidden" });
    if (!u.steamId64) return res.status(400).json({ error: "Avval Steam hisobingizni ulang" });

    const assetId = req.body.assetId;
    if (!assetId) return res.status(400).json({ error: "assetId kerak" });

    const price = Number(req.body.price);
    if (!Number.isFinite(price) || price < MIN_TRADE_PRICE) return res.status(400).json({ error: "min_price" });

    let items;
    try { items = await fetchUserInventory(u.steamId64); }
    catch (err) { return res.status(500).json({ error: err.message }); }

    const item = items.find(it => String(it.assetId) === String(assetId));
    if (!item) return res.status(404).json({ error: "Item topilmadi (kesh eskirgan bo'lishi mumkin)" });

    const origin = isFromTelegram(req) ? "telegram" : "website";
    const trade = tradeManager.createTrade(u.id, [buildSkin(item)], origin, price, "public", null, "market");
    res.json(enrichTrade(trade));
});

// POST /api/market/:id/buy — bitta bosishda sotib olish (join+confirm birgalikda).
app.post("/api/market/:id/buy", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    await Promise.all([refresh("trades"), refresh("users")]).catch(() => {});

    const result = await tradeManager.buyMarketListing(Number(req.params.id), u.id);
    if (result.error) return res.status(400).json({ error: result.error });

    const locked = result.trade;

    // Sotuvchi admin bo'lsa (bot inventaridan sotilgan e'lon) — tradeManager
    // savdoni tranzaksiya ichida DARHOL "completed" qilib qo'ydi, shu sabab
    // sotuvchi tushumini shu yerda qo'shamiz (POST /api/trades/:id/received
    // dagi naqshning aynan o'zi — creditTradeProceeds tranzaksiyada
    // qatnasha olmaydi).
    //
    // Xaridorning marketPurchases yozuvi ("Chiqarib olish" tugmasi) ham FAQAT
    // shu holatda qo'shiladi: eski (Task 6'gacha bo'lgan) oddiy userning P2P
    // e'loni sotib olinsa, botda u skin yo'q — avtomatik yetkazib bo'lmaydi,
    // xaridor eski trade-room oqimi orqali sotuvchidan oladi.
    if (result.autoCompleted) {
        balanceManager.creditTradeProceeds(locked.sellerId, locked.sellerProceeds, locked.id, locked.feeAmount);

        // Auksion g'oliblari uchun mavjud "wins" naqshiga o'xshab, xaridorning
        // marketPurchases'iga yozuv qo'shamiz — shu orqali u istalgan payt
        // "Chiqarib olish"ni bosib, avtomatik (yoki admin fallback) Steam trade
        // offer olishi mumkin (withdrawDelivery.js, POST /api/market-withdraw).
        const arr = getUsers();
        const buyer = arr.find(x => x.id === u.id);
        if (buyer) {
            if (!Array.isArray(buyer.marketPurchases)) buyer.marketPurchases = [];
            const skin = locked.skins?.[0];
            buyer.marketPurchases.push({
                lotId: locked.id, lotName: skin?.name ?? "Skin",
                image: skin?.imageUrl ?? null, float: skin?.float ?? null,
                assetId: skin?.assetId ?? null, price: locked.agreedPrice,
                status: "pending", requestedAt: null,
            });
            saveUsers(arr);
        }
    }

    notifyUser(locked.sellerId,
        `🛒 *Market #${locked.id}*: "${locked.skins?.[0]?.name}" sotildi! *${locked.agreedPrice.toLocaleString()} so'm*.` +
        (result.autoCompleted
            ? `\n💰 *${(locked.sellerProceeds ?? 0).toLocaleString()} so'm* hisobingizga tushdi (skin xaridorga avtomatik yetkaziladi).`
            : `\nXaridorning trade linkiga skinni yuboring.`),
        tgSendMessage);
    res.json(enrichTrade(locked));
});

// POST /api/market/:id/cancel — sotuvchi hali sotilmagan e'lonni bekor qiladi.
app.post("/api/market/:id/cancel", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    await refresh("trades").catch(() => {});
    const trade = tradeManager.getTradeById(Number(req.params.id));
    if (!trade || trade.kind !== "market") return res.status(404).json({ error: "not_found" });
    if (trade.sellerId !== u.id) return res.status(400).json({ error: "forbidden" });
    if (trade.status !== "open") return res.status(400).json({ error: "wrong_state" });
    const result = tradeManager.cancelTrade(trade.id, u.id);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(enrichTrade(result.trade));
});

// ── Skin sotish (Instant Sell) ───────────────────────────────────────────────
// Bizning (bot) trade linkimiz — user skinni shu linkga O'ZI yuboradi.
// Admin panel > Sozlamalar'dan o'zgartiriladi, bo'lmasa .env'dagi qiymat.
function getBotTradeUrl() {
    return getSettings().botTradeUrl || process.env.BOT_STEAM_TRADE_URL || null;
}

// Telegram (eski) Markdown'ini buzadigan belgilarni qochiradi — user nomida
// "_" yoki "*" bo'lsa xabar umuman yuborilmay qolardi.
function mdEscape(text) {
    return String(text).replace(/([_*`\[])/g, "\\$1");
}

// Skin sotish inventari. Vercel IP'si Steam'da bloklangan: STEAMAPIS_KEY bo'lsa
// SteamApis orqali to'g'ridan-to'g'ri (steam.js steamApisGet), aks holda VPS'dagi
// inventory-worker orqali (inventoryBridge.js).
// Har safar Steam'dan YANGI inventar olinadi — eski nusxa yoki zaxira
// ko'rsatilmaydi. SteamApis vaqtincha xato bersa (code 305 / 5xx / tarmoq),
// 2 marta qayta uriniladi; baribir bo'lmasa — xato userga ko'rsatiladi.
async function getSellInventory(steamId64, force, token, { maxAgeMs } = {}) {
    // steamwebapi — trade-himoyadagi (yaqinda olingan/qimmat) skinlarni ham
    // beradi; kaliti bo'lsa birinchi shu ishlatiladi. Lekin u sotilmaydigan
    // collectible'larni (medal, graffiti, coin) BERMAYDI — ularni ko'rsatish
    // uchun community (SteamApis) inventaridan qo'shib qo'yamiz (best-effort).
    if (process.env.STEAMWEBAPI_KEY) {
        // Ikkala manba parallel so'raladi (ketma-ket emas).
        const commPromise = process.env.STEAMAPIS_KEY ? fetchCommunityInventory(steamId64, force, steamApisGet) : null;
        commPromise?.catch(() => {}); // xato pastda ushlanadi; steamwebapi xato bersa "unhandled" bo'lmasin
        const items = await steamWebApiInventory(steamId64, force);
        if (commPromise) {
            try {
                const comm = await commPromise;
                const have = new Set(items.map(i => String(i.assetId)));
                for (const it of comm) if (it.sellable === false && !have.has(String(it.assetId))) items.push(it);
            } catch (err) { console.log("SELL INVENTORY merge (community) ERROR:", err.message); }
        }
        return items;
    }
    if (!process.env.STEAMAPIS_KEY) return inventoryBridge.requestInventory(steamId64, { force, token, maxAgeMs }, inventoryBridge.mongoDeps());
    try {
        return await fetchCommunityInventory(steamId64, force, steamApisGet, { token });
    } catch (err) {
        console.log("SELL INVENTORY (SteamApis) ERROR:", steamId64, err.message);
        // Vaqtinchalik xato (Steam/SteamApis javob bermadi, tarmoq) — 2 marta qayta urinamiz.
        if (!/javob bermayapti|fetch failed|abort|timeout/i.test(err.message)) throw err;
        for (const wait of [1500, 3500]) {
            await new Promise((r) => setTimeout(r, wait));
            try { return await fetchCommunityInventory(steamId64, true, steamApisGet, { token }); }
            catch (e2) { console.log("SELL INVENTORY retry ERROR:", steamId64, e2.message); if (wait === 3500) throw e2; }
        }
    }
}

// Skin sotish inventari relay'siz steamcommunity'dan keladi (bot orqali —
// inventoryBridge.js) — u yerda Steam'ning o'z market_hash_name'i bor,
// float esa yo'q, shu sabab nom float'dan emas, Steam'dan olinadi.
// Doppler'da narx fazaga bog'liq — narx kaliti buffPrice.priceKey (nom + faza).
function sellItemView(it, prices) {
    const marketHashName = it.marketHashName || skinUtils.marketHashName(it.name, it.float);
    const phase = it.phase || null;
    const priceKey = buffPrice.priceKey(marketHashName, phase);
    const priceSom = prices ? prices.get(priceKey) ?? null : null;
    return {
        assetId: String(it.assetId), name: phase ? `${it.name} · ${phase}` : it.name, marketHashName, phase, priceKey,
        imageUrl: it.image || null, float: it.float ?? null,
        wear: it.wear ?? skinUtils.wearCode(it.float),
        rarity: it.rarity ?? null,
        tradable: it.tradable !== false && it.sellable !== false,
        sellable: it.sellable !== false,
        lockedUntil: it.lockedUntil || null,
        lockMaxUntil: it.lockMaxUntil || null,
        priceSom,
    };
}

// GET /api/instant-sell/quote — userning Steam inventari + har bir skin uchun
// biz to'laydigan narx. Lis kaliti yo'q bo'lsa — `lisConfigured:false`,
// narxlar null (UI "Tez orada ishga tushadi" ko'rsatadi).
app.get("/api/instant-sell/quote", auth, inventoryLimiter, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const base = {
        lisConfigured: lisSkinsPrice.isLisConfigured(),
        maxItems: instantSellManager.MAX_ITEMS_PER_REQUEST,
        botTradeUrl: getBotTradeUrl(),
        holdMs: instantSellManager.SELL_HOLD_MS,
    };
    if (!u.steamId64) return res.json({ ...base, steamConnected: false, items: [] });

    // BUFF narx fayli va Lis egasi narxlari inventar bilan PARALLEL yuklanadi
    // (har biri baribir har so'rovda yangidan — faqat bir-birini kutmaydi).
    const feedPromise = base.lisConfigured ? buffPrice.loadFeed() : null;
    feedPromise?.catch(() => {}); // xato getBuffPricesUsd'da ushlanadi
    const ownerPromise = lisAutosell.getOwnerPricesSom(u.steamId64, lisSkinsPrice.getUsdToSomRate()).catch(() => null);

    let items;
    // Har ochilish/yangilashda Steam'dan YANGI inventar (user talabi, 2026-10-22) —
    // keshdagi eski holat (qulf ochilmagan, yangi skin yo'q) ko'rsatilmaydi.
    try { items = await getSellInventory(u.steamId64, true, u.steamInvToken || null); }
    catch (err) { return res.status(500).json({ error: err.message }); }

    let prices = null;
    let tooCheap = new Map();
    if (base.lisConfigured) {
        // Qulfdagi skinlarning ham narxi ko'rsatiladi (tanlab bo'lmaydi, lekin qiymati ko'rinadi).
        const names = [...new Set(items.filter(it => it.sellable !== false).map(it => sellItemView(it, null).priceKey))];
        try { ({ prices, tooCheap } = await lisSkinsPrice.getInstantSellQuotesSom(names, { feedPromise })); }
        catch (err) { console.log("LIS PRICE ERROR:", err.message); }
    }
    // Lis cookie egasi — Lis avtosell narxining o'zi (lisAutosell.ownerPricesSom).
    const ownerPrices = await ownerPromise;
    const minSom = lisSkinsPrice.minSellSom();
    res.json({
        ...base, steamConnected: true, lisAutosellPrices: !!ownerPrices, minSellUsd: lisSkinsPrice.MIN_SELL_USD,
        // Arzon skinlar (cheapPriceSom) faqat jami bulkSellSom dan oshgan sotuvda tanlanadi.
        bulkSellUsd: lisSkinsPrice.BULK_SELL_USD, bulkSellSom: lisSkinsPrice.bulkSellSom(),
        items: items.map(it => {
            const v = sellItemView(it, prices);
            const own = ownerPrices?.get(v.assetId);
            if (own) return own < minSom ? { ...v, priceSom: null, tooCheap: true, cheapPriceSom: own } : { ...v, priceSom: own };
            return tooCheap.has(v.priceKey) ? { ...v, tooCheap: true, cheapPriceSom: tooCheap.get(v.priceKey) } : v;
        }),
        // Steam yashirgan (trade-himoyasidagi) skinlar soni + token holati.
        hiddenCount: communityInventoryMeta(u.steamId64).hiddenCount,
        hasInvToken: !!u.steamInvToken,
        // Avtomatik trade offer: bot akkaunti ulangan va userning trade havolasi.
        tradeOfferReady: await isTradeOfferReady(),
        tradeBot: await getTradeBotProfile(),
        steamTradeUrl: u.steamTradeUrl || null,
    });
});

// Trade akkaunt ulangan va sessiyasi xatosiz bo'lsa — bot offer yubora oladi.
// Bot tirikligi ham shart (tradeBotHeartbeat): bot o'chiq bo'lsa offer navbatda
// osilib qolardi — u holda sotuv eski qo'lda oqim bilan yaratiladi.
async function isTradeOfferReady() {
    try {
        const [acc, hb] = await Promise.all([
            tradeAccountBridge.getAccount(tradeAccountBridge.mongoDeps()),
            readDoc(tradeOfferView.HEARTBEAT_ID),
        ]);
        return !!acc && !acc.lastError && tradeOfferView.isBotAlive(hb);
    } catch { return false; }
}

// Trade offer yuboradigan bot akkauntining Steam profili (sotuvchiga "offer kimdan
// keladi" deb ko'rsatiladi — firibgarlarning soxta offeridan ajratish uchun).
// Steam'da ko'rinadigan nom — login emas, profil nomi; 1 soat keshlanadi.
const TRADE_BOT_PROFILE_TTL_MS = 60 * 60 * 1000;
let tradeBotProfileCache = { key: null, at: 0, value: null };
async function getTradeBotProfile() {
    // Kesh steamId64 bo'yicha: admin trade akkauntni almashtirsa — yangi profil olinadi,
    // uzsa — null (yo'riqnoma yashiriladi).
    let acc = null;
    try {
        acc = await tradeAccountBridge.getAccount(tradeAccountBridge.mongoDeps());
        if (!acc?.steamId64) return null;
        const c = tradeBotProfileCache;
        if (c.key === acc.steamId64 && Date.now() - c.at < TRADE_BOT_PROFILE_TTL_MS) return c.value;
        const r = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${process.env.STEAM_API_KEY}&steamids=${acc.steamId64}`, { signal: AbortSignal.timeout(4000) });
        const p = (await r.json())?.response?.players?.[0];
        const value = {
            steamId64: acc.steamId64,
            name: p?.personaname || null,
            avatar: p?.avatarmedium || null,
            profileUrl: `https://steamcommunity.com/profiles/${acc.steamId64}/`,
            joinedAt: p?.timecreated ? new Date(p.timecreated * 1000).toISOString() : null,
        };
        tradeBotProfileCache = { key: acc.steamId64, at: Date.now(), value };
        return value;
    } catch (err) {
        console.log("TRADE BOT PROFILE ERROR:", err.message);
        // Steam javob bermadi — faqat SHU akkauntning eski profili; bo'lmasa nomsiz, lekin to'g'ri havola.
        if (!acc?.steamId64) return null;
        if (tradeBotProfileCache.key === acc.steamId64) return tradeBotProfileCache.value;
        return { steamId64: acc.steamId64, name: null, avatar: null, profileUrl: `https://steamcommunity.com/profiles/${acc.steamId64}/`, joinedAt: null };
    }
}

// Userning saqlangan trade havolasi offer uchun yaroqlimi: o'z Steam akkaunti
// va boshqa AchiDrop userida shu Steam akkauntning havolasi yo'q.
function usableTradeUrl(u) {
    if (!u.steamTradeUrl || !u.steamId64) return null;
    const v = validateTradeUrlFor(u.steamTradeUrl, u.steamId64);
    if (!v.ok || tradeUrlOwner(getUsers(), u.steamId64, u.id) != null) return null;
    return v.url;
}

// POST /api/steam-trade-url — { url } — userning Steam trade havolasi (bot
// shu havolaga avtomatik trade offer yuboradi). "" — o'chiradi.
app.post("/api/steam-trade-url", auth, sensitiveLimiter, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    if (!u.steamId64) return res.status(400).json({ error: "Avval Steam hisobingizni ulang" });
    const raw = String(req.body.url ?? "").trim();
    let url = null;
    if (raw) {
        const v = validateTradeUrlFor(raw, u.steamId64);
        if (!v.ok) return res.status(400).json({ error: v.error });
        await refresh("users").catch(() => {});
        if (tradeUrlOwner(getUsers(), u.steamId64, u.id) != null) {
            return res.status(409).json({ error: "Bu Steam akkauntning trade havolasi boshqa AchiDrop akkauntiga ulangan. Qo'llab-quvvatlashga yozing." });
        }
        url = v.url;
    }
    const arr = getUsers();
    const user = arr.find(x => x.id === u.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.steamTradeUrl = url;
    saveUsers(arr);
    res.json({ success: true, steamTradeUrl: url });
});

// POST /api/steam-inv-token — { token } — Steam inventar access-token'i.
// Berilsa trade-himoyasidagi skinlar ham ko'rinadi (getSellInventory).
// bo'sh "" — tokenni o'chiradi. Token oddiy API kalit kabi saqlanadi.
app.post("/api/steam-inv-token", auth, sensitiveLimiter, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const raw = String(req.body.token ?? "").trim();
    if (raw && !/^[A-Za-z0-9_-]{6,64}$/.test(raw)) return res.status(400).json({ error: "Token formati noto'g'ri" });
    const arr = getUsers();
    const user = arr.find(x => x.id === u.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.steamInvToken = raw || null;
    saveUsers(arr);
    res.json({ success: true, hasInvToken: !!raw });
});

// POST /api/instant-sell — { assetIds: [...] } — tanlangan skinlarni sotish
// so'rovi. Pul DARHOL tushmaydi: user skinni trade linkimizga yuboradi,
// admin Telegram'da "Oldim"ni bosgach tushadi.
const SELL_CHECK_INV_MAX_AGE_MS = 15 * 60 * 1000;
const { sellAdminMessages } = require("./sellAdminNotify");
const { notifyWithdrawRequest } = require("./withdrawBot");
const INSTANT_SELL_ERRORS = {
    no_key: "Skin sotish tez orada ishga tushadi",
    empty: "Hech qanday skin tanlanmagan",
    too_many: "Bir martada ko'pi bilan 30 ta skin sotish mumkin",
    too_many_open: "Sizda tasdiqlanmagan so'rovlar ko'p. Admin ko'rib chiqishini kuting",
    already_requested: "Bu skin(lar) uchun so'rov allaqachon yuborilgan",
    price_not_found: "Ba'zi skinlarning narxi topilmadi",
    too_cheap: `Narxi $${lisSkinsPrice.MIN_SELL_USD} dan arzon skinlarni faqat jami $${lisSkinsPrice.BULK_SELL_USD} dan ko'p sotuvda sotish mumkin`,
    not_tradable: "Ba'zi skinlarni hozir yuborib bo'lmaydi (trade lock)",
    not_found: "Skin inventaringizda topilmadi (sahifani yangilang)",
    need_trade_url: "Avval Steam trade havolangizni kiriting",
};
app.post("/api/instant-sell", auth, sensitiveLimiter, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    if (!u.steamId64) return res.status(400).json({ error: "Avval Steam hisobingizni ulang" });
    if (!lisSkinsPrice.isLisConfigured()) return res.status(400).json({ error: INSTANT_SELL_ERRORS.no_key, code: "no_key" });
    // Trade havola majburiy — bot offerni shu havolaga yuboradi.
    if (!usableTradeUrl(u)) return res.status(400).json({ error: INSTANT_SELL_ERRORS.need_trade_url, code: "need_trade_url" });

    const raw = Array.isArray(req.body.assetIds) ? req.body.assetIds : (req.body.assetId ? [req.body.assetId] : []);
    const assetIds = [...new Set(raw.map(String))];
    if (!assetIds.length) return res.status(400).json({ error: INSTANT_SELL_ERRORS.empty, code: "empty" });
    if (assetIds.length > instantSellManager.MAX_ITEMS_PER_REQUEST) return res.status(400).json({ error: INSTANT_SELL_ERRORS.too_many, code: "too_many" });

    let inv;
    // Sahifa ochilganda olingan inventar (15 daqiqagacha) — Steam'ga qayta so'rov
    // yubormaymiz; admin baribir Steam'da skin kelganini tekshirib "Oldim"ni bosadi.
    try { inv = await getSellInventory(u.steamId64, false, u.steamInvToken || null, { maxAgeMs: SELL_CHECK_INV_MAX_AGE_MS }); }
    catch (err) { return res.status(500).json({ error: err.message }); }
    const byId = new Map(inv.map(it => [String(it.assetId), it]));
    const notFound = assetIds.filter(a => !byId.has(a));
    if (notFound.length) return res.status(400).json({ error: INSTANT_SELL_ERRORS.not_found, code: "not_found", assetIds: notFound });
    const locked = assetIds.filter(a => byId.get(a).tradable === false || byId.get(a).sellable === false);
    if (locked.length) return res.status(400).json({ error: INSTANT_SELL_ERRORS.not_tradable, code: "not_tradable", assetIds: locked });

    const items = assetIds.map(a => {
        const v = sellItemView(byId.get(a), null);
        return { assetId: v.assetId, marketHashName: v.marketHashName, priceKey: v.priceKey, phase: v.phase, name: v.name, imageUrl: v.imageUrl, float: v.float };
    });

    let result;
    const priceByAsset = await lisAutosell.getOwnerPricesSom(u.steamId64, lisSkinsPrice.getUsdToSomRate());
    // Trade akkaunt ulangan va userning trade havolasi yaroqli — bot offer yuboradi.
    const tradeUrl = (await isTradeOfferReady()) ? usableTradeUrl(u) : null;
    try { result = await instantSellManager.createSellRequest(u.id, items, { priceByAsset, tradeOffer: tradeUrl ? { tradeUrl } : null }); }
    catch (err) { return res.status(500).json({ error: err.message }); }
    if (result.error) {
        return res.status(400).json({ error: INSTANT_SELL_ERRORS[result.error] || result.error, code: result.error, assetIds: result.assetIds });
    }
    // Adminga xabar hozir EMAS — user "Skinni yubordim"ni bosganda (/api/instant-sell/sent).
    const { requests } = result;
    res.json({ request: groupView(requests), requests: requests.map(publicRequest), botTradeUrl: getBotTradeUrl(), tradeOffer: tradeUrl ? "queued" : null });
});

// Userga/adminga qaytariladigan so'rov: tradeOffer ichidagi trade havola (token) chiqmaydi.
function publicRequest(r) {
    if (!r.tradeOffer) return r;
    return { ...r, tradeOffer: tradeOfferView.viewTradeOffer(r.tradeOffer, r.createdAt) };
}

// Bir sotuvdagi (bitta groupId) skin so'rovlarini UI uchun bitta ko'rinishga yig'adi.
function groupView(requests) {
    return {
        id: requests[0].groupId ?? requests[0].id,
        ids: requests.map(r => r.id),
        items: requests.flatMap(r => r.items),
        totalSom: requests.reduce((n, r) => n + r.totalSom, 0),
        sentAt: requests.every(r => r.sentAt) ? requests[0].sentAt : null,
    };
}

// Har skin uchun adminga ALOHIDA xabar (skin nomi, taxminiy Lis avto narxi,
// o'zining "Oldim"/"Rad etish" tugmalari bilan) — format sellAdminNotify.js'da.
async function notifyAdminsSellSent(u, requests) {
    if (!process.env.ADMIN_ID || !requests.length) return;
    const msgs = await sellAdminMessages(u, requests, `✉️ User skinni yubordim dedi. Steam'da kelganini tekshiring, keyin "Oldim"ni bosing.`);
    // Ketma-ket — 30 ta xabarni birdan yuborib Telegram limitiga urilmaslik uchun.
    for (const m of msgs) await toAdmins((adminId) => tgSendMessage(adminId, m.text, m.keyboard));
}

// POST /api/instant-sell/sent — { ids: [...] } — user skin(lar)ni Steam'da
// yubordi. Shundagina adminga har skin uchun alohida xabar ketadi.
app.post("/api/instant-sell/sent", auth, sensitiveLimiter, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter(Number.isFinite);
    if (!ids.length || ids.length > instantSellManager.MAX_ITEMS_PER_REQUEST) return res.status(400).json({ error: "So'rov topilmadi" });
    let result;
    try { result = await instantSellManager.markSent(u.id, ids); }
    catch (err) { return res.status(500).json({ error: err.message }); }
    try { await notifyAdminsSellSent(u, result.requests); }
    catch (err) { console.log("SELL SENT NOTIFY ERROR:", err.message); }
    res.json({ marked: result.requests.length, sentAt: result.requests[0]?.sentAt ?? null });
});

// GET /api/public-stats — ochiq: tasdiqlangan sotuvlar soni/summasi va so'nggi
// sotuvlar (ismlarsiz). Bosh sahifadagi ishonch bloki va lenta uchun.
app.get("/api/public-stats", async (req, res) => {
    await instantSellManager.refreshRequests();
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(instantSellManager.publicStats(instantSellManager.getAllRequests()));
});

// GET /api/instant-sell-mine — mening sotish so'rovlarim
app.get("/api/instant-sell-mine", auth, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    await instantSellManager.refreshRequests();
    res.json(instantSellManager.getMyInstantSellRequests(u.id).slice(0, 20).map(publicRequest));
});

// GET /api/trade-hold-summary — obmendan tushgan (7 kunlik hold) mablag'lar
app.get("/api/trade-hold-summary", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json(balanceManager.getHoldSummary(u.id));
});

// POST /api/trade-withdraw — { cardNumber } orqali yechib olish so'rovi
app.post("/api/trade-withdraw", auth, sensitiveLimiter, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const cardNumber = String(req.body.cardNumber || "").replace(/[\s-]/g, "");
    if (!/^\d{16}$/.test(cardNumber)) return res.status(400).json({ error: "Karta raqami 16 ta raqamdan iborat bo'lishi kerak" });

    let result;
    try { result = await balanceManager.requestWithdrawal(u.id, cardNumber); }
    catch (err) { return res.status(500).json({ error: err.message }); }
    if (result.error) return res.status(400).json({ error: "Hozircha yechib olish mumkin bo'lgan mablag' yo'q" });
    const { request } = result;

    // Alohida "pul yechish" botiga (WITHDRAW_BOT_TOKEN) — backend/withdrawBot.js.
    if (process.env.ADMIN_ID) await notifyWithdrawRequest(u, request);
    res.json({ request });
});

// POST /api/withdraw-promo — { code } — "Pul yechish" promo kodi muzlatilgan
// mablag'ning bir qismini darhol yechib olsa bo'ladigan qiladi (balanceManager.unlockWithPromo).
app.post("/api/withdraw-promo", auth, promoCheckLimiter, async (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    let result;
    try { result = await balanceManager.unlockWithPromo(u.id, req.body.code); }
    catch (err) { return res.status(500).json({ error: err.message }); }
    if (result.error) {
        const map = { already_used: "promo_already_used", exhausted: "promo_exhausted", nothing_frozen: "promo_nothing_frozen" };
        return res.status(400).json({ error: map[result.error] || "promo_not_found" });
    }
    res.json({ unlocked: result.unlocked, hold: balanceManager.getHoldSummary(u.id) });
});

// GET /api/leaderboard
app.get("/api/leaderboard", auth, (req, res) => {
    const top = getUsers()
        .filter(u => (u.wins || []).length > 0)
        .sort((a, b) => (b.wins || []).length - (a.wins || []).length)
        .slice(0, 10)
        .map((u, i) => ({ rank: i + 1, id: u.id, name: u.name, wins: (u.wins || []).length }));
    res.json(top);
});

// ── Reyting (umumiy + konkurs) — backend/rating.js ──────────────────────────
async function ratingContext() {
    await Promise.all([refresh("rating").catch(() => {}), instantSellManager.refreshRequests().catch(() => {})]);
    const cfg = rating.normalizeConfig(read("rating"));
    const sales = rating.collectSales({
        instantSell: instantSellManager.getAllRequests(),
        trades: (() => { const t = read("trades"); return Array.isArray(t) ? t : Object.values(t || {}); })(),
        excludeUser: isAdminId,
    });
    return { cfg, sales };
}
function saveRatingConfig(cfg) { write("rating", cfg); }

function publicContest(c, now = Date.now()) {
    if (!c) return null;
    return {
        id: c.id, title: c.title, prize: c.prize || "", prizes: Array.isArray(c.prizes) ? c.prizes : [],
        startAt: c.startAt, endAt: c.endAt || null, closedAt: c.closedAt || null,
        state: rating.contestState(c, now),
        xpPerSale: rating.contestCfg(c).xpPerSale, xpPer1000Som: rating.contestCfg(c).xpPer1000Som,
    };
}

// scope: "general" | contest obyekti. includeVolume — faqat admin uchun.
function buildRanking(cfg, sales, scope, { includeVolume = false } = {}) {
    const isGeneral = scope === "general";
    const tallyCfg = isGeneral ? cfg.general : rating.contestCfg(scope);
    const win = isGeneral ? {} : rating.contestWindow(scope);
    const ranked = rating.rank(rating.tally(sales, tallyCfg, win));
    // Daraja (ramka) doim UMUMIY XP bo'yicha — konkurs ro'yxatida ham.
    const generalXp = isGeneral ? null : rating.tally(sales, cfg.general);
    const users = getUsers();
    const byId = new Map(users.map(u => [String(u.id), u]));
    return ranked.map(r => {
        const u = byId.get(String(r.userId));
        const row = {
            rank: r.rank, id: r.userId,
            name: u?.name || u?.steamUsername || "Foydalanuvchi",
            avatar: u?.steamAvatar ?? null,
            xp: r.xp, sales: r.sales,
        };
        const gxp = isGeneral ? r.xp : (generalXp.get(String(r.userId))?.xp || 0);
        row.tier = rating.tierInfo(gxp, cfg.general.tierMins).tier;
        if (includeVolume) row.volume = r.volume;
        return row;
    });
}

// GET /api/rating?type=general|contest — ochiq (login shart emas), top 50 + o'zim
app.get("/api/rating", optionalAuth, async (req, res) => {
    const { cfg, sales } = await ratingContext();
    const type = req.query.type === "contest" ? "contest" : "general";
    const me = req.user;
    let scope = "general", contest = null;
    if (type === "contest") {
        const c = rating.currentContest(cfg.contests);
        if (!c) return res.json({ type, contest: null, top: [], me: null });
        scope = c; contest = publicContest(c);
    }
    const all = buildRanking(cfg, sales, scope);
    let mine = null;
    if (me) {
        mine = all.find(r => String(r.id) === String(me.id)) || {
            rank: null, id: me.id, name: me.name || me.steamUsername || "", avatar: me.steamAvatar ?? null, xp: 0, sales: 0,
        };
        // Daraja doim umumiy XP bo'yicha (konkursda ham ramka o'sha darajaniki).
        const generalXp = scope === "general" ? mine.xp
            : (rating.tally(sales, cfg.general).get(String(me.id))?.xp || 0);
        mine = { ...mine, generalXp, ...rating.tierInfo(generalXp, cfg.general.tierMins) };
    }
    res.json({
        type, contest,
        rules: scope === "general"
            ? { xpPerSale: cfg.general.xpPerSale, xpPer1000Som: cfg.general.xpPer1000Som }
            : { xpPerSale: contest.xpPerSale, xpPer1000Som: contest.xpPer1000Som },
        participants: all.length,
        tiers: rating.TIER_KEYS.map((key, i) => ({ key, minXp: cfg.general.tierMins[i] })),
        top: all.slice(0, 50),
        me: mine,
    });
});

// ── ADMIN: Reyting ────────────────────────────────────────────────────────────
app.get("/api/admin/rating", requireAdminPanel, async (req, res) => {
    const { cfg, sales } = await ratingContext();
    const scopeId = req.query.scope || "general";
    let scope = "general";
    if (scopeId !== "general") {
        scope = cfg.contests.find(c => String(c.id) === String(scopeId));
        if (!scope) return res.status(404).json({ error: "Konkurs topilmadi" });
    }
    const contests = [...cfg.contests]
        .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))
        .map(c => ({ ...publicContest(c), participants: buildRanking(cfg, sales, c).length }));
    res.json({
        general: { xpPerSale: cfg.general.xpPerSale, xpPer1000Som: cfg.general.xpPer1000Som, tierMins: cfg.general.tierMins },
        contests,
        scope: scopeId,
        adjustments: scope === "general" ? cfg.general.adjustments : (scope.adjustments || {}),
        ranking: buildRanking(cfg, sales, scope, { includeVolume: true }).slice(0, 200),
    });
});

function parseXpRules(body, target) {
    for (const k of ["xpPerSale", "xpPer1000Som"]) {
        if (body[k] === undefined) continue;
        const n = Number(body[k]);
        if (!Number.isFinite(n) || n < 0 || n > 1e6) return `${k} 0 dan katta raqam bo'lishi kerak`;
        target[k] = n;
    }
    return null;
}
function parseDate(v) {
    if (v === null || v === "") return null;
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}
function parsePrizes(v) {
    if (!Array.isArray(v)) return undefined;
    return v.map(p => String(p ?? "").trim().slice(0, 120)).filter(Boolean).slice(0, 10);
}

app.post("/api/admin/rating/general", requireAdminPanel, async (req, res) => {
    const { cfg } = await ratingContext();
    const err = parseXpRules(req.body, cfg.general);
    if (err) return res.status(400).json({ error: err });
    if (req.body.tierMins !== undefined) {
        const mins = rating.normalizeTierMins(req.body.tierMins);
        if (!mins) return res.status(400).json({ error: "Daraja chegaralari noto'g'ri: 6 ta, birinchisi 0, o'sish tartibida" });
        cfg.general.tierMins = mins;
    }
    saveRatingConfig(cfg);
    res.json({ ok: true, general: cfg.general });
});

// Yangi konkurs — startAt bo'sh bo'lsa hozirdan; startAt'gacha bo'lgan sotuvlar
// sanalmaydi, ya'ni hamma 0 XP dan boshlaydi.
app.post("/api/admin/rating/contests", requireAdminPanel, async (req, res) => {
    const { cfg } = await ratingContext();
    const title = String(req.body.title || "").trim().slice(0, 80);
    if (!title) return res.status(400).json({ error: "Konkurs nomini kiriting" });
    const startAt = req.body.startAt ? parseDate(req.body.startAt) : new Date().toISOString();
    const endAt = req.body.endAt ? parseDate(req.body.endAt) : null;
    if (!startAt || endAt === undefined) return res.status(400).json({ error: "Sana noto'g'ri" });
    if (endAt && Date.parse(endAt) <= Date.parse(startAt)) return res.status(400).json({ error: "Tugash sanasi boshlanishdan keyin bo'lishi kerak" });
    if (cfg.contests.some(c => rating.contestState(c) !== "finished"))
        return res.status(400).json({ error: "Faol yoki rejalashtirilgan konkurs bor — avval uni yoping" });
    const c = {
        id: Date.now(), title, prize: String(req.body.prize || "").trim().slice(0, 200),
        prizes: parsePrizes(req.body.prizes) || [],
        startAt, endAt, closedAt: null,
        xpPerSale: rating.DEFAULT_GENERAL.xpPerSale, xpPer1000Som: rating.DEFAULT_GENERAL.xpPer1000Som,
        adjustments: {}, createdAt: new Date().toISOString(),
    };
    const err = parseXpRules(req.body, c);
    if (err) return res.status(400).json({ error: err });
    cfg.contests.push(c);
    saveRatingConfig(cfg);
    res.json({ ok: true, contest: publicContest(c) });
});

app.post("/api/admin/rating/contests/:id", requireAdminPanel, async (req, res) => {
    const { cfg } = await ratingContext();
    const c = cfg.contests.find(x => String(x.id) === req.params.id);
    if (!c) return res.status(404).json({ error: "Konkurs topilmadi" });
    if (req.body.title !== undefined) {
        const title = String(req.body.title || "").trim().slice(0, 80);
        if (!title) return res.status(400).json({ error: "Konkurs nomini kiriting" });
        c.title = title;
    }
    if (req.body.prize !== undefined) c.prize = String(req.body.prize || "").trim().slice(0, 200);
    const prizes = parsePrizes(req.body.prizes);
    if (prizes) c.prizes = prizes;
    if (req.body.endAt !== undefined) {
        const endAt = parseDate(req.body.endAt);
        if (endAt === undefined) return res.status(400).json({ error: "Sana noto'g'ri" });
        if (endAt && Date.parse(endAt) <= Date.parse(c.startAt)) return res.status(400).json({ error: "Tugash sanasi boshlanishdan keyin bo'lishi kerak" });
        c.endAt = endAt;
    }
    const err = parseXpRules(req.body, c);
    if (err) return res.status(400).json({ error: err });
    saveRatingConfig(cfg);
    res.json({ ok: true, contest: publicContest(c) });
});

app.post("/api/admin/rating/contests/:id/close", requireAdminPanel, async (req, res) => {
    const { cfg } = await ratingContext();
    const c = cfg.contests.find(x => String(x.id) === req.params.id);
    if (!c) return res.status(404).json({ error: "Konkurs topilmadi" });
    if (!c.closedAt) c.closedAt = new Date().toISOString();
    saveRatingConfig(cfg);
    res.json({ ok: true, contest: publicContest(c) });
});

app.delete("/api/admin/rating/contests/:id", requireAdminPanel, async (req, res) => {
    const { cfg } = await ratingContext();
    const before = cfg.contests.length;
    cfg.contests = cfg.contests.filter(x => String(x.id) !== req.params.id);
    if (cfg.contests.length === before) return res.status(404).json({ error: "Konkurs topilmadi" });
    saveRatingConfig(cfg);
    res.json({ ok: true });
});

// Qo'lda XP qo'shish/ayirish: { scope: "general" | contestId, userId, delta }
app.post("/api/admin/rating/adjust", requireAdminPanel, async (req, res) => {
    const { cfg } = await ratingContext();
    const delta = Math.round(Number(req.body.delta));
    const userId = Number(req.body.userId);
    if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: "XP miqdori noto'g'ri" });
    if (!getUsers().some(u => u.id === userId)) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    let target;
    if (!req.body.scope || req.body.scope === "general") target = cfg.general;
    else target = cfg.contests.find(c => String(c.id) === String(req.body.scope));
    if (!target) return res.status(404).json({ error: "Konkurs topilmadi" });
    if (!target.adjustments || typeof target.adjustments !== "object") target.adjustments = {};
    const next = (Number(target.adjustments[userId]) || 0) + delta;
    if (next) target.adjustments[userId] = next; else delete target.adjustments[userId];
    saveRatingConfig(cfg);
    res.json({ ok: true, adjustment: next });
});

// GET /api/bid-history
app.get("/api/bid-history", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const bids = (read("bids") || []).filter(b => b.userId === u.id).slice(-20).reverse();
    res.json(bids);
});

// GET /api/balance-history
app.get("/api/balance-history", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json((u.balanceHistory || []).slice(-100).reverse());
});

// GET /api/notifications — saytdagi bildirishnomalar (Steam-only foydalanuvchilar
// uchun Telegram DM o'rnini bosadi, Telegram foydalanuvchilar uchun ham qo'shimcha ko'rinish)
app.get("/api/notifications", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const list = (read("notifications") || []).filter(n => n.userId === u.id).slice(-30).reverse();
    res.json(list);
});

// POST /api/notifications/:id/read
app.post("/api/notifications/:id/read", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const list = read("notifications") || [];
    const n = list.find(x => x.id === req.params.id && x.userId === u.id);
    if (!n) return res.status(404).json({ error: "Topilmadi" });
    n.read = true;
    write("notifications", list);
    res.json({ success: true });
});

// POST /api/notifications/clear — foydalanuvchining barcha bildirishnomalarini o'chiradi
app.post("/api/notifications/clear", auth, (req, res) => {
    const u = req.user;
    if (!u) return res.status(404).json({ error: "User not found" });
    const list = read("notifications") || [];
    write("notifications", list.filter(n => n.userId !== u.id));
    res.json({ success: true });
});

// GET /api/image/:fileId — proxy Telegram images
app.get("/api/image/:fileId", async (req, res) => {
    try {
        const token   = process.env.BOT_TOKEN;
        const fileId  = req.params.fileId;
        if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) return res.status(404).send("Not found");
        const apiResp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
        const data    = await apiResp.json();
        if (!data.ok) return res.status(404).send("Not found");
        // Redirect EMAS: Telegram fayl manzili bot tokenini o'z ichiga oladi —
        // brauzerga yo'naltirilsa token oshkor bo'lardi. Server o'zi olib uzatadi.
        const file = await fetch(`https://api.telegram.org/file/bot${token}/${data.result.file_path}`);
        if (!file.ok) return res.status(404).send("Not found");
        res.setHeader("Content-Type", file.headers.get("content-type") || "application/octet-stream");
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.send(Buffer.from(await file.arrayBuffer()));
    } catch {
        res.status(500).send("Error");
    }
});

// ── Admin Panel autentifikatsiyasi (username/parol, Telegram/Steam'dan mustaqil) ──

// POST /api/admin/login — Admin Panel'ning o'z login/parol formasi
app.post("/api/admin/login", adminLoginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    const account = await verifyAdminCredentials(username, password);
    if (account?.locked) {
        const mins = Math.ceil(account.retryAfterMs / 60000);
        return res.status(429).json({ error: `Ko'p noto'g'ri urinish — akkaunt vaqtincha qulflandi. ${mins} daqiqadan keyin qayta urinib ko'ring.` });
    }
    if (!account) return res.status(401).json({ error: "Login yoki parol xato" });
    const token = await createAdminSession(account.id);
    setAdminSessionCookie(res, token);
    res.json({ success: true, role: account.role });
});

// POST /api/admin/logout
app.post("/api/admin/logout", async (req, res) => {
    await destroyAdminSession(getAdminSessionToken(req));
    clearAdminSessionCookie(res);
    res.json({ success: true });
});

// GET /api/admin/session — Admin Panel ochilganda login ekranini ko'rsatish
// kerakmi yo'qmi (va CEO menyusini ko'rsatish kerakmi) shuni tekshirish uchun
// (401 emas, har doim 200 qaytaradi).
app.get("/api/admin/session", async (req, res) => {
    const session = await getAdminSession(getAdminSessionToken(req));
    res.json({ loggedIn: !!session, role: session?.role || null });
});

// ── CEO — admin akkauntlarini boshqarish (faqat role:"ceo") ──────────────────

// GET /api/admin/accounts
app.get("/api/admin/accounts", requireCeo, async (req, res) => {
    res.json(await listAdminAccounts());
});

// POST /api/admin/accounts — yangi admin (yoki ceo) akkaunt qo'shish
app.post("/api/admin/accounts", requireCeo, async (req, res) => {
    const { username, password, role } = req.body || {};
    const result = await createAdminAccount({ username, password, role });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result.account);
});

// PATCH /api/admin/accounts/:id — active holatini almashtirish yoki parolni yangilash
app.patch("/api/admin/accounts/:id", requireCeo, async (req, res) => {
    const { id } = req.params;
    const { active, password } = req.body || {};

    if (active === false) {
        const accounts = await getAccountsFresh();
        const target = accounts.find(a => a.id === id);
        if (target?.role === "ceo" && countActiveCeos(accounts) <= 1) {
            return res.status(400).json({ error: "Oxirgi faol CEO akkauntini o'chirib bo'lmaydi" });
        }
        if (id === req.adminSession.accountId) {
            return res.status(400).json({ error: "O'zingizni o'chira olmaysiz" });
        }
    }

    if (active !== undefined) {
        const r = await setAdminAccountActive(id, active);
        if (r.error) return res.status(404).json({ error: r.error });
    }
    if (password) {
        const r = await changeAdminAccountPassword(id, password);
        if (r.error) return res.status(400).json({ error: r.error });
    }
    res.json({ success: true });
});

// DELETE /api/admin/accounts/:id
app.delete("/api/admin/accounts/:id", requireCeo, async (req, res) => {
    const { id } = req.params;
    if (id === req.adminSession.accountId) {
        return res.status(400).json({ error: "O'zingizni o'chira olmaysiz" });
    }
    const accounts = await getAccountsFresh();
    const target = accounts.find(a => a.id === id);
    if (target?.role === "ceo" && countActiveCeos(accounts) <= 1) {
        return res.status(400).json({ error: "Oxirgi CEO akkauntini o'chirib bo'lmaydi" });
    }
    const result = await deleteAdminAccount(id);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json({ success: true });
});

// Base64 ichidagi e'lon qilingan "data:image/xxx" MIME turi shunchaki matn —
// buferning o'zi rasm emasligi mumkin. Haqiqiy fayl signature'i (magic bytes)
// orqali tekshiramiz, faqat shu 4 format ruxsat etiladi.
function detectImageType(buffer) {
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
    if (buffer.length >= 6 && buffer.toString("ascii", 0, 6) === "GIF87a") return "gif";
    if (buffer.length >= 6 && buffer.toString("ascii", 0, 6) === "GIF89a") return "gif";
    if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
    return null;
}

// POST /api/admin/upload-image — galereyadan tanlangan rasmni Telegramga yuklab, file_id qaytaradi
app.post("/api/admin/upload-image", requireAdminPanel, async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) return res.status(400).json({ error: "Rasm yuborilmadi" });

        const match = /^data:(image\/\w+);base64,(.+)$/.exec(image);
        if (!match) return res.status(400).json({ error: "Noto'g'ri rasm formati" });

        const buffer = Buffer.from(match[2], "base64");
        if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: "Rasm hajmi 10MB dan katta bo'lmasligi kerak" });
        if (!detectImageType(buffer)) return res.status(400).json({ error: "Fayl haqiqiy rasm emas" });

        const form = new FormData();
        form.append("chat_id", process.env.ADMIN_ID);
        form.append("photo", new Blob([buffer], { type: match[1] }), "auction.jpg");

        const resp = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
        const data = await resp.json();
        if (!data.ok) return res.status(502).json({ error: "Telegramga yuklashda xato" });

        const sizes  = data.result.photo;
        const fileId = sizes[sizes.length - 1].file_id;
        res.json({ success: true, fileId });
    } catch (err) {
        res.status(500).json({ error: "Server xatosi: " + err.message });
    }
});

// ── Reklama bannerlari (Auksionlar sahifasi ustidagi karusel) ────────────────
// `settings.adBanners` — [{id, image}] tartibda saqlanadi (massiv tartibi =
// ko'rsatish tartibi, qayta tartiblash shu massivni almashtiradi). Bo'sh
// bo'lsa frontend o'zining standart (hardcoded) banner-matnini ko'rsatadi.
const BANNER_SIZE = { width: 1600, height: 700 }; // frontend upload paytida ham shu o'lchamni talab qiladi (2026-07-28: balandroq/ko'zga tashlanadigan bo'lishi uchun 500->700)

// Banner bosilganda sayt ichida qayerga o'tkazish mumkinligi — frontend
// router'idagi (App.jsx) sahifa nomlariga mos. "-detail" bilan tugaydiganlari
// qo'shimcha ID (linkData) talab qiladi, qolganlari uchun linkData e'tiborsiz.
const BANNER_LINK_PAGES = ["auctions", "trade", "balance", "leaderboard", "inventory", "auction-detail", "trade-detail"];
const BANNER_LINK_NEEDS_DATA = ["auction-detail", "trade-detail"];

function sanitizeBannerLink(linkPage, linkData) {
    if (!linkPage || !BANNER_LINK_PAGES.includes(linkPage)) return { linkPage: null, linkData: null };
    if (BANNER_LINK_NEEDS_DATA.includes(linkPage)) {
        const id = Number(linkData);
        if (!Number.isFinite(id)) return { linkPage: null, linkData: null };
        return { linkPage, linkData: id };
    }
    return { linkPage, linkData: null };
}

// GET /api/banners — hammaga ochiq (saytning o'zida ko'rsatish uchun)
app.get("/api/banners", optionalAuth, (req, res) => {
    const s = getSettings();
    const banners = Array.isArray(s.adBanners) ? s.adBanners : [];
    res.json({ banners, requiredSize: BANNER_SIZE });
});

// GET /api/admin/banners
app.get("/api/admin/banners", requireAdminPanel, (req, res) => {
    const s = getSettings();
    res.json({ banners: Array.isArray(s.adBanners) ? s.adBanners : [], requiredSize: BANNER_SIZE });
});

// POST /api/admin/banners — { image: fileId, linkPage?, linkData? } (avval /api/admin/upload-image orqali yuklanadi)
app.post("/api/admin/banners", requireAdminPanel, (req, res) => {
    const image = req.body.image;
    if (!image) return res.status(400).json({ error: "Rasm kerak" });
    const s = getSettings();
    if (!Array.isArray(s.adBanners)) s.adBanners = [];
    const banner = { id: Date.now(), image, ...sanitizeBannerLink(req.body.linkPage, req.body.linkData) };
    s.adBanners.push(banner);
    write("settings", s);
    res.json({ success: true, banners: s.adBanners });
});

// PATCH /api/admin/banners/:id — { linkPage?, linkData? } mavjud bannerning havolasini o'zgartirish
app.patch("/api/admin/banners/:id", requireAdminPanel, (req, res) => {
    const s = getSettings();
    const id = Number(req.params.id);
    const banners = Array.isArray(s.adBanners) ? s.adBanners : [];
    const banner = banners.find(b => b.id === id);
    if (!banner) return res.status(404).json({ error: "Banner topilmadi" });
    Object.assign(banner, sanitizeBannerLink(req.body.linkPage, req.body.linkData));
    write("settings", s);
    res.json({ success: true, banners: s.adBanners });
});

// DELETE /api/admin/banners/:id — barchasi o'chirilsa, sayt standart bannerga qaytadi
app.delete("/api/admin/banners/:id", requireAdminPanel, (req, res) => {
    const s = getSettings();
    const id = Number(req.params.id);
    s.adBanners = (Array.isArray(s.adBanners) ? s.adBanners : []).filter(b => b.id !== id);
    write("settings", s);
    res.json({ success: true, banners: s.adBanners });
});

// POST /api/admin/banners/reorder — { order: [id, id, ...] } yangi tartib
app.post("/api/admin/banners/reorder", requireAdminPanel, (req, res) => {
    const order = req.body.order;
    if (!Array.isArray(order)) return res.status(400).json({ error: "order kerak" });
    const s = getSettings();
    const banners = Array.isArray(s.adBanners) ? s.adBanners : [];
    const byId = new Map(banners.map(b => [b.id, b]));
    const reordered = order.map(id => byId.get(Number(id))).filter(Boolean);
    for (const b of banners) if (!reordered.includes(b)) reordered.push(b);
    s.adBanners = reordered;
    write("settings", s);
    res.json({ success: true, banners: s.adBanners });
});

// ── Obmen yo'riqnomalari (Trade link olish / Steam inventarni public qilish) ──
// `settings.guides[key]` — [{id, image}] tartibda, xuddi adBanners kabi (rasm
// /api/admin/upload-image orqali oldindan yuklanadi, bu yerda faqat fileId
// saqlanadi). Xaridor tomonida obmen sahifasidagi yo'riqnoma-wizard shu
// rasmlarni ketma-ket ko'rsatadi.
const GUIDE_KEYS = ["tradeLink", "publicInventory"];
function guideList(s, key) {
    const guides = s.guides && typeof s.guides === "object" ? s.guides : {};
    return Array.isArray(guides[key]) ? guides[key] : [];
}
function saveGuideList(s, key, list) {
    if (!s.guides || typeof s.guides !== "object") s.guides = {};
    s.guides[key] = list;
    write("settings", s);
}

// GET /api/guides/:key — hammaga ochiq (obmen wizard'ida ko'rsatish uchun)
app.get("/api/guides/:key", optionalAuth, (req, res) => {
    if (!GUIDE_KEYS.includes(req.params.key)) return res.status(404).json({ error: "Topilmadi" });
    res.json({ images: guideList(getSettings(), req.params.key) });
});

// GET /api/admin/guides/:key
app.get("/api/admin/guides/:key", requireAdminPanel, (req, res) => {
    if (!GUIDE_KEYS.includes(req.params.key)) return res.status(404).json({ error: "Topilmadi" });
    res.json({ images: guideList(getSettings(), req.params.key) });
});

// POST /api/admin/guides/:key — { image: fileId } (avval /api/admin/upload-image orqali yuklanadi)
app.post("/api/admin/guides/:key", requireAdminPanel, (req, res) => {
    if (!GUIDE_KEYS.includes(req.params.key)) return res.status(404).json({ error: "Topilmadi" });
    const image = req.body.image;
    if (!image) return res.status(400).json({ error: "Rasm kerak" });
    const s = getSettings();
    const list = guideList(s, req.params.key);
    list.push({ id: Date.now(), image });
    saveGuideList(s, req.params.key, list);
    res.json({ success: true, images: list });
});

// PATCH /api/admin/guides/:key/:id — { caption } shu qadam rasmiga izoh qo'shish/o'zgartirish
app.patch("/api/admin/guides/:key/:id", requireAdminPanel, (req, res) => {
    if (!GUIDE_KEYS.includes(req.params.key)) return res.status(404).json({ error: "Topilmadi" });
    const s = getSettings();
    const list = guideList(s, req.params.key);
    const item = list.find(g => g.id === Number(req.params.id));
    if (!item) return res.status(404).json({ error: "Topilmadi" });
    item.caption = String(req.body.caption || "").slice(0, 300) || null;
    saveGuideList(s, req.params.key, list);
    res.json({ success: true, images: list });
});

// DELETE /api/admin/guides/:key/:id
app.delete("/api/admin/guides/:key/:id", requireAdminPanel, (req, res) => {
    if (!GUIDE_KEYS.includes(req.params.key)) return res.status(404).json({ error: "Topilmadi" });
    const s = getSettings();
    const list = guideList(s, req.params.key).filter(g => g.id !== Number(req.params.id));
    saveGuideList(s, req.params.key, list);
    res.json({ success: true, images: list });
});

// POST /api/admin/guides/:key/reorder — { order: [id, id, ...] }
app.post("/api/admin/guides/:key/reorder", requireAdminPanel, (req, res) => {
    if (!GUIDE_KEYS.includes(req.params.key)) return res.status(404).json({ error: "Topilmadi" });
    const order = req.body.order;
    if (!Array.isArray(order)) return res.status(400).json({ error: "order kerak" });
    const s = getSettings();
    const list = guideList(s, req.params.key);
    const byId = new Map(list.map(g => [g.id, g]));
    const reordered = order.map(id => byId.get(Number(id))).filter(Boolean);
    for (const g of list) if (!reordered.includes(g)) reordered.push(g);
    saveGuideList(s, req.params.key, reordered);
    res.json({ success: true, images: reordered });
});

// ── ADMIN: Steam inventar (real skin float integratsiyasi) ───────────────────

// GET /api/admin/steam-inventory — adminning Steam inventaridagi inspect qilinadigan itemlar
// (float/paintSeed/stickerlar linkning o'zidan lokal dekodlanib, tayyor holda qaytariladi)
app.get("/api/admin/steam-inventory", requireAdminPanel, async (req, res) => {
    try {
        const items = await fetchInventory(req.query.refresh === "1");
        res.json(items);
    } catch (err) {
        console.log("STEAM INVENTORY XATO:", err.message);
        res.status(502).json({ error: err.message });
    }
});

// GET /api/admin/steam-inventory-grouped — bot akkauntining inventarini
// nom+wear bo'yicha guruhlab qaytaradi (bulk-list uchun — bir xil skinning
// nechta nusxasi bo'lsa bittasiga narx belgilab, hammasini birdaniga
// sotuvga chiqarish mumkin bo'lishi uchun).
app.get("/api/admin/steam-inventory-grouped", requireAdminPanel, async (req, res) => {
    try {
        const items = await fetchInventory(req.query.refresh === "1");
        const groups = new Map();
        for (const it of items) {
            if (it.tradable === false) continue;
            const key = `${it.name}::${skinUtils.wearCode(it.float) ?? ""}`;
            if (!groups.has(key)) groups.set(key, { name: it.name, wear: skinUtils.wearCode(it.float), marketHashName: skinUtils.marketHashName(it.name, it.float), items: [] });
            groups.get(key).items.push(it);
        }
        res.json([...groups.values()].map(g => ({ ...g, count: g.items.length })));
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// GET /api/admin/list-price?marketHashName=... — Lis-Skins'dan sotuv narxini so'raydi
// (bulk-list sahifasida "Lis narxidan taklif qil" tugmasi uchun).
app.get("/api/admin/list-price", requireAdminPanel, async (req, res) => {
    try {
        const price = await lisSkinsPrice.getListPriceSom(String(req.query.marketHashName || ""));
        res.json({ priceSom: price });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// POST /api/admin/market-bulk-list — { assetIds: string[], price: number }
// Bir xil guruhdagi bir nechta itemni bittasiga narx belgilab, HAMMASINI
// alohida-alohida market e'loni qilib bir vaqtda yaratadi. Bot inventaridan
// topilmagan assetId'lar (masalan kesh eskirgan yoki item allaqachon
// sotilgan bo'lsa) xato tashlamasdan shunchaki tashlab ketiladi.
app.post("/api/admin/market-bulk-list", requireAdminPanel, async (req, res) => {
    const { assetIds, price } = req.body || {};
    if (!Array.isArray(assetIds) || !assetIds.length) return res.status(400).json({ error: "assetIds kerak" });
    if (!Number.isFinite(price) || price < MIN_TRADE_PRICE) return res.status(400).json({ error: "min_price" });

    let items;
    try { items = await fetchInventory(); }
    catch (err) { return res.status(502).json({ error: err.message }); }

    const created = [];
    const adminId = Number(process.env.ADMIN_ID);
    for (const assetId of assetIds) {
        const item = items.find(it => String(it.assetId) === String(assetId));
        if (!item) continue;
        const trade = tradeManager.createTrade(adminId, [buildSkin(item)], "website", price, "public", null, "market");
        created.push(trade.id);
    }
    res.json({ created });
});

// ── ADMIN: Auksionlar ─────────────────────────────────────────────────────────

// GET /api/admin/auctions — barcha auksionlar (har qanday holatda)
app.get("/api/admin/auctions", requireAdminPanel, (req, res) => {
    const list = read("auctions").slice().sort((a, b) => b.id - a.id);
    res.json(list);
});

// POST /api/admin/auctions — yangi auction yaratish
app.post("/api/admin/auctions", requireAdminPanel, (req, res) => {
    const { name, price, minBid, image, endTime, earlyAccessMinutes, assetId, inspectLink, float, paintSeed, paintIndex, stickers, rarity, tradeBanDays, statTrak } = req.body;
    const p  = Number(price);
    const mb = Number(minBid) || 1000;
    if (!name || !name.trim()) return res.status(400).json({ error: "Nom kiritilishi shart" });
    if (isNaN(p) || p <= 0)     return res.status(400).json({ error: "Narx musbat raqam bo'lishi kerak" });
    if (isNaN(mb) || mb <= 0)   return res.status(400).json({ error: "Minimal bid musbat raqam bo'lishi kerak" });

    // assetId/inspectLink admin qo'lda kiritmaydi — doim Steam inventar pickeridan keladi,
    // shu sabab mos kelmasa frontend bug belgisi, yengil format tekshiruvi qo'yiladi.
    if (assetId !== undefined && (typeof assetId !== "string" || !assetId))
        return res.status(400).json({ error: "Noto'g'ri assetId" });
    if (inspectLink !== undefined && inspectLink && !inspectLink.startsWith("steam://"))
        return res.status(400).json({ error: "Noto'g'ri inspectLink" });

    const eaMin = Number(earlyAccessMinutes);
    const earlyAccessUntil = (eaMin > 0) ? new Date(Date.now() + eaMin * 60000).toISOString() : null;
    const tbDays = Number(tradeBanDays);

    const auctions = read("auctions");
    const auction = {
        id:               Date.now(),
        name:             name.trim(),
        price:            p,
        minBid:           mb,
        image:            image || null,
        createdAt:        new Date().toISOString(),
        status:           "active",
        lastBidder:       null,
        lastBidderName:   null,
        endTime:          endTime || null,
        earlyAccessUntil,
        assetId:          assetId     || null,
        inspectLink:      inspectLink || null,
        float:            float      ?? null,
        paintSeed:        paintSeed  ?? null,
        paintIndex:       paintIndex ?? null,
        stickers:         Array.isArray(stickers) ? stickers : [],
        rarity:           rarity || null,
        tradeBanDays:     (tbDays > 0) ? tbDays : null,
        statTrak:         !!statTrak,
    };
    auctions.push(auction);
    write("auctions", auctions);
    res.json({ success: true, auction });
});

// PUT /api/admin/auctions/:id — auction ma'lumotlarini tahrirlash
app.put("/api/admin/auctions/:id", requireAdminPanel, (req, res) => {
    const auctions = read("auctions");
    const a = auctions.find(x => x.id === Number(req.params.id));
    if (!a) return res.status(404).json({ error: "Auction topilmadi" });

    const { name, price, minBid, image, endTime, tradeBanDays, statTrak } = req.body;
    if (name !== undefined) {
        if (!name.trim()) return res.status(400).json({ error: "Nom bo'sh bo'lmasligi kerak" });
        a.name = name.trim();
    }
    if (price !== undefined) {
        const p = Number(price);
        if (isNaN(p) || p <= 0) return res.status(400).json({ error: "Narx musbat raqam bo'lishi kerak" });
        a.price = p;
    }
    if (minBid !== undefined) {
        const mb = Number(minBid);
        if (isNaN(mb) || mb <= 0) return res.status(400).json({ error: "Minimal bid musbat raqam bo'lishi kerak" });
        a.minBid = mb;
    }
    if (image   !== undefined) a.image   = image || null;
    if (endTime !== undefined) a.endTime = endTime || null;
    if (statTrak !== undefined) a.statTrak = !!statTrak;
    if (tradeBanDays !== undefined) {
        const tb = Number(tradeBanDays);
        a.tradeBanDays = (tb > 0) ? tb : null;
    }

    write("auctions", auctions);
    res.json({ success: true, auction: a });
});

// POST /api/admin/auctions/:id/finish
app.post("/api/admin/auctions/:id/finish", requireAdminPanel, (req, res) => {
    const result = finishAuction(Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Auction topilmadi" });
    const { auction: a, winner } = result;

    if (winner) {
        notifyUser(
            winner,
            `🏆 *Tabriklaymiz! "${a.name}" auksionini yutdingiz!*\n\n` +
            `💰 Yakuniy narx: ${a.price.toLocaleString()} so'm\n\n` +
            `🎒 Skinni olish uchun Inventarga o'ting.`,
            tgSendMessage,
            lotWebAppKeyboard(a.id)
        );
    }

    res.json({ success: true, auction: a });
});

// POST /api/admin/auctions/:id/cancel
app.post("/api/admin/auctions/:id/cancel", requireAdminPanel, (req, res) => {
    const result = cancelAuction(Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Auction topilmadi" });
    const { auction: a, refunded } = result;

    if (refunded) {
        notifyUser(
            refunded,
            `🚫 *"${a.name}" auksioni bekor qilindi.*\n\n💳 *${a.price.toLocaleString()} so'm* balansingizga qaytarildi.`,
            tgSendMessage
        );
    }

    res.json({ success: true, auction: a });
});

// DELETE /api/admin/auctions/:id
app.delete("/api/admin/auctions/:id", requireAdminPanel, (req, res) => {
    const auctions = read("auctions");
    const exists = auctions.some(x => x.id === Number(req.params.id));
    if (!exists) return res.status(404).json({ error: "Auction topilmadi" });
    write("auctions", auctions.filter(x => x.id !== Number(req.params.id)));
    res.json({ success: true });
});

// GET /api/admin/auctions/:id/bids — shu lot bo'yicha barcha bidlar (eng yangisi birinchi)
app.get("/api/admin/auctions/:id/bids", requireAdminPanel, (req, res) => {
    const lotId = Number(req.params.id);
    const bids = (read("bids") || []).filter(b => b.lotId === lotId).slice().reverse();
    res.json(bids);
});

// ── ADMIN: Foydalanuvchilar ───────────────────────────────────────────────────

// GET /api/admin/users
app.get("/api/admin/users", requireAdminPanel, async (req, res) => {
    await instantSellManager.refreshRequests();
    // Sotilgan skinlar — faqat admin "Oldim" bosgan (credited) so'rovlar.
    const sold = new Map();
    for (const r of instantSellManager.getAllRequests()) {
        if (r.status !== "credited") continue;
        const s = sold.get(r.userId) || { count: 0, som: 0 };
        s.count += (r.items || []).length;
        s.som += r.totalSom || 0;
        sold.set(r.userId, s);
    }
    const list = getUsers().map(u => ({
        id:      u.id,
        name:    u.name,
        username: u.username || null,
        balance: u.balance ?? 0,
        blocked: u.blocked ?? false,
        wins:    (u.wins || []).length,
        soldCount: sold.get(u.id)?.count || 0,
        soldSom:   sold.get(u.id)?.som || 0,
        joined:  u.joined,
    })).sort((a, b) => new Date(b.joined || 0) - new Date(a.joined || 0));
    res.json(list);
});

// GET /api/admin/users/:id
app.get("/api/admin/users/:id", requireAdminPanel, async (req, res) => {
    const u = getUsers().find(x => x.id === Number(req.params.id));
    if (!u) return res.status(404).json({ error: "User topilmadi" });
    await Promise.all([instantSellManager.refreshRequests(), refresh("withdrawals"), refresh("tradeBalances")]).catch(() => {});
    const isCeo = req.adminSession?.role === "ceo";
    // Faoliyat: qaysi skinni qachon sotgan, pul yechishlar, balans tarixi.
    const sells = instantSellManager.getMyInstantSellRequests(u.id).map(r => ({
        id: r.id, groupId: r.groupId ?? r.id, status: r.status, totalSom: r.totalSom,
        createdAt: r.createdAt, resolvedAt: r.resolvedAt, rejectReason: r.rejectReason ?? null,
        items: (r.items || []).map(i => ({ name: i.name || i.marketHashName, imageUrl: i.imageUrl || null, priceSom: i.priceSom, float: i.float ?? null })),
        tradeOffer: r.tradeOffer ? tradeOfferView.viewTradeOffer(r.tradeOffer, r.createdAt) : null,
    }));
    const withdrawals = (read("withdrawals") || []).filter(w => w.userId === u.id)
        .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))
        .map(w => ({ id: w.id, amount: w.amount, status: w.status, card: w.cardNumber ? `•••• ${String(w.cardNumber).slice(-4)}` : null,
            // To'liq karta faqat CEO'ga — pul yechishni faqat u tasdiqlaydi (to'lash uchun kerak).
            cardFull: isCeo ? (w.cardNumber ?? null) : undefined,
            requestedAt: w.requestedAt, resolvedAt: w.resolvedAt, rejectComment: w.rejectComment ?? null }));
    res.json({
        viewerRole: req.adminSession?.role || null,
        id:        u.id,
        name:      u.name,
        username:  u.username || null,
        balance:   u.balance ?? 0,
        blocked:   u.blocked ?? false,
        tradeLink: u.steamTradeUrl || u.tradeLink || null,
        steamId64: u.steamId64 ?? null,
        steamUsername: u.steamUsername ?? null,
        wins:      u.wins || [],
        history:   u.history || [],
        joined:    u.joined,
        sells,
        withdrawals,
        // Muzlatilgan / yechsa bo'ladigan / so'ralgan pul va har tushum qachon ochilishi.
        hold: balanceManager.getHoldDetails(u.id),
        balanceHistory: (u.balanceHistory || []).slice(-100).reverse(),
    });
});

// Balans tarixidagi sabab: admin yozgan izoh bo'lsa — "Admin tomonidan ayirildi: <izoh>".
function adminReason(base, note) {
    const n = String(note ?? "").trim().slice(0, 200);
    return n ? `${base}: ${n}` : base;
}

// POST /api/admin/users/:id/balance — balans qo'shish
app.post("/api/admin/users/:id/balance", requireAdminPanel, (req, res) => {
    const amount = Number(req.body.amount);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: "Musbat raqam kiriting" });

    const arr = getUsers();
    const u   = arr.find(x => x.id === Number(req.params.id));
    if (!u) return res.status(404).json({ error: "User topilmadi" });

    u.balance = (u.balance ?? 0) + amount;
    if (!Array.isArray(u.balanceHistory)) u.balanceHistory = [];
    u.balanceHistory.push({ amount, reason: adminReason("Admin tomonidan qo'shildi", req.body.reason), date: new Date().toISOString() });
    saveUsers(arr);
    res.json({ success: true, balance: u.balance });
});

// POST /api/admin/users/:id/balance-subtract — balans ayirish
app.post("/api/admin/users/:id/balance-subtract", requireAdminPanel, (req, res) => {
    const amount = Number(req.body.amount);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: "Musbat raqam kiriting" });

    const arr = getUsers();
    const u   = arr.find(x => x.id === Number(req.params.id));
    if (!u) return res.status(404).json({ error: "User topilmadi" });

    u.balance = (u.balance ?? 0) - amount;
    if (!Array.isArray(u.balanceHistory)) u.balanceHistory = [];
    u.balanceHistory.push({ amount: -amount, reason: adminReason("Admin tomonidan ayirildi", req.body.reason), date: new Date().toISOString() });
    saveUsers(arr);
    res.json({ success: true, balance: u.balance });
});

// POST /api/admin/users/:id/block — bloklash/blokdan chiqarish
app.post("/api/admin/users/:id/block", requireAdminPanel, (req, res) => {
    const arr = getUsers();
    const u   = arr.find(x => x.id === Number(req.params.id));
    if (!u) return res.status(404).json({ error: "User topilmadi" });
    u.blocked = !u.blocked;
    saveUsers(arr);
    res.json({ success: true, blocked: u.blocked });
});

// ── ADMIN: Statistika ─────────────────────────────────────────────────────────

app.get("/api/admin/stats", requireAdminPanel, (req, res) => {
    const users    = getUsers();
    const auctions = read("auctions");
    const bids     = read("bids") || [];
    const deposits   = read("deposits") || [];
    const tradeFees  = read("tradeFees") || [];
    res.json({
        totalUsers:      users.length,
        blockedUsers:    users.filter(u => u.blocked).length,
        totalAuctions:   auctions.length,
        activeAuctions:  auctions.filter(a => a.status === "active").length,
        finishedAuctions: auctions.filter(a => a.status === "finished").length,
        cancelledAuctions: auctions.filter(a => a.status === "cancelled").length,
        totalBids:       bids.length,
        totalRevenue:    deposits.reduce((sum, d) => sum + (d.amount || 0), 0),
        totalTradeFees:  tradeFees.reduce((sum, f) => sum + (f.amount || 0), 0),
    });
});

// GET /api/admin/finance — Moliya dashboard (Skin sotish foydasi + to'lanishi kerak)
app.get("/api/admin/finance", requireAdminPanel, async (req, res) => {
    try {
        await instantSellManager.refreshRequests();
        const raw = read("instantSellRequests");
        const requests = Array.isArray(raw) ? raw : [];
        const names = requests.filter(r => r.status === "credited").flatMap(r => (r.items || []).map(i => i.marketHashName));
        const lisUsd = await lisSkinsPrice.fetchLisPricesUsd(names);
        res.json({
            lisConfigured: lisSkinsPrice.isLisConfigured(),
            ...financeStats.buildFinance({
                requests, lisUsd, rate: lisSkinsPrice.getUsdToSomRate(),
                holds: balanceManager.getAllHoldsForAdmin(), users: getUsers(),
            }),
        });
    } catch (err) {
        console.log("FINANCE XATO:", err.message);
        res.status(500).json({ error: "finance_failed" });
    }
});

// ── ADMIN: Promo kodlar ────────────────────────────────────────────────────────
const DEFAULT_PROMO_BONUS_PERCENT = 15;

// GET /api/admin/promos
app.get("/api/admin/promos", requireAdminPanel, (req, res) => {
    const promos = (read("promos") || []).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json(promos);
});

// POST /api/admin/promos — yangi promo kod yaratish. `type`:
// "balance" (standart — depozitga foizli bonus, `bonusPercent` sozlanadi) yoki
// "trade" (Obmen komissiyasini bekor qiladi — `maxUse` shu holda "nechta obmen
// tekin bo'ladi"ni bildiradi, shu sabab trade turi uchun majburiy va musbat
// bo'lishi kerak — aks holda cheksiz tekin obmen degani bo'lardi).
app.post("/api/admin/promos", requireAdminPanel, (req, res) => {
    const code = String(req.body.code || "").toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
    if (code.length < 3)  return res.status(400).json({ error: "Kamida 3 ta belgi bo'lishi kerak (A-Z, 0-9)" });
    if (code.length > 15) return res.status(400).json({ error: "Ko'pi bilan 15 ta belgi bo'lishi kerak (A-Z, 0-9)" });

    const promos = read("promos") || [];
    if (promos.some(p => p.code === code)) return res.status(400).json({ error: `"${code}" kodi allaqachon mavjud` });

    const type = ["trade", "withdraw"].includes(req.body.type) ? req.body.type : "balance";
    const maxUseNum = Number(req.body.maxUse);
    let maxUse = (!isNaN(maxUseNum) && maxUseNum > 0) ? maxUseNum : null;

    let bonus = null;
    let unlockSom = null;
    if (type === "balance") {
        const bp = Number(req.body.bonusPercent);
        bonus = (!isNaN(bp) && bp > 0 && bp <= 100) ? bp : DEFAULT_PROMO_BONUS_PERCENT;
    } else if (type === "withdraw") {
        // Muzlatilgan mablag'ning qanchasi (so'm) holdsiz ochiladi.
        unlockSom = Math.floor(Number(req.body.unlockSom));
        if (!(unlockSom > 0)) return res.status(400).json({ error: "Pul yechish promosi uchun summa (so'm) musbat son bo'lishi shart" });
    } else {
        if (!maxUse) return res.status(400).json({ error: "Obmen promosi uchun \"nechta obmen tekin bo'ladi\" musbat son bo'lishi shart" });
    }

    // perUserLimit — bitta odam shu kodni necha marta ishlata oladi. 0/bo'sh —
    // cheksiz; default 1 (eski "bir kishi — bir marta" xatti-harakati).
    const pulNum = Number(req.body.perUserLimit);
    const perUserLimit = (!isNaN(pulNum) && pulNum >= 0) ? pulNum : 1;

    const promo = {
        code,
        type,
        bonus,
        ...(unlockSom ? { unlockSom } : {}),
        perUserLimit,
        active:    true,
        maxUse,
        usedBy:    [],
        usedCount: 0,
        createdAt: new Date().toISOString(),
    };
    promos.push(promo);
    write("promos", promos);
    res.json({ success: true, promo });
});

// POST /api/admin/promos/:code/toggle — faollashtirish/o'chirish
app.post("/api/admin/promos/:code/toggle", requireAdminPanel, (req, res) => {
    const promos = read("promos") || [];
    const p = promos.find(x => x.code === req.params.code.toUpperCase());
    if (!p) return res.status(404).json({ error: "Promo topilmadi" });
    p.active = !p.active;
    write("promos", promos);
    res.json({ success: true, promo: p });
});

// DELETE /api/admin/promos/:code
app.delete("/api/admin/promos/:code", requireAdminPanel, (req, res) => {
    const code = req.params.code.toUpperCase();
    const promos = read("promos") || [];
    if (!promos.some(p => p.code === code)) return res.status(404).json({ error: "Promo topilmadi" });
    write("promos", promos.filter(p => p.code !== code));
    res.json({ success: true });
});

// ── ADMIN: Skin sotish so'rovlari ────────────────────────────────────────────
// Asosiy yo'l — Telegram'dagi "Oldim"/"Rad etish" tugmalari (bot). Bu yerdagi
// endpointlar admin panel uchun zaxira yo'l (bir xil tranzaksiyali funksiyalar).
app.get("/api/admin/instant-sell", requireAdminPanel, async (req, res) => {
    await instantSellManager.refreshRequests();
    const users = getUsers();
    const list = instantSellManager.getRequestsForAdmin(req.query.status || null).slice(0, 100).map(r => {
        const usr = users.find(x => x.id === r.userId);
        return { ...publicRequest(r), userName: usr?.name ?? null, steamId64: usr?.steamId64 ?? null };
    });
    res.json(list);
});

// ── Trade akkaunt (bot Steam akkaunti) — avtomatik trade offer uchun ─────────
app.get("/api/admin/trade-account", requireAdminPanel, async (req, res) => {
    try { res.json({ account: await tradeAccountBridge.getAccount(tradeAccountBridge.mongoDeps()) }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/admin/trade-account/login", requireAdminPanel, tradeLoginLimiter, async (req, res) => {
    const accountName = String(req.body.accountName || "").trim();
    const password = String(req.body.password || "");
    const guardCode = String(req.body.guardCode || "").trim().toUpperCase();
    if (!accountName || !password) return res.status(400).json({ error: "Login va parolni kiriting" });
    if (!/^[A-Z0-9]{5}$/.test(guardCode)) return res.status(400).json({ error: "Steam Guard kodi 5 belgidan iborat" });
    let result;
    try { result = await tradeAccountBridge.requestLogin({ accountName, password, guardCode }, tradeAccountBridge.mongoDeps()); }
    catch (err) { return res.status(500).json({ error: err.message }); }
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ account: result.account });
});

app.post("/api/admin/trade-account/disconnect", requireAdminPanel, async (req, res) => {
    try { await tradeAccountBridge.disconnect(tradeAccountBridge.mongoDeps()); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/admin/instant-sell/:id/approve", requireAdminPanel, async (req, res) => {
    const result = await instantSellManager.approveSellRequest(Number(req.params.id));
    if (result.error) return res.status(400).json({ error: result.error });
    notifyUser(result.request.userId, instantSellManager.approvedText(result.request), tgSendMessage);
    res.json({ request: result.request });
});

app.post("/api/admin/instant-sell/:id/reject", requireAdminPanel, async (req, res) => {
    const reason = String(req.body.reason || "").trim().slice(0, 300) || null;
    const result = await instantSellManager.rejectSellRequest(Number(req.params.id), reason);
    if (result.error) return res.status(400).json({ error: result.error });
    notifyUser(result.request.userId, instantSellManager.rejectedText(result.request), tgSendMessage);
    res.json({ request: result.request });
});

// ── ADMIN: Pul yechish so'rovlari (foydalanuvchi sahifasidan) — FAQAT CEO ─────
// Telegram'dagi @faststarz_bot tugmalari bilan bir xil: tasdiqlash = admin pulni
// kartaga o'tkazdi (balansdan ayiriladi), rad etish = mablag' yana yechsa bo'ladigan
// bo'ladi. Bir so'rov ikki joyda bosilsa ham bir marta ishlaydi (status "pending" sharti).
app.post("/api/admin/withdrawals/:id/approve", requireCeo, async (req, res) => {
    let result;
    try { result = await balanceManager.approveWithdrawal(Number(req.params.id)); }
    catch (err) { return res.status(500).json({ error: err.message }); }
    if (result.error) return res.status(400).json({ error: "So'rov topilmadi yoki allaqachon ko'rib chiqilgan" });
    const { request } = result;
    notifyUser(request.userId, `✅ *Pul chiqarish so'rovingiz tasdiqlandi!*\n\n💰 ${request.amount.toLocaleString()} so'm kartangizga o'tkazildi.`, tgSendMessage);
    res.json({ request: { id: request.id, status: request.status } });
});

app.post("/api/admin/withdrawals/:id/reject", requireCeo, async (req, res) => {
    const comment = String(req.body.reason || "").trim().slice(0, 300) || null;
    let result;
    try { result = await balanceManager.rejectWithdrawal(Number(req.params.id), comment); }
    catch (err) { return res.status(500).json({ error: err.message }); }
    if (result.error) return res.status(400).json({ error: "So'rov topilmadi yoki allaqachon ko'rib chiqilgan" });
    const { request } = result;
    notifyUser(request.userId, `❌ *Pul chiqarish so'rovingiz rad etildi.*${comment ? `\n\nSabab: ${mdEscape(comment)}` : ""}\n\nAdmin bilan bog'laning.`, tgSendMessage);
    res.json({ request: { id: request.id, status: request.status } });
});

// ── ADMIN: Lis avtosell (narxlarni egasining kompyuteridagi lisAutosellSync.js yozadi) ──

app.get("/api/admin/lis-autosell", requireAdminPanel, async (req, res) => {
    const state = await readDoc(lisAutosell.STATE_ID).catch(() => null);
    const pending = !!(await readDoc(lisAutosell.REQ_ID).catch(() => null));
    res.json({ state, pending, rate: lisSkinsPrice.getUsdToSomRate(), now: Date.now() });
});

app.post("/api/admin/lis-autosell/refresh", requireAdminPanel, async (req, res) => {
    await writeDoc(lisAutosell.REQ_ID, { at: Date.now() });
    res.json({ ok: true });
});

// ── ADMIN: Sozlamalar ─────────────────────────────────────────────────────────

app.get("/api/admin/settings", requireAdminPanel, (req, res) => {
    const s = getSettings();
    res.json({
        earlyAccessEnabled: s.earlyAccessEnabled !== false,
        vpnBlockEnabled: s.vpnBlockEnabled === true,
        humanCheckEnabled: s.humanCheckEnabled === true,
        humanCheckConfigured: humanCheck.configured(),
        steamId64: s.steamId64 || null,
        referralBonus: s.referralBonus ?? 10000,
        tradeFeeTiers: tradeManager.getFeeTiers(),
        instantSellMarginPercent: s.instantSellMarginPercent ?? 12,
        instantSellMarginTiers: lisSkinsPrice.marginTiersFromSettings(s),
        usdToSomRate: s.usdToSomRate ?? 12700,
        botTradeUrl: s.botTradeUrl || "",
        lisConfigured: lisSkinsPrice.isLisConfigured(),
    });
});

// tradeFeeTiers — istalgan sondagi daraja bo'lishi mumkin (admin panelidan
// qo'shish/o'chirish mumkin), faqat o'sish tartibida va musbat qiymatlar bilan
// ({max, fee} obyektlari).
function validTradeFeeTiers(tiers) {
    if (!Array.isArray(tiers) || tiers.length < 1) return null;
    const parsed = tiers.map(t => ({ max: Number(t.max), fee: Number(t.fee) }));
    if (parsed.some(t => !Number.isFinite(t.max) || t.max <= 0 || !Number.isFinite(t.fee) || t.fee < 0)) return null;
    for (let i = 1; i < parsed.length; i++) if (parsed[i].max <= parsed[i - 1].max) return null;
    return parsed;
}

app.post("/api/admin/settings", requireAdminPanel, (req, res) => {
    const s = getSettings();
    if (typeof req.body.earlyAccessEnabled === "boolean") s.earlyAccessEnabled = req.body.earlyAccessEnabled;
    if (typeof req.body.vpnBlockEnabled === "boolean") s.vpnBlockEnabled = req.body.vpnBlockEnabled;
    if (typeof req.body.humanCheckEnabled === "boolean") s.humanCheckEnabled = req.body.humanCheckEnabled;
    if (req.body.referralBonus !== undefined) {
        const rb = Number(req.body.referralBonus);
        if (isNaN(rb) || rb < 0) return res.status(400).json({ error: "Referral bonus musbat raqam bo'lishi kerak" });
        s.referralBonus = rb;
    }
    if (req.body.tradeFeeTiers !== undefined) {
        const tiers = validTradeFeeTiers(req.body.tradeFeeTiers);
        if (!tiers) return res.status(400).json({ error: "Komissiya darajalari noto'g'ri (3 ta daraja, o'sish tartibida, musbat qiymatlar kerak)" });
        s.tradeFeeTiers = tiers;
    }
    if (req.body.instantSellMarginPercent !== undefined) {
        const m = Number(req.body.instantSellMarginPercent);
        if (isNaN(m) || m < 0 || m > 100) return res.status(400).json({ error: "Instant Sell margin 0-100% orasida bo'lishi kerak" });
        s.instantSellMarginPercent = m;
    }
    if (req.body.instantSellMarginTiers !== undefined) {
        const tiers = lisSkinsPrice.normalizeMarginTiers(req.body.instantSellMarginTiers);
        if (!tiers) return res.status(400).json({ error: "Marja pog'onalari noto'g'ri: foiz 0–99, narx chegaralari o'sish tartibida, oxirgisi cheksiz bo'lishi kerak" });
        s.instantSellMarginTiers = tiers;
    }
    if (req.body.usdToSomRate !== undefined) {
        const rate = Number(req.body.usdToSomRate);
        if (isNaN(rate) || rate <= 0) return res.status(400).json({ error: "USD to Som kurs musbat raqam bo'lishi kerak" });
        s.usdToSomRate = rate;
    }
    if (req.body.botTradeUrl !== undefined) {
        const url = String(req.body.botTradeUrl || "").trim();
        if (url && !url.startsWith("https://steamcommunity.com/tradeoffer/new/"))
            return res.status(400).json({ error: "Trade link https://steamcommunity.com/tradeoffer/new/ bilan boshlanishi kerak" });
        s.botTradeUrl = url || null;
    }
    write("settings", s);
    res.json({
        success: true,
        botTradeUrl: s.botTradeUrl || "",
        lisConfigured: lisSkinsPrice.isLisConfigured(),
        earlyAccessEnabled: s.earlyAccessEnabled !== false,
        vpnBlockEnabled: s.vpnBlockEnabled === true,
        humanCheckEnabled: s.humanCheckEnabled === true,
        humanCheckConfigured: humanCheck.configured(),
        steamId64: s.steamId64 || null,
        referralBonus: s.referralBonus ?? 10000,
        tradeFeeTiers: tradeManager.getFeeTiers(),
        instantSellMarginPercent: s.instantSellMarginPercent ?? 12,
        instantSellMarginTiers: lisSkinsPrice.marginTiersFromSettings(s),
        usdToSomRate: s.usdToSomRate ?? 12700,
    });
});

// ── Steam OpenID login (admin SteamID64 avtomatik olish + bidchi tasdiqlash) ──

// Mini-app'dan (autentifikatsiya bilan) chaqiriladi — faqat tashqi brauzerda
// ochiladigan URL qaytaradi (frontend tg.openLink() bilan ochadi).
app.get("/api/admin/steam-login-url", requireAdminPanel, async (req, res) => {
    if (!process.env.STEAM_API_KEY || !process.env.WEBAPP_URL) {
        return res.status(400).json({ error: "STEAM_API_KEY yoki WEBAPP_URL .env da sozlanmagan" });
    }
    // "admin" purpose uchun tgId keyinchalik hech qayerda o'qilmaydi (faqat
    // do'kon sozlamalariga steamId64 yozish uchun ishlatiladi) — Admin Panel
    // endi Telegram foydalanuvchisi bilan bog'liq emas, shu sabab shunchaki 0.
    const nonce = await createPendingAuth(0, "admin");
    res.json({ url: `${process.env.WEBAPP_URL}/api/auth/steam/start?state=${nonce}` });
});

app.get("/api/steam-login-url", auth, async (req, res) => {
    if (!process.env.STEAM_API_KEY || !process.env.WEBAPP_URL) {
        return res.status(400).json({ error: "STEAM_API_KEY yoki WEBAPP_URL .env da sozlanmagan" });
    }
    const nonce = await createPendingAuth(req.tgUser.id, "bidder");
    res.json({ url: `${process.env.WEBAPP_URL}/api/auth/steam/start?state=${nonce}` });
});

// Steam'ning o'zi (tashqi brauzer orqali) chaqiradi — x-init-data yo'q, shu sabab
// auth middleware qo'llanilmaydi.
app.get("/api/auth/steam/start", async (req, res) => {
    const pending = await peekPendingAuth(req.query.state);
    if (!pending) return res.status(400).send("Havola muddati o'tgan. Mini-appga qaytib, qayta urinib ko'ring.");
    const returnUrl  = `${process.env.WEBAPP_URL}/api/auth/steam/callback?state=${req.query.state}`;
    const steamAuth  = getSteamAuth(returnUrl);
    try {
        res.redirect(await steamAuth.getRedirectUrl());
    } catch (err) {
        // node-steam-openid xatolarni Error emas, oddiy string sifatida reject qiladi —
        // shu sabab err.message doim undefined bo'lardi.
        res.status(500).send("Steam bilan bog'lanishda xato: " + (err?.message || err));
    }
});

app.get("/api/auth/steam/callback", async (req, res) => {
    const pending = await consumePendingAuth(req.query.state);
    if (!pending) return res.status(400).send("Sessiya muddati o'tgan yoki allaqachon ishlatilgan.");
    const returnUrl = `${process.env.WEBAPP_URL}/api/auth/steam/callback?state=${req.query.state}`;
    try {
        const steamUser = await getSteamAuth(returnUrl).authenticate(req);
        if (pending.purpose === "admin") {
            const s = getSettings();
            s.steamId64 = steamUser.steamid;
            write("settings", s);
        } else if (pending.purpose === "website") {
            // Telegramsiz, websaytdan to'g'ridan-to'g'ri Steam bilan kirish —
            // mavjud foydalanuvchi bo'lmasa, yangisi yaratiladi va sessiya beriladi.
            // Agar shu Steam akkaunt allaqachon (Telegram orqali) mavjud bo'lsa,
            // o'sha bitta hisobga kiritiladi — ikkilanma akkaunt yaratilmaydi.
            let u = findUserBySteamId(steamUser.steamid);
            if (!u) {
                u = createSteamUser(steamUser.steamid, steamUser.username, steamUser.avatar?.medium);
            } else if (u.steamUsername !== steamUser.username || u.steamAvatar !== steamUser.avatar?.medium) {
                const arr = getUsers();
                const found = arr.find(x => x.id === u.id);
                found.steamUsername = steamUser.username;
                found.steamAvatar = steamUser.avatar?.medium || null;
                saveUsers(arr);
            }
            if (u.blocked) return res.status(403).send("Siz bloklangansiz.");
            const token = await createSession(u.id);
            setSessionCookie(res, token);
            return res.redirect(process.env.WEBAPP_URL || "/");
        } else {
            if (!getUsers().some(x => x.id === pending.tgId)) {
                return res.status(404).send("Foydalanuvchi topilmadi — botga /start yuboring va qaytadan urinib ko'ring.");
            }
            // Bitta Steam = bitta Telegram akkaunt: boshqa Telegram akkauntga ulangan
            // Steam'ni bu yerga ulab bo'lmaydi (Telegramsiz dublikat pastda qo'shiladi).
            if (getUsers().some(x => x.id !== pending.tgId && x.telegramId != null && x.steamId64 === steamUser.steamid)) {
                return res.status(409).send("Bu Steam akkaunt boshqa AchiDrop akkauntiga ulangan. Qo'llab-quvvatlashga yozing.");
            }
            // Shu Steam bilan saytda (Telegramsiz) ochilgan akkaunt bo'lsa — shu
            // Telegram akkauntiga qo'shiladi: bitta Steam = bitta akkaunt, bitta balans.
            await mergeSteamDuplicatesInto(pending.tgId, steamUser.steamid);
            const arr = getUsers();
            const u   = arr.find(x => x.id === pending.tgId);
            if (!u) return res.status(404).send("Foydalanuvchi topilmadi — botga /start yuboring va qaytadan urinib ko'ring.");
            u.steamId64 = steamUser.steamid;
            u.steamUsername = steamUser.username;
            u.steamAvatar = steamUser.avatar?.medium || null;
            saveUsers(arr);
        }

        res.send(steamConnectedHtml(process.env.BOT_USERNAME));
    } catch (err) {
        res.status(400).send("Steam tasdiqlashda xato yuz berdi: " + (err?.message || err));
    }
});

// ── Websayt autentifikatsiyasi (Telegram tashqarisida, brauzerdan to'g'ridan-to'g'ri) ──

// POST /api/auth/telegram-login/start — rasmiy Telegram Login Widget o'rniga:
// botga o'ziga xos havola beradi, u yerda /start bosilsa kod yuboriladi.
app.post("/api/auth/telegram-login/start", telegramLoginLimiter, async (req, res) => {
    if (!process.env.BOT_USERNAME) return res.status(400).json({ error: "BOT_USERNAME .env da sozlanmagan" });
    const { nonce, expiresAt } = await createPendingLogin();
    res.json({ nonce, expiresAt, botUrl: `https://t.me/${process.env.BOT_USERNAME}?start=weblogin_${nonce}` });
});

// POST /api/auth/telegram-login/verify — foydalanuvchi botdan olgan kodni tasdiqlaydi
app.post("/api/auth/telegram-login/verify", telegramLoginLimiter, async (req, res) => {
    const { nonce, code } = req.body || {};
    const from = await consumePendingLogin(nonce, code);
    if (!from) return res.status(401).json({ error: "Kod noto'g'ri yoki muddati tugagan" });

    const tgId = Number(from.id);
    let u = getUsers().find((x) => x.id === tgId);
    if (!u) {
        u = createTelegramUser({
            id:         tgId,
            first_name: from.first_name || "Foydalanuvchi",
            last_name:  from.last_name,
            username:   from.username,
        });
    }
    if (u.blocked) return res.status(403).json({ error: "Bloklangansiz" });

    const token = await createSession(u.id);
    setSessionCookie(res, token);
    res.json({ success: true });
});

// GET /api/auth/steam-login-url — websaytdan mustaqil (Telegramsiz) Steam bilan kirish
app.get("/api/auth/steam-login-url", async (req, res) => {
    if (!process.env.STEAM_API_KEY || !process.env.WEBAPP_URL) {
        return res.status(400).json({ error: "STEAM_API_KEY yoki WEBAPP_URL .env da sozlanmagan" });
    }
    const nonce = await createPendingAuth(null, "website");
    res.json({ url: `${process.env.WEBAPP_URL}/api/auth/steam/start?state=${nonce}` });
});

// POST /api/auth/logout
app.post("/api/auth/logout", async (req, res) => {
    await destroySession(getSessionToken(req));
    clearSessionCookie(res);
    res.json({ success: true });
});

// Admin Panel — mijoz ilovasidan butunlay alohida bundle/URL (Vercel'da
// vercel.json'dagi rewrite bajaradi, lokal ishga tushirishda esa shu route
// pastdagi umumiy SPA fallback'dan OLDIN turishi kerak, aks holda "*" uni
// ham ushlab, noto'g'ri (mijoz) bundle'ni yuborib yuboradi).
app.get(["/admin", "/admin/"], (req, res) => {
    res.sendFile(path.join(__dirname, "..", "frontend", "dist", "admin.html"));
});

// SPA fallback
// Noma'lum /api manzil — sahifa HTML'i emas, JSON 404.
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "frontend", "dist", "index.html"));
});

if (!process.env.VERCEL) {
    // VPS'da WEBAPP_HOST=127.0.0.1 — sayt Vercel'da, bu server tashqariga ochilmasin.
    app.listen(PORT, process.env.WEBAPP_HOST, () => {
        console.log(`🌐 Mini App: http://localhost:${PORT}`);
        if (!process.env.WEBAPP_URL) {
            console.log("⚠️  WEBAPP_URL .env ga qo'shing va HTTPS (ngrok/hosting) ishlatishni unutmang!");
        }
    });
}

module.exports = app;
