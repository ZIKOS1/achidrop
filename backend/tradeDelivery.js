// Obmenda xaridor "Skinni oldim" tugmasini bosmasa ham — ikkala tomonning
// Steam inventarini solishtirib, skin haqiqatan sotuvchidan xaridorga
// o'tganini avtomatik aniqlab, savdoni yakunlash. Steam'ning shaxsiy trade
// tarixi (IEconService) faqat o'sha akkauntning o'z API key'i bilan ko'rinadi
// — foydalanuvchilardan buni so'ramaymiz (qo'shimcha ishonch talab qiladi),
// shu sabab buning o'rniga ALLAQACHON mavjud (fetchUserInventory) OCHIQ
// inventar solishtiriladi: ketma-ket REQUIRED_STREAK marta to'liq mos
// kelmasa yakunlanmaydi — Steam keshidagi vaqtinchalik nosozlikdan tasodifiy
// noto'g'ri tasdiqlash bo'lmasligi uchun.
const { read } = require("./database/db");
const { fetchUserInventory } = require("./steam");
const tradeManager = require("./tradeManager");

const REQUIRED_STREAK = 2;

function readUsers() {
    const d = read("users");
    return Array.isArray(d) ? d : Object.values(d);
}
function getUser(users, id) { return users.find(u => u.id === id) || null; }

// Nom + float bo'yicha kalit — assetId savdodan keyin o'zgarib ketadi, shu
// sabab shu ikkisi bilan moslashtiramiz (float deyarli har doim noyob).
function itemKey(name, float) {
    return `${name}::${float != null ? Number(float).toFixed(4) : ""}`;
}
function countByKey(items) {
    const map = new Map();
    for (const it of items) {
        const key = itemKey(it.name, it.float ?? null);
        map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
}

// markSent chaqirilgan zahoti (tradeHandler.js / server.js'dan) chaqiriladi.
async function snapshotBuyerBaseline(trade, buyerSteamId64) {
    if (!buyerSteamId64) return;
    try {
        const items = await fetchUserInventory(buyerSteamId64);
        const counts = countByKey(items);
        const baseline = {};
        for (const skin of trade.skins || []) {
            const key = itemKey(skin.name, skin.float ?? null);
            baseline[key] = counts.get(key) || 0;
        }
        tradeManager.setDeliveryBaseline(trade.id, baseline);
    } catch {
        // Relay vaqtincha ishlamasa ham muammo emas — baseline bo'lmasa
        // checkTrade shu obmenni shunchaki o'tkazib yuboradi, qo'lda
        // "Skinni oldim" tugmasi baribir ishlayveradi.
    }
}

async function checkTrade(trade, users) {
    if (trade.status !== "buyer_confirming") return null;
    const seller = getUser(users, trade.sellerId);
    const buyer  = getUser(users, trade.buyerId);
    if (!seller?.steamId64 || !buyer?.steamId64) return null;
    if (!trade.deliveryBaseline) return null;

    let sellerItems, buyerItems;
    try {
        [sellerItems, buyerItems] = await Promise.all([
            fetchUserInventory(seller.steamId64),
            fetchUserInventory(buyer.steamId64),
        ]);
    } catch {
        return null;
    }

    const sellerAssetIds = new Set(sellerItems.map(it => String(it.assetId)));
    const leftSeller = (trade.skins || []).every(s => !sellerAssetIds.has(String(s.assetId)));

    // Bir xil nom+float'dagi (masalan float'siz 2 ta bir xil case) skinlar
    // bitta obmenda birga bo'lsa, har birini alohida "+1" deb tekshirish
    // noto'g'ri bo'lardi (bittasi kelishi bilan ikkalasi ham "keldi" deb
    // hisoblanib qolardi) — shu sabab kalit bo'yicha kerakli sonni
    // yig'ib, jamlab solishtiramiz.
    const neededByKey = new Map();
    for (const s of trade.skins || []) {
        const key = itemKey(s.name, s.float ?? null);
        neededByKey.set(key, (neededByKey.get(key) || 0) + 1);
    }
    const buyerCounts = countByKey(buyerItems);
    const arrivedAtBuyer = [...neededByKey.entries()].every(([key, qty]) => {
        const need = (trade.deliveryBaseline[key] || 0) + qty;
        return (buyerCounts.get(key) || 0) >= need;
    });

    const matched = leftSeller && arrivedAtBuyer;
    const updated = tradeManager.markDeliveryProgress(trade.id, { leftSeller, matched });
    if (!updated) return null;

    if (matched && updated.deliveryMatchStreak >= REQUIRED_STREAK) {
        return tradeManager.autoCompleteTrade(trade.id);
    }
    return null;
}

// index.js'dagi setInterval orqali chaqiriladi. `onCompleted(trade)` —
// savdo avtomatik yakunlanganda bildirishnoma/balans uchun chaqiriladi
// (tradeHandler.js'dagi "Skinni oldim" bosilgandagi bilan bir xil ish).
async function checkAllPendingDeliveries(onCompleted) {
    const trades = tradeManager.getTradesAwaitingDelivery();
    if (!trades.length) return;
    const users = readUsers();
    for (const trade of trades) {
        try {
            const result = await checkTrade(trade, users);
            if (result?.trade) await onCompleted(result.trade);
        } catch (err) {
            console.log(`OBMEN AUTO-TEKSHIRUV XATO (#${trade.id}):`, err.message);
        }
    }
}

module.exports = { snapshotBuyerBaseline, checkAllPendingDeliveries };
