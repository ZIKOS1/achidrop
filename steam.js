const { read } = require("./database/db");

const CACHE_MS = 180_000; // 3 daqiqa

let invCache = { data: null, ts: 0 };
const userInvCache = new Map(); // steamId64 -> { data, ts }

function getConfiguredSteamId() {
    const raw = read("settings");
    const settings = Array.isArray(raw) ? {} : raw;
    return settings.steamId64 || process.env.STEAM_ID64 || null;
}

// Steam Community'ning inventar JSON endpointi datacenter IP-manzillarni
// (Vercel, AWS, GCP va h.k.) keng ko'lamda bloklaydi/rate-limit qiladi (CS2
// trading botlari suiiste'mol qilgani uchun) — 429/400 va bo'sh javob bilan.
// Shu sabab bu so'rov Vercel'dan to'g'ridan-to'g'ri emas, alohida kichik VPS
// (relay)ga yuboriladi: o'sha yerda Steam sessiyasi doimiy ochiq turadi va
// datacenter-blok ostida bo'lmagan IP orqali steamcommunity.com'ga murojaat
// qiladi. `scripts/steam-login-setup.js` bilan olingan STEAM_REFRESH_TOKEN
// endi Vercel'da emas, faqat relay VPS'da ishlatiladi.
async function relayFetchInventory(steamId, force) {
    const relayUrl    = process.env.STEAM_RELAY_URL;
    const relaySecret = process.env.STEAM_RELAY_SECRET;
    if (!relayUrl || !relaySecret) throw new Error("STEAM_RELAY_URL / STEAM_RELAY_SECRET .env da sozlanmagan");

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25000);
    let resp;
    try {
        resp = await fetch(`${relayUrl.replace(/\/$/, "")}/inventory?steamid=${steamId}${force ? "&force=1" : ""}`, {
            headers: { "x-relay-secret": relaySecret },
            signal: ac.signal,
        });
    } catch (err) {
        throw new Error(err.name === "AbortError" ? "Relay javob bermadi (timeout)" : "Relay bilan bog'lanishda xato: " + err.message);
    } finally {
        clearTimeout(timer);
    }

    const body = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error(body?.error || `Relay xato qaytardi (HTTP ${resp.status})`);
    if (!Array.isArray(body)) throw new Error("Relay noto'g'ri javob qaytardi");
    return body;
}

// Obmen ("trade") funksiyasi uchun — istalgan foydalanuvchining O'ZI ulagan
// Steam hisobidagi inventarni olish (do'kon sozlamalaridagi steamId'dan
// mustaqil). Relay so'rovi allaqachon `?steamid=` orqali istalgan ID uchun
// ishlaydi, shu sabab shu yerda faqat generic wrapper + har bir steamId
// uchun alohida kesh kerak.
async function fetchUserInventory(steamId64, force = false) {
    if (!steamId64) throw new Error("Steam hisobingiz ulanmagan");
    const cached = userInvCache.get(steamId64);
    if (!force && cached && Date.now() - cached.ts < CACHE_MS) return cached.data;

    const body = await relayFetchInventory(steamId64, force);
    userInvCache.set(steamId64, { data: body, ts: Date.now() });
    return body;
}

async function fetchInventory(force = false) {
    const steamId = getConfiguredSteamId();
    if (!steamId) throw new Error("Steam ID sozlanmagan (.env STEAM_ID64 yoki Admin Panel > Sozlamalar > Steam)");
    if (!force && invCache.data && Date.now() - invCache.ts < CACHE_MS) return invCache.data;

    const body = await relayFetchInventory(steamId, force);
    invCache = { data: body, ts: Date.now() };
    return body;
}

module.exports = { fetchInventory, fetchUserInventory };
