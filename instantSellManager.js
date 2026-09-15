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
//      pul balansga qo'shiladi.
//
// MUHIM (jarayonlararo xavfsizlik): bot va mini-app (Vercel) alohida
// jarayonlar, har birining o'z xotiradagi keshi bor. Shu sabab
// "instantSellRequests" bilan ishlashda — xuddi bid/obmen pul amallaridagi
// kabi — o'qishdan oldin refresh() qilinadi, holatni o'zgartirish + pulni
// kreditlash esa BITTA MongoDB tranzaksiyasida bajariladi
// (balanceManager.reverseTradeCreditEntry naqshi). Aks holda: (a) mini-appdan
// yaratilgan so'rov bot jarayonida ko'rinmay qolishi, (b) ikki jarayonning
// yozuvi bir-birini bosib yuborishi, (c) kreditlash bilan "credited" deb
// saqlash orasida jarayon uzilib, keyingi tsiklda IKKI MARTA kreditlanishi
// mumkin edi.
const { read, write, refresh, withTransaction, readTx, writeTx } = require("./database/db");
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

    // Boshqa jarayon (bot ⇄ mini-app) shu orada yozgan so'rovlar ustiga
    // eski keshni bosib yubormaslik uchun — yozishdan oldin eng yangi
    // holatni olamiz.
    await refresh("instantSellRequests").catch(() => {});
    const all = getAllRequests();
    all.push(request);
    saveAllRequests(all);
    return { request };
}

// balanceManager.creditTradeProceeds()'ning tranzaksiya ICHIDAGI nusxasi —
// o'sha funksiyaning o'zi oddiy read/write bilan ishlaydi, shu sabab boshqa
// modulning Mongo sessiyasi ichida xavfsiz chaqirib bo'lmaydi. Bu yerda
// yozuvlar shakli bir xil saqlanadi (balans tarixi + 7 kunlik hold ledgeri),
// shu sabab admin paneldagi "bekor qilish" (reverseTradeCreditEntry) va
// "Balans" sahifasi bu yozuvlarni ham xuddi oddiy tushum kabi ko'radi.
// `fee` har doim 0 (Instant Sell'da komissiya narxning o'zida hisobga
// olingan — instantSellMarginPercent), shu sabab "tradeFees" yozuvi yo'q.
function creditRequestInTx(users, ledgers, request) {
    const user = users.find(u => u.id === request.userId);
    if (user) {
        user.balance = (user.balance ?? 0) + request.priceSom;
        if (!Array.isArray(user.balanceHistory)) user.balanceHistory = [];
        user.balanceHistory.push({
            amount: request.priceSom,
            reason: `Obmen — skin sotildi (#${request.id})`,
            date: new Date().toISOString(),
        });
    }
    let ledger = ledgers.find(l => l.userId === request.userId);
    if (!ledger) { ledger = { userId: request.userId, entries: [] }; ledgers.push(ledger); }
    if (!Array.isArray(ledger.entries)) ledger.entries = [];
    ledger.entries.push({
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        amount: request.priceSom, source: "trade", tradeId: request.id, fee: 0,
        receivedAt: new Date().toISOString(),
        withdrawalStatus: null, // null | "pending" | "withdrawn"
    });
}

// index.js'dagi setInterval orqali chaqiriladi — kreditlangan so'rovlar
// massivini qaytaradi (bildirishnomani chaqiruvchi yuboradi). `_polling` —
// agar oldingi chaqiruv (masalan relay sekin javob bergani uchun) hali
// tugamagan bo'lsa, ustma-ust ishga tushib bir xil so'rovni ikki marta
// kreditlab qo'ymasligi uchun.
let _polling = false;
async function pollAndCreditPendingRequests() {
    if (_polling) return [];
    _polling = true;
    try {
        return await _pollAndCreditPendingRequestsInner();
    } finally {
        _polling = false;
    }
}

async function _pollAndCreditPendingRequestsInner() {
    // ── 1-bosqich: relay bilan gaplashish (TASHQI I/O) ─────────────────────
    // Bu QAT'IY ravishda tranzaksiyadan TASHQARIDA bo'lishi kerak:
    // withTransaction'ning `fn` funksiyasi to'qnashuvda qayta ishga
    // tushirilishi mumkin (database/db.js izohiga qarang), tashqi so'rov esa
    // qayta bajarilib kutilmagan natija berardi.
    await refresh("instantSellRequests").catch(() => {});
    const all = getAllRequests();
    const pending = all.filter(r => r.status === "awaiting_deposit" && new Date(r.expiresAt).getTime() > Date.now());

    const outcomes = new Map(); // requestId -> { status, receivedAssetId? }
    for (const request of pending) {
        let body;
        try {
            const resp = await fetch(`${relayBase()}/deposit-status/${request.id}`, { headers: relayHeaders() });
            body = await resp.json();
        } catch {
            continue; // relay vaqtincha ishlamasa — keyingi tsiklda qayta tekshiramiz
        }

        if (body.status === "expired") {
            outcomes.set(request.id, { status: "expired" });
        } else if (body.status === "accepted") {
            // Ikkinchi bosqichli tekshiruv: kelgan item nomi so'ralganiga ANIQ mos kelishi shart.
            if (body.receivedItem?.marketHashName !== request.marketHashName) {
                outcomes.set(request.id, { status: "mismatch" }); // admin diqqatiga — pul BERILMAYDI
            } else {
                outcomes.set(request.id, { status: "credited", receivedAssetId: body.receivedItem.assetId });
            }
        }
    }

    const hasExpiredByTtl = all.some(r => r.status === "awaiting_deposit" && new Date(r.expiresAt).getTime() <= Date.now());
    if (!outcomes.size && !hasExpiredByTtl) return [];

    // ── 2-bosqich: holat o'zgarishi + pul kreditlash — BITTA tranzaksiyada ──
    const result = await withTransaction(async (session) => {
        const rawRequests = await readTx(session, "instantSellRequests");
        const requests = Array.isArray(rawRequests) ? rawRequests : [];

        const toCredit = [];
        let changed = false;
        for (const r of requests) {
            // Faqat hali "awaiting_deposit" bo'lganlarga tegamiz — boshqa
            // jarayon (yoki avvalgi, yarim uzilgan tsikl) allaqachon
            // "credited" qilib qo'ygan bo'lsa, ikkinchi marta kreditlanmaydi.
            if (r.status !== "awaiting_deposit") continue;
            const outcome = outcomes.get(r.id);
            if (outcome?.status === "credited") {
                r.status = "credited";
                r.creditedAt = new Date().toISOString();
                r.receivedAssetId = outcome.receivedAssetId;
                toCredit.push(r);
                changed = true;
            } else if (outcome?.status === "expired" || outcome?.status === "mismatch") {
                r.status = outcome.status;
                changed = true;
            } else if (!outcome && new Date(r.expiresAt).getTime() <= Date.now()) {
                r.status = "expired";
                changed = true;
            }
        }
        if (!changed) return { results: [] };

        const cacheUpdates = { instantSellRequests: requests };
        if (toCredit.length) {
            const rawUsers = await readTx(session, "users");
            const users = Array.isArray(rawUsers) ? rawUsers : Object.values(rawUsers);
            const rawLedgers = await readTx(session, "tradeBalances");
            const ledgers = Array.isArray(rawLedgers) ? rawLedgers : [];

            for (const r of toCredit) creditRequestInTx(users, ledgers, r);

            await writeTx(session, "users", users);
            await writeTx(session, "tradeBalances", ledgers);
            cacheUpdates.users = users;
            cacheUpdates.tradeBalances = ledgers;
        }
        await writeTx(session, "instantSellRequests", requests);

        return { results: toCredit.map(r => ({ request: r })), cacheUpdates };
    });

    return result?.results || [];
}

module.exports = { createInstantSellRequest, getInstantSellRequest, getMyInstantSellRequests, pollAndCreditPendingRequests };
