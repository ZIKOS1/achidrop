// Lis-Skins avtosell narxlari — admin panelda "Lis avtosell" bo'limi uchun.
//
// Muammo: app.lis-skins.com Cloudflare ortida va faqat brauzer cookie'si
// (cf_clearance + lis_skins_session) bilan javob beradi; cf_clearance esa
// egasining kompyuteri/IP'siga bog'langan — Vercel'dan so'rov o'tmaydi.
// Shu sabab Lis'ga so'rovni EGANING KOMPYUTERIDAGI `lisAutosellSync.js`
// yuboradi va natijani Mongo'ga (`lisAuto_state`) yozadi; sayt faqat o'qiydi.
// Admin "Yangilash" bossa sayt `lisAuto_req` qoldiradi, sync uni bir necha
// soniyada ko'rib darhol yangilaydi (inventoryBridge.js bilan bir xil naqsh).
//
// Lis faqat cookie egasining O'Z inventarini narxlaydi — boshqa Steam ID'ni
// so'rab bo'lmaydi (2026-10-17 tekshirilgan: steam_id/trade_url parametrlari
// e'tiborsiz qoldiriladi).
const STATE_ID = "lisAuto_state";
const REQ_ID = "lisAuto_req";
const API = "https://app.lis-skins.com/api/v2";
const STEAM_IMG = "https://community.akamai.steamstatic.com/economy/image/";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

// "a=1; b=2" → { a: "1", b: "2" }
function parseCookie(cookie) {
    const out = {};
    for (const part of String(cookie || "").split(";")) {
        const i = part.indexOf("=");
        if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    return out;
}

// .env matnidan bitta qiymat (qo'shtirnoqsiz/qo'shtirnoqli).
function envValue(text, name) {
    const m = String(text).match(new RegExp(`^${name}=(.*)$`, "m"));
    if (!m) return null;
    const v = m[1].trim().replace(/^(['"])([\s\S]*)\1$/, "$2");
    return v || null;
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

// Lis inventar javobi + instant-payout → saytda ko'rsatiladigan holat (sof funksiya).
function summarize(rawItems, payout) {
    const items = (Array.isArray(rawItems) ? rawItems : []).map(it => ({
        assetId: String(it.asset_id),
        name: it.name || "",
        priceUsd: num(it.price) ?? 0,
        imageUrl: it.icon_url ? (/^https?:/.test(it.icon_url) ? it.icon_url : STEAM_IMG + it.icon_url) : null,
        float: num(it.item_float),
        rarityColor: it.skin_rarity?.color || null,
        disabledReason: it.disabled_reason || null,
        stickers: Array.isArray(it.stickers) ? it.stickers.length : 0,
    })).sort((a, b) => b.priceUsd - a.priceUsd);

    const sellable = items.filter(i => !i.disabledReason && i.priceUsd > 0);
    const totalUsd = Math.round(sellable.reduce((s, i) => s + i.priceUsd, 0) * 100) / 100;
    return {
        items,
        sellableCount: sellable.length,
        totalUsd,
        minOfferUsd: num(payout?.min_offer_sum),
        instantRemainingUsd: num(payout?.sum_remaining),
    };
}

// Lis'ga bitta GET so'rov. 401/419 — cookie eskirgan.
async function lisGet(path, { cookie, sessionId }, fetchImpl = fetch) {
    const xsrf = parseCookie(cookie)["XSRF-TOKEN"];
    const headers = {
        Cookie: cookie,
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Origin: "https://lis-skins.com",
        Referer: "https://lis-skins.com/",
        "User-Agent": USER_AGENT,
    };
    if (xsrf) headers["X-XSRF-TOKEN"] = decodeURIComponent(xsrf);
    if (sessionId) headers["x-session-id"] = sessionId;
    const r = await fetchImpl(API + path, { headers });
    if (r.status === 401 || r.status === 419) {
        const e = new Error("Lis cookie eskirgan — brauzerdan yangisini olib lis_autosell/.env ga qo'ying");
        e.code = "cookie_expired";
        throw e;
    }
    const text = await r.text();
    if (!r.ok) throw new Error(`Lis HTTP ${r.status}`);
    try { return JSON.parse(text); } catch {
        throw new Error(text.includes("Just a moment") ? "Cloudflare so'rovni to'xtatdi — cookie'ni yangilang" : "Lis JSON qaytarmadi");
    }
}

async function fetchState(creds, fetchImpl) {
    const inv = await lisGet("/sell-skins/inventory?game_id=1", creds, fetchImpl);
    const user = (await lisGet("/users", creds, fetchImpl))?.data;
    let payout = null;
    try { payout = (await lisGet("/offers/instant-payout", creds, fetchImpl))?.data ?? null; } catch (e) {
        if (e.code === "cookie_expired") throw e;
    }
    return { ...summarize(inv?.data, payout), steamId: user?.steam_id ? String(user.steam_id) : null };
}

// ── Skin sotish (client) ─────────────────────────────────────────────────────
// Lis cookie egasining Steam akkaunti saytda ham ulangan bo'lsa, unga Skin
// sotishda Lis avtosell narxining o'zi (× kurs, marjasiz) ko'rsatiladi va
// so'rov ham shu narxda yoziladi. Boshqa userlarga — oddiy formula.
const OWNER_PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// (sof funksiya) state + steamId64 → Map(assetId -> so'm) yoki null (egasi emas / eski).
function ownerPricesSom(state, steamId64, rate, now = Date.now()) {
    if (!state?.steamId || !steamId64 || String(state.steamId) !== String(steamId64)) return null;
    if (!state.fetchedAt || now - state.fetchedAt > OWNER_PRICE_MAX_AGE_MS) return null;
    if (!(rate > 0)) return null;
    const out = new Map();
    for (const it of state.items || []) {
        const som = Math.floor(it.priceUsd * rate);
        if (som > 0) out.set(String(it.assetId), som);
    }
    return out;
}

async function getOwnerPricesSom(steamId64, rate) {
    const { readDoc } = require("./database/db");
    const state = await readDoc(STATE_ID).catch(() => null);
    return ownerPricesSom(state, steamId64, rate);
}

module.exports = { STATE_ID, REQ_ID, parseCookie, envValue, summarize, lisGet, fetchState, ownerPricesSom, getOwnerPricesSom };
