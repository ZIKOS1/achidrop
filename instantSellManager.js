// Instant Sell — foydalanuvchi o'z Steam inventaridan skin tanlab, tizimga
// (bot akkauntiga) DARHOL naqd evaziga sotadi. Oqim:
//   1. createInstantSellRequest — narx hisoblanadi, relay'ga "shu itemni,
//      shu userdan kutyapman" deb ro'yxatga olinadi (POST /deposit-expect).
//   2. Foydalanuvchi Steam orqali (o'zi, tizim tashqarisida) itemni bot
//      trade-link'iga yuboradi.
//   3. pollAndCreditPendingRequests (index.js'dagi setInterval orqali,
//      tradeDelivery.js/withdrawDelivery.js bilan bir xil naqsh) relay'dan
//      holatni so'raydi: "accepted" bo'lsa — item nomi ANIQ mos kelishini
//      YANA BIR BOR tekshirib (ikki bosqichli tasdiqlash), keyingina
//      balanceManager.creditTradeProceeds() chaqiradi.
const { read, write } = require("./database/db");
const { getInstantSellPriceSom } = require("./lisSkinsPrice");

const REQUEST_TTL_MS = 15 * 60 * 1000; // 15 daqiqa — shu vaqt ichida item kelmasa eskiradi

function relayHeaders() {
    return { "x-relay-secret": process.env.STEAM_RELAY_SECRET, "content-type": "application/json" };
}
function relayBase() {
    const url = process.env.STEAM_RELAY_URL;
    if (!url) throw new Error("STEAM_RELAY_URL sozlanmagan");
    return url.replace(/\/$/, "");
}

function getAllRequests() {
    const raw = read("instantSellRequests");
    return Array.isArray(raw) ? raw : [];
}
function saveAllRequests(arr) { write("instantSellRequests", arr); }

function getInstantSellRequest(id) {
    return getAllRequests().find(r => r.id === id) || null;
}
function getMyInstantSellRequests(userId) {
    return getAllRequests().filter(r => r.userId === userId).sort((a, b) => b.id - a.id);
}

// `marketHashName` — Steam market_hash_name (masalan "AK-47 | Redline
// (Field-Tested)") — narx VA relay'dagi item-mosligini tekshirish shu
// nom bo'yicha (aniq float emas — sabab: incoming trade offer'da GC float
// ma'lumoti yo'q, faqat market_hash_name kafolatlangan bor; narxlash ham
// odatda wear-tier darajasida, aniq float darajasida emas).
async function createInstantSellRequest(userId, assetId, marketHashName, steamId64) {
    const priceSom = await getInstantSellPriceSom(marketHashName);
    // `== null` NaN'ni USHLAMAYDI (NaN == null → false) — narx moduli buzilgan
    // javob qaytarsa, NaN balansgacha yetib borib uni butunlay buzib qo'yishi
    // mumkin. Asosiy himoya lisSkinsPrice.js'da, bu — ikkinchi qavat.
    if (priceSom == null || !Number.isFinite(priceSom) || priceSom <= 0) return { error: "price_not_found" };

    const id = Date.now();
    const request = {
        id, userId, assetId, marketHashName,
        priceSom, status: "awaiting_deposit",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + REQUEST_TTL_MS).toISOString(),
        creditedAt: null,
    };

    const resp = await fetch(`${relayBase()}/deposit-expect`, {
        method: "POST", headers: relayHeaders(),
        body: JSON.stringify({
            requestId: String(id),
            fromSteamId64: steamId64,
            marketHashName,
            ttlMs: REQUEST_TTL_MS,
        }),
    });
    if (!resp.ok) return { error: "relay_unavailable" };

    const all = getAllRequests();
    all.push(request);
    saveAllRequests(all);
    return { request };
}

// index.js'dagi setInterval orqali chaqiriladi. `onCredited(user, request)` —
// bildirishnoma yuborish uchun. `_polling` — agar oldingi chaqiruv (masalan
// relay sekin javob bergani uchun) hali tugamagan bo'lsa, ustma-ust
// ishga tushib bir xil so'rovni ikki marta kreditlab qo'ymasligi uchun.
let _polling = false;
async function pollAndCreditPendingRequests(creditTradeProceeds, onCredited) {
    if (_polling) return [];
    _polling = true;
    try {
        return await _pollAndCreditPendingRequestsInner(creditTradeProceeds, onCredited);
    } finally {
        _polling = false;
    }
}

async function _pollAndCreditPendingRequestsInner(creditTradeProceeds, onCredited) {
    const all = getAllRequests();
    const pending = all.filter(r => r.status === "awaiting_deposit" && new Date(r.expiresAt).getTime() > Date.now());
    if (!pending.length) {
        // Eskirganlarni belgilash
        let changed = false;
        for (const r of all) {
            if (r.status === "awaiting_deposit" && new Date(r.expiresAt).getTime() <= Date.now()) {
                r.status = "expired";
                changed = true;
            }
        }
        if (changed) saveAllRequests(all);
        return [];
    }

    const results = [];
    for (const request of pending) {
        let body;
        try {
            const resp = await fetch(`${relayBase()}/deposit-status/${request.id}`, { headers: relayHeaders() });
            body = await resp.json();
        } catch {
            continue; // relay vaqtincha ishlamasa — keyingi tsiklda qayta tekshiramiz
        }

        if (body.status === "expired") {
            request.status = "expired";
        } else if (body.status === "accepted") {
            // Ikkinchi bosqichli tekshiruv: kelgan item nomi so'ralganiga ANIQ mos kelishi shart.
            if (body.receivedItem?.marketHashName !== request.marketHashName) {
                request.status = "mismatch"; // admin diqqatiga — pul BERILMAYDI
            } else {
                request.status = "credited";
                request.creditedAt = new Date().toISOString();
                request.receivedAssetId = body.receivedItem.assetId;
                creditTradeProceeds(request.userId, request.priceSom, request.id, 0);
                results.push({ request });
            }
        }
    }
    saveAllRequests(all);
    return results;
}

module.exports = { createInstantSellRequest, getInstantSellRequest, getMyInstantSellRequests, pollAndCreditPendingRequests };
