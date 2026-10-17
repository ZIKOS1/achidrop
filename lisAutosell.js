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
    let payout = null;
    try { payout = (await lisGet("/offers/instant-payout", creds, fetchImpl))?.data ?? null; } catch (e) {
        if (e.code === "cookie_expired") throw e;
    }
    return summarize(inv?.data, payout);
}

module.exports = { STATE_ID, REQ_ID, parseCookie, envValue, summarize, lisGet, fetchState };
