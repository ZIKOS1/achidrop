// Foydalanuvchining Steam trade havolasi:
// https://steamcommunity.com/tradeoffer/new/?partner=<accountId>&token=<token>
// partner — 32-bitli account ID; steamId64 = partner + 76561197960265728.
const STEAMID64_BASE = 76561197960265728n;

function parseTradeUrl(raw) {
    if (typeof raw !== "string") return null;
    let u;
    try { u = new URL(raw.trim().replace(/&amp;/g, "&")); } catch { return null; }
    if (!/^https?:$/.test(u.protocol) || u.hostname !== "steamcommunity.com") return null;
    if (u.pathname.replace(/\/$/, "") !== "/tradeoffer/new") return null;
    const partner = u.searchParams.get("partner") || "";
    const token = u.searchParams.get("token") || "";
    if (!/^\d{1,10}$/.test(partner) || !/^[A-Za-z0-9_-]{4,16}$/.test(token)) return null;
    return {
        partner, token,
        steamId64: String(BigInt(partner) + STEAMID64_BASE),
        url: `https://steamcommunity.com/tradeoffer/new/?partner=${partner}&token=${token}`,
    };
}

function validateTradeUrlFor(raw, steamId64) {
    const p = parseTradeUrl(raw);
    if (!p) return { ok: false, error: "Trade havola formati noto'g'ri" };
    if (p.steamId64 !== String(steamId64)) return { ok: false, error: "Bu trade havola saytga ulangan Steam akkauntingizga tegishli emas" };
    return { ok: true, url: p.url };
}

// Shu Steam akkauntning trade havolasi boshqa AchiDrop userida bormi
// (bitta havola — bitta akkaunt, foydalanuvchi qarori 2026-10-29).
function tradeUrlOwner(users, steamId64, exceptUserId) {
    const other = users.find(u => u.id !== exceptUserId && u.steamTradeUrl && parseTradeUrl(u.steamTradeUrl)?.steamId64 === String(steamId64));
    return other ? other.id : null;
}

module.exports = { parseTradeUrl, validateTradeUrlFor, tradeUrlOwner };
