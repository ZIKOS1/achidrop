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
function parseCommunityInventory(body) {
    const descs = new Map();
    for (const d of body?.descriptions || []) descs.set(`${d.classid}_${d.instanceid}`, d);
    const items = [];
    for (const a of body?.assets || []) {
        const d = descs.get(`${a.classid}_${a.instanceid}`);
        if (!d || !d.marketable) continue;
        const tags = d.tags || [];
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
            tradable: !!d.tradable,
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

// Oxirgi muvaffaqiyatli yuklangan inventar (necha daqiqa oldin bo'lishidan qat'i nazar) —
// Steam/SteamApis vaqtincha xato bersa, sahifa bo'sh qolmasligi uchun.
function getCachedCommunityInventory(steamId64) {
    return communityInvCache.get(steamId64)?.data || null;
}

module.exports = { fetchInventory, fetchUserInventory, fetchCommunityInventory, getCachedCommunityInventory, parseCommunityInventory, curlGet, steamApisGet };
