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

// Sof funksiya (testlanadi). Inventardagi hamma narsa qaytariladi.
// `sellable`: sotiladigan tur yoki trade hold'dagi skin — true; medal, coin,
// storage unit, ishlatilgan graffiti va h.k. — false (faqat ko'rsatiladi).
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
        // Sotilmaydiganlar (medal, coin, graffiti...) ham ko'rsatiladi — user
        // inventari to'liq ko'rinsin — lekin `sellable:false` bilan, tanlab bo'lmaydi.
        const sellable = !!d.marketable || !!lockedUntil || SELLABLE_TYPES.has(tags.find(t => t.category === "Type")?.internal_name);
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
            sellable,
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

// Steam "jami" (total_inventory_count) qancha skin borligini aytadi, lekin
// trade-himoyasidagi (yaqinda olingan) skinlarni OMMAGA bermaydi — ular
// alohida "16" bo'limida, faqat egasiga (yoki egasining access_token'i bilan)
// ko'rinadi. Shu sabab ochiq "2" bo'limidan kelgan skinlar soni Steam aytgan
// "jami"dan kam bo'lishi mumkin. Farqni (`hiddenCount`) UI'da ko'rsatamiz;
// token berilsa "16" ham olinib qo'shiladi.
function communityInventoryMeta(steamId64) {
    const c = communityInvCache.get(steamId64);
    return c ? { totalCount: c.totalCount ?? c.data.length, hiddenCount: c.hiddenCount ?? 0 } : { totalCount: 0, hiddenCount: 0 };
}

// Bitta bo'limni (2 yoki 16) to'liq o'qiydi. { items, totalCount } yoki
// protected bo'limi egasiga yopiq bo'lsa (token yo'q/xato) { blocked:true }.
async function fetchInventoryContext(steamId64, contextId, get, token) {
    const items = [];
    let start = null, totalCount = 0;
    for (let page = 0; page < 5; page++) {
        const q = `l=english&count=2000${token ? `&access_token=${encodeURIComponent(token)}` : ""}${start ? `&start_assetid=${start}` : ""}`;
        const url = `https://steamcommunity.com/inventory/${steamId64}/730/${contextId}?${q}`;
        if (Date.now() < steamBusyUntil) throw new Error("Steam hozir band, 1-2 daqiqadan keyin urinib ko'ring");
        const resp = await get(url);
        if (resp.status === 429) { steamBusyUntil = Date.now() + 60_000; throw new Error("Steam hozir band, 1-2 daqiqadan keyin urinib ko'ring"); }
        if (resp.status === 403) throw new Error("Steam inventaringiz yopiq (private). Uni Steam sozlamalarida ochiq (public) qiling");
        if (resp.status >= 500 || (resp.status === 400 && /"code"\s*:\s*305|try again later/i.test(resp.text || ""))) {
            throw new Error("Steam hozir javob bermayapti. Bir necha soniyadan keyin «Yangilash»ni bosing");
        }
        if (resp.status < 200 || resp.status >= 300) throw new Error(`Steam xato qaytardi (HTTP ${resp.status})`);
        let body = null;
        try { body = JSON.parse(resp.text); } catch {}
        if (!body) break;                                   // bo'sh inventar
        // rwgrsn:-2 — protected bo'lim belgisi, LEKIN javobda skinlar bo'lsa ham
        // keladi (SteamApis "2" bo'limi bilan shunday). "Yopiq" faqat skinlar
        // umuman yo'q bo'lsa: aks holda bor skinlarni tashlab yubormaymiz.
        if (!Array.isArray(body.assets) && body.success && body.rwgrsn === -2) return { blocked: true };
        totalCount = body.total_inventory_count || totalCount;
        items.push(...parseCommunityInventory(body));
        if (!body.more_items || !body.last_assetid) break;
        start = body.last_assetid;
    }
    return { items, totalCount };
}

// token berilsa trade-himoyasidagi "16" bo'limi ham qo'shiladi (xato bo'lsa
// jim o'tkaziladi — ochiq skinlar baribir ko'rsatiladi). hiddenCount keshga
// yoziladi: Steam aytgan jami − biz ko'rsatayotgan son.
async function fetchCommunityInventory(steamId64, force = false, get = fetchGet, { token } = {}) {
    if (!steamId64) throw new Error("Steam hisobingiz ulanmagan");
    const cached = communityInvCache.get(steamId64);
    if (!force && cached && Date.now() - cached.ts < CACHE_MS) return cached.data;

    // "2" bo'limi egasiga yopiq bo'lsa ({blocked}) — bo'sh deb qaraymiz (eski
    // xatti-harakat), ishlamay qolmaymiz.
    const main = await fetchInventoryContext(steamId64, 2, get, null);
    const mainItems = main.items || [];
    const byId = new Map(mainItems.map(i => [i.assetId, i]));
    let totalCount = main.totalCount || mainItems.length;

    if (token) {
        try {
            const prot = await fetchInventoryContext(steamId64, 16, get, token);
            if (!prot.blocked && prot.items) {
                for (const it of prot.items) if (!byId.has(it.assetId)) byId.set(it.assetId, it);
                totalCount += prot.totalCount || prot.items.length;
            }
        } catch (err) { console.log("PROTECTED INV (16) ERROR:", steamId64, err.message); }
    }

    const items = [...byId.values()];
    const hiddenCount = Math.max(0, totalCount - items.length);
    communityInvCache.set(steamId64, { data: items, ts: Date.now(), totalCount, hiddenCount });
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

module.exports = { fetchInventory, fetchUserInventory, fetchCommunityInventory, communityInventoryMeta, parseCommunityInventory, curlGet, steamApisGet };
