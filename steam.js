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

// ── Skin sotish uchun: relay'SIZ, to'g'ridan-to'g'ri steamcommunity.com ──────
// Skin sotishda bot hech narsa yubormaydi/qabul qilmaydi (hammasi qo'lda) —
// faqat userning ochiq inventarini ko'rsatish kerak, relay (va uning Steam
// sessiyasi) shart emas. Float bu yerda yo'q, lekin Lis narxi uchun float
// kerak emas: Steam `market_hash_name`ni (wear bilan) o'zi beradi.
// ⚠ Yuqoridagi izohdagi datacenter-IP blok hali ham amal qilishi mumkin —
// Steam 429 qaytarsa userga tushunarli xato chiqadi.
const COMMUNITY_IMG = "https://community.akamai.steamstatic.com/economy/image/";
const WEAR_BY_TAG = { WearCategory0: "FN", WearCategory1: "MW", WearCategory2: "FT", WearCategory3: "WW", WearCategory4: "BS" };
const communityInvCache = new Map(); // steamId64 -> { data, ts }

// Sof funksiya (testlanadi). marketable:0 itemlar (medal, coin va h.k.)
// umuman sotib bo'lmagani uchun tashlab yuboriladi.
// Trade hold'dagi skin ham sotiladigan tur bo'lsa ko'rsatamiz (medal, coin,
// storage unit, ishlatilgan graffiti va h.k. — yo'q).
const SELLABLE_TYPES = new Set([
    "CSGO_Type_Pistol", "CSGO_Type_SMG", "CSGO_Type_Rifle", "CSGO_Type_SniperRifle",
    "CSGO_Type_Shotgun", "CSGO_Type_Machinegun", "CSGO_Type_Knife", "Type_Hands",
    "Type_CustomPlayer", "CSGO_Tool_Sticker", "CSGO_Type_WeaponCase", "CSGO_Type_MusicKit",
    "CSGO_Tool_Patch", "CSGO_Tool_Keychain", "CSGO_Tool_WeaponCase_KeyTag",
]);

// Qulf qachon ochilishi: cache_expiration (ISO) yoki egasiga ko'rinadigan
// "Tradable/Marketable After Oct 23, 2026 (8:00:00) GMT" matni.
function holdEndsAt(d) {
    if (d.cache_expiration && !isNaN(Date.parse(d.cache_expiration))) return new Date(d.cache_expiration).toISOString();
    for (const o of d.owner_descriptions || []) {
        const m = String(o.value || "").match(/After\s+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})(?:\s*\((\d{1,2}:\d{2}:\d{2})\))?/);
        if (m) {
            const t = Date.parse(`${m[1]} ${m[2] || "00:00:00"} GMT`);
            if (!isNaN(t)) return new Date(t).toISOString();
        }
    }
    return null;
}

function parseCommunityInventory(body) {
    const descs = new Map();
    for (const d of body?.descriptions || []) descs.set(`${d.classid}_${d.instanceid}`, d);
    const items = [];
    for (const a of body?.assets || []) {
        const d = descs.get(`${a.classid}_${a.instanceid}`);
        if (!d || !d.market_hash_name) continue;
        const tags = d.tags || [];
        // marketable:0 — yo medal/coin kabi umuman sotilmaydigan narsa, yo yangi
        // olingan skin (Steam trade hold / trade protection, 7–8 kun). Ikkinchisi
        // ko'rsatiladi (qulf bilan), birinchisi tashlab yuboriladi.
        const lockedUntil = d.marketable ? null : holdEndsAt(d);
        if (!d.marketable && !lockedUntil && !SELLABLE_TYPES.has(tags.find(t => t.category === "Type")?.internal_name)) continue;
        const exterior = tags.find(t => t.category === "Exterior");
        const rarity = tags.find(t => t.category === "Rarity");
        items.push({
            assetId: String(a.assetid),
            name: d.name || d.market_hash_name,
            marketHashName: d.market_hash_name,
            wear: exterior ? WEAR_BY_TAG[exterior.internal_name] || null : null,
            float: null,
            image: d.icon_url ? `${COMMUNITY_IMG}${d.icon_url}/256fx256f` : null,
            rarity: rarity ? rarity.localized_tag_name : null,
            tradable: !!d.tradable && !!d.marketable,
            lockedUntil,
            stickers: [],
        });
    }
    return items;
}

// Inventar sahifasini olish usullari: { status, text } qaytaradi.
// Odatda Node fetch. VPS'da (inventory-worker.js) esa curl: Steam'ni himoya
// qiladigan Akamai datacenter IP'dan kelgan Node so'rovini "barmoq izi"
// bo'yicha 429 bilan rad etadi (sarlavha/IPv4 farqi yo'q), curl'ni esa o'tkazadi.
async function fetchGet(url) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    try {
        const resp = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: ac.signal });
        return { status: resp.status, text: await resp.text() };
    } catch (err) {
        throw new Error(err.name === "AbortError" ? "Steam javob bermadi, keyinroq urinib ko'ring" : "Steam bilan bog'lanishda xato");
    } finally {
        clearTimeout(timer);
    }
}

function curlGet(url) {
    const { execFile } = require("child_process");
    return new Promise((resolve, reject) => {
        execFile("curl", ["-s", "-m", "8", "-H", "User-Agent: Mozilla/5.0", "-w", "\n%{http_code}", url],
            { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
                if (err) return reject(new Error(err.code === 28 ? "Steam javob bermadi, keyinroq urinib ko'ring" : "Steam bilan bog'lanishda xato"));
                const cut = stdout.lastIndexOf("\n");
                resolve({ status: Number(stdout.slice(cut + 1)), text: stdout.slice(0, cut) });
            });
    });
}

// SteamApis.com (pullik) — o'z IP'lari orqali Steam'dan oladi, Vercel'dan to'g'ridan-to'g'ri
// chaqirsa bo'ladi (bot/worker shart emas). Javobi steamcommunity bilan bir xil format,
// butun inventar bitta javobda keladi. steamcommunity URL'ini SteamApis'nikiga almashtiradi.
function steamApisGet(url) {
    const m = url.match(/\/inventory\/(\d+)\/(\d+)\/(\d+)/);
    return fetchGet(`https://api.steamapis.com/steam/inventory/${m[1]}/${m[2]}/${m[3]}?api_key=${encodeURIComponent(process.env.STEAMAPIS_KEY)}`);
}

let steamBusyUntil = 0;

async function fetchCommunityInventory(steamId64, force = false, get = fetchGet) {
    if (!steamId64) throw new Error("Steam hisobingiz ulanmagan");
    const cached = communityInvCache.get(steamId64);
    if (!force && cached && Date.now() - cached.ts < CACHE_MS) return cached.data;

    const items = [];
    let start = null;
    for (let page = 0; page < 5; page++) {
        const url = `https://steamcommunity.com/inventory/${steamId64}/730/2?l=english&count=2000${start ? `&start_assetid=${start}` : ""}`;
        // 429 dan keyin qayta urinish IP cheklovini uzaytiradi — 1 daqiqa umuman so'ramaymiz.
        if (Date.now() < steamBusyUntil) throw new Error("Steam hozir band, 1-2 daqiqadan keyin urinib ko'ring");
        const resp = await get(url);
        if (resp.status === 429) steamBusyUntil = Date.now() + 60_000;
        if (resp.status === 403) throw new Error("Steam inventaringiz yopiq (private). Uni Steam sozlamalarida ochiq (public) qiling");
        if (resp.status === 429) throw new Error("Steam hozir band, 1-2 daqiqadan keyin urinib ko'ring");
        // SteamApis Steam'dan ololmasa 400 + code 305 qaytaradi (odatda 1 daqiqa ichida o'tib ketadi).
        if (resp.status >= 500 || (resp.status === 400 && /"code"\s*:\s*305|try again later/i.test(resp.text || ""))) {
            throw new Error("Steam hozir javob bermayapti. Bir necha soniyadan keyin «Yangilash»ni bosing");
        }
        if (resp.status < 200 || resp.status >= 300) throw new Error(`Steam xato qaytardi (HTTP ${resp.status})`);
        let body = null;
        try { body = JSON.parse(resp.text); } catch {}
        if (!body) break; // bo'sh inventar Steam'da bo'sh javob qaytaradi
        items.push(...parseCommunityInventory(body));
        if (!body.more_items || !body.last_assetid) break;
        start = body.last_assetid;
    }
    communityInvCache.set(steamId64, { data: items, ts: Date.now() });
    return items;
}

async function fetchInventory(force = false) {
    const steamId = getConfiguredSteamId();
    if (!steamId) throw new Error("Steam ID sozlanmagan (.env STEAM_ID64 yoki Admin Panel > Sozlamalar > Steam)");
    if (!force && invCache.data && Date.now() - invCache.ts < CACHE_MS) return invCache.data;

    const body = await relayFetchInventory(steamId, force);
    invCache = { data: body, ts: Date.now() };
    return body;
}

module.exports = { fetchInventory, fetchUserInventory, fetchCommunityInventory, parseCommunityInventory, curlGet, steamApisGet };
