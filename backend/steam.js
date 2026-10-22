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
        // User-Agent sarlavhasi YO'Q: 2026-10-19 da bir akkaunt uchun
        // "Mozilla/5.0" + count=2000 doim 429 qaytardi, sarlavhasiz count=500 — 200.
        execFile("curl", ["-s", "-m", "8", "-w", "\n%{http_code}", url],
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
const defaultSleep = (ms) => new Promise(r => setTimeout(r, ms));
// Steam 429 odatda bir necha soniyalik — darhol "band" deb qaytarish o'rniga
// shu oraliqlarda qayta urinamiz (jami bridge WAIT_MS 22s ichida qoladi).
// Boshqa userlar ham shu qisqa oynada kutadi (xato emas), keyin davom etadi.
const RETRY_WAITS_MS = [3000, 6000];

async function getWithRetry(url, get, sleep) {
    for (let attempt = 0; ; attempt++) {
        const wait = steamBusyUntil - Date.now();
        if (wait > 0) await sleep(Math.min(wait, RETRY_WAITS_MS[RETRY_WAITS_MS.length - 1]));
        const resp = await get(url);
        if (resp.status !== 429) { steamBusyUntil = 0; return resp; }
        if (attempt >= RETRY_WAITS_MS.length) {
            steamBusyUntil = Date.now() + RETRY_WAITS_MS[0];
            throw new Error("Steam hozir band, 1-2 daqiqadan keyin urinib ko'ring");
        }
        steamBusyUntil = Date.now() + RETRY_WAITS_MS[attempt];
    }
}

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
async function fetchInventoryContext(steamId64, contextId, get, token, sleep = defaultSleep) {
    const items = [];
    let start = null, totalCount = 0;
    // Sahifasiga 500 ta (curlGet izohiga qarang), ko'pi bilan 10 sahifa = 5000 ta.
    for (let page = 0; page < 10; page++) {
        const q = `l=english&count=500${token ? `&access_token=${encodeURIComponent(token)}` : ""}${start ? `&start_assetid=${start}` : ""}`;
        const url = `https://steamcommunity.com/inventory/${steamId64}/730/${contextId}?${q}`;
        const resp = await getWithRetry(url, get, sleep);
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
async function fetchCommunityInventory(steamId64, force = false, get = fetchGet, { token, sleep = defaultSleep } = {}) {
    if (!steamId64) throw new Error("Steam hisobingiz ulanmagan");
    const cached = communityInvCache.get(steamId64);
    if (!force && cached && Date.now() - cached.ts < CACHE_MS) return cached.data;

    // "2" bo'limi egasiga yopiq bo'lsa ({blocked}) — bo'sh deb qaraymiz (eski
    // xatti-harakat), ishlamay qolmaymiz.
    const main = await fetchInventoryContext(steamId64, 2, get, null, sleep);
    const mainItems = main.items || [];
    const byId = new Map(mainItems.map(i => [i.assetId, i]));
    let totalCount = main.totalCount || mainItems.length;

    if (token) {
        try {
            const prot = await fetchInventoryContext(steamId64, 16, get, token, sleep);
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

// ── steamwebapi.com — trade-himoyadagi (yaqinda olingan) skinlarni ham beradi ──
// Steam ommaviy inventarga qo'ymaydigan `owneronly` skinlarni ham qaytaradi
// (`try_first_seven_days_blocked_items=1`), shuning uchun STEAMWEBAPI_KEY
// bo'lsa Skin sotish inventari shu yerdan olinadi. Bitta so'rov = butun
// inventar. Javob — item massivi yoki { error } (limit/xato).
const WEBAPI_WEAR = { fn: "FN", mw: "MW", ft: "FT", ww: "WW", bs: "BS" };

// Doppler / Gamma Doppler fazasi paint index bo'yicha (BUFF narxi fazaga bog'liq,
// buffPrice.priceKey). Noma'lum index bo'lsa — steamwebapi'ning float.phase'i.
const DOPPLER_PHASES = {
    415: "Ruby", 416: "Sapphire", 417: "Black Pearl", 418: "Phase 1", 419: "Phase 2", 420: "Phase 3", 421: "Phase 4",
    617: "Black Pearl", 618: "Phase 2", 619: "Sapphire", 852: "Phase 1", 853: "Phase 2", 854: "Phase 3", 855: "Phase 4",
    568: "Emerald", 569: "Phase 1", 570: "Phase 2", 571: "Phase 3", 572: "Phase 4",
    1119: "Emerald", 1120: "Phase 1", 1121: "Phase 2", 1122: "Phase 3", 1123: "Phase 4",
};
function dopplerPhase(it, mhn) {
    if (!/Doppler/i.test(mhn)) return null;
    const byIndex = DOPPLER_PHASES[Number(it.paintindex ?? it.float?.paintindex)];
    if (byIndex) return byIndex;
    const raw = String(it.float?.phase || "").trim();
    const m = raw.match(/^phase\s*([1-4])$/i);
    if (m) return `Phase ${m[1]}`;
    return ["Ruby", "Sapphire", "Black Pearl", "Emerald"].find(p => p.toLowerCase() === raw.toLowerCase()) || null;
}

function parseWebApiInventory(arr) {
    if (!Array.isArray(arr)) return [];
    const items = [];
    for (const it of arr) {
        const mhn = it.markethashname || it.marketname;
        if (!it.assetid || !mhn) continue;
        const marketable = it.marketable !== false && it.marketable !== 0;
        const tradable = it.tradable !== false && it.tradable !== 0;
        items.push({
            assetId: String(it.assetid),
            name: it.marketname || mhn,
            marketHashName: mhn,
            wear: it.wear ? (WEBAPI_WEAR[String(it.wear).toLowerCase()] || null) : null,
            float: it.float && Number.isFinite(it.float.floatvalue) ? it.float.floatvalue : null,
            image: it.image || null,
            rarity: it.rarity || null,
            // medal/coin/graffiti (marketable:false) — sotilmaydi, lekin ko'rsatiladi.
            tradable: tradable && marketable,
            sellable: marketable,
            lockedUntil: null,
            phase: dopplerPhase(it, mhn),
            stickers: [],
        });
    }
    return items;
}

const webApiCache = new Map(); // steamId64 -> { data, ts }

async function steamWebApiInventory(steamId64, force = false) {
    if (!steamId64) throw new Error("Steam hisobingiz ulanmagan");
    const key = process.env.STEAMWEBAPI_KEY;
    if (!key) throw new Error("STEAMWEBAPI_KEY sozlanmagan");
    const cached = webApiCache.get(steamId64);
    if (!force && cached && Date.now() - cached.ts < CACHE_MS) return cached.data;

    const url = `https://www.steamwebapi.com/steam/api/inventory?key=${encodeURIComponent(key)}`
        + `&steam_id=${encodeURIComponent(steamId64)}&game=cs2&try_first_seven_days_blocked_items=1`
        // no_cache — aks holda steamwebapi kunlab eski nusxani beradi (2026-10-22:
        // 5 kunlik kesh — yangi skinlar ko'rinmas, qulfi ochilganlar "qulf" edi).
        // O'zimizning 3 daqiqalik keshimiz (webApiCache) limitdan saqlaydi.
        + `&no_cache=1`;
    const resp = await fetchGet(url);
    let body = null;
    try { body = JSON.parse(resp.text); } catch {}
    if (body && !Array.isArray(body) && body.error) {
        if (/limit|requests/i.test(body.error)) throw new Error("Inventar xizmati band (limit). Bir daqiqadan keyin «Yangilash»ni bosing");
        if (/private|public/i.test(body.error)) throw new Error("Steam inventaringiz yopiq (private). Uni Steam sozlamalarida ochiq qiling");
        throw new Error("Inventarni hozir yuklab bo'lmadi, keyinroq urinib ko'ring");
    }
    if (resp.status < 200 || resp.status >= 300 || !Array.isArray(body)) {
        throw new Error("Inventarni hozir yuklab bo'lmadi, keyinroq urinib ko'ring");
    }
    const items = parseWebApiInventory(body);
    webApiCache.set(steamId64, { data: items, ts: Date.now() });
    communityInvCache.set(steamId64, { data: items, ts: Date.now(), totalCount: items.length, hiddenCount: 0 });
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

module.exports = { fetchInventory, fetchUserInventory, fetchCommunityInventory, communityInventoryMeta, parseCommunityInventory, parseWebApiInventory, steamWebApiInventory, curlGet, steamApisGet };
