// "Obmen" (P2P skin savdo/escrow) state machine. Auksion tizimidan mustaqil —
// bu yerda pul harakati faqat BUYER.balance ustida ishlaydi (bid tizimidagi
// darhol debit/kredit naqshiga o'xshab: tasdiqlangan narx "hold" qilinganda
// darhol yechiladi, bekor qilinsa qaytariladi). Sotuvchiga tegishli tushum
// balanceManager.js orqali alohida 7-kunlik "hold" ledgeriga tushadi — bu
// funksiyalar chaqiruvchi (handler) tomonidan tradeManager natijasidan keyin
// ishga tushiriladi, shu sabab bu faylda balanceManager'ga bog'liqlik yo'q.
const { read, write, withTransaction, readTx, writeTx } = require("./database/db");

// server.js'dagi logBalance bilan bir xil naqsh — "Bal tarixi" sahifasida
// obmen orqali sotib olish/bekor qilinganda pul qaytishi ham ko'rinishi uchun.
function logBalance(user, amount, reason) {
    if (!user) return;
    if (!Array.isArray(user.balanceHistory)) user.balanceHistory = [];
    user.balanceHistory.push({ amount, reason, date: new Date().toISOString() });
}

const STALE_MS = 24 * 60 * 60 * 1000; // 24 soat — javobsiz obmenni bekor qilish muddati

function getAllUsers() {
    const raw = read("users");
    return Array.isArray(raw) ? raw : Object.values(raw);
}
function findUser(users, id) { return users.find(u => u.id === id) || null; }

function getTrades() {
    const raw = read("trades");
    return Array.isArray(raw) ? raw : [];
}
function saveTrades(arr) { write("trades", arr); }

function getTradeById(id) {
    return getTrades().find(t => t.id === id) || null;
}

// Ochiq (buyer kutayotgan) obmenlar — o'zining e'lonlari bundan tashqari.
// Faqat "public" e'lonlar qaytariladi — "private" e'lonlar bu ro'yxatda
// ko'rinmaydi, ularga faqat taklif havolasi (inviteLink) orqali kirish mumkin
// (GET /api/trades/:id status "open" bo'lsa har qanday login qilgan userga ochiq,
// shu sabab private uchun boshqa maxsus ruxsat tekshiruvi shart emas — faqat
// ro'yxatdan yashirish yetarli).
function getOpenTrades(excludeSellerId = null) {
    return getTrades().filter(t => t.status === "open" && t.sellerId !== excludeSellerId && t.visibility !== "private");
}

// Foydalanuvchining o'zi ishtirok etayotgan (yakunlanmagan) obmenlari.
function getMyTrades(userId) {
    return getTrades().filter(t =>
        (t.sellerId === userId || t.buyerId === userId) &&
        t.status !== "completed" && t.status !== "cancelled"
    );
}

// ── Market (kind:"market") uchun yordamchilar ──────────────────────────────
// Katalogda ko'rinadigan (hali sotilmagan) e'lonlar — har doim "public",
// shu sabab visibility bo'yicha filtr shart emas (market yaratishda private
// tanlanmaydi).
function getMarketListings() {
    return getTrades().filter(t => t.kind === "market" && t.status === "open");
}

// Foydalanuvchining o'zi ochgan (sotuvchi) yoki sotib olayotgan/olgan
// (xaridor) market e'lonlari — holatidan qat'i nazar (tugallangan/bekor
// qilinganlar ham "tarix" sifatida ko'rinishi uchun, Obmendagi getMyTrades'dan
// farqli).
function getMyMarketTrades(userId) {
    return getTrades().filter(t => t.kind === "market" && (t.sellerId === userId || t.buyerId === userId));
}

function logAudit(trade, status, byUserId) {
    if (!Array.isArray(trade.auditLog)) trade.auditLog = [];
    trade.auditLog.push({ status, at: new Date().toISOString(), byUserId });
    trade.lastActivityAt = new Date().toISOString();
}

// Taklif havolasi obmen ochilgan joyga qarab farqlanadi — Telegram ichida
// ochilgan bo'lsa botga (t.me/...?start=trade_ID), websaytdan ochilgan bo'lsa
// saytga (?trade=ID) olib boradi. `trade.origin` saqlanadi, shu sabab havola
// keyinchalik (masalan BOT_USERNAME/WEBAPP_URL o'zgarsa ham) to'g'ri qayta
// hisoblanishi mumkin — shuning uchun har doim shu funksiya orqali olinadi.
function inviteLinkFor(trade) {
    if (trade.origin === "website") {
        return process.env.WEBAPP_URL ? `${process.env.WEBAPP_URL}/?trade=${trade.id}` : null;
    }
    return process.env.BOT_USERNAME ? `https://t.me/${process.env.BOT_USERNAME}?start=trade_${trade.id}` : null;
}

// `initialPrice` — sotuvchi skinni tanlagan zahoti so'ragan narxi (ixtiyoriy).
// Berilsa, sotuvchi tasdig'i darhol qo'yiladi (o'zi belgilagani uchun) — xaridor
// qo'shilgach faqat uning tasdig'i kerak bo'ladi (bo'sh "negotiating" bosqichisiz).
// `visibility` — "public" (default, "Ochiq e'lonlar" ro'yxatida ko'rinadi va
// kimdir taklif/narx berishi mumkin) yoki "private" (ro'yxatda ko'rinmaydi,
// faqat sotuvchi bergan taklif havolasi orqali kirish mumkin).
// `promoCode` — agar "obmen" turidagi promo kod muvaffaqiyatli qo'llanilgan
// bo'lsa (redeemTradePromo chaqiruvchi tomonidan, server.js'da), shu obmen
// yakunlanganda komissiya butunlay olib tashlanadi (feeWaived).
// `skins` — HAR DOIM massiv (bitta skin bo'lsa ham `[skin]`) — bir nechta
// skinni bitta obmen ichida sotish uchun (barchasi bir xil narx/kelishuvda,
// bitta chat/escrow ostida boradi, alohida-alohida obmen bo'lib qolmaydi).
// `kind` — "obmen" (default, chat/muzokara bilan) yoki "market" (CS.Float
// uslubidagi katalog e'loni — bitta skin, narx majburiy, muzokarasiz bitta
// bosishda sotib olinadi). Ikkalasi ham xuddi shu state machine/escrow/
// balans/avtomatik-yetkazish mantig'ini ishlatadi — faqat qanday
// yaratilgani/ro'yxatlanishi farq qiladi, shu sabab bu yerda alohida
// state machine yozilmagan.
function createTrade(sellerId, skins, origin, initialPrice, visibility, promoCode, kind) {
    const trades = getTrades();
    const id = Date.now();
    const hasPrice = Number.isFinite(initialPrice) && initialPrice > 0;
    const trade = {
        id, sellerId, buyerId: null,
        skins: Array.isArray(skins) ? skins : [skins],
        kind: kind === "market" ? "market" : "obmen",
        origin: origin === "website" ? "website" : "telegram",
        visibility: visibility === "private" ? "private" : "public",
        status: "open",
        agreedPrice: hasPrice ? initialPrice : null,
        priceProposedBy: hasPrice ? sellerId : null,
        sellerConfirmed: hasPrice, buyerConfirmed: false, priceLocked: false,
        buyerFundsHeld: false,
        sellerMarkedSent: false, buyerMarkedReceived: false,
        feeWaived: !!promoCode,
        promoCode: promoCode || null,
        inviteLink: null,
        chatLog: [],
        auditLog: [],
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        completedAt: null,
    };
    trade.inviteLink = inviteLinkFor(trade);
    logAudit(trade, "open", sellerId);
    trades.push(trade);
    saveTrades(trades);
    return trade;
}

function joinTrade(tradeId, buyerId) {
    const trades = getTrades();
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return { error: "not_found" };
    if (trade.sellerId === buyerId) return { error: "self" };
    if (trade.status !== "open") return { error: "not_open" };

    trade.buyerId = buyerId;
    // Sotuvchi allaqachon narx belgilagan bo'lsa (creationda) — to'g'ridan-to'g'ri
    // tasdiqlash bosqichiga o'tadi, bo'sh "kelishuv" bosqichi shart emas.
    trade.status = trade.agreedPrice != null ? "awaiting_confirmations" : "negotiating";
    logAudit(trade, trade.status, buyerId);
    saveTrades(trades);
    return { trade };
}

function proposePrice(tradeId, byUserId, price) {
    const trades = getTrades();
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return { error: "not_found" };
    if (![trade.sellerId, trade.buyerId].includes(byUserId)) return { error: "forbidden" };
    if (trade.priceLocked) return { error: "locked" };
    if (!Number.isFinite(price) || price <= 0) return { error: "invalid_price" };

    trade.agreedPrice     = price;
    trade.priceProposedBy = byUserId;
    trade.sellerConfirmed = false;
    trade.buyerConfirmed  = false;
    trade.status          = "awaiting_confirmations";
    logAudit(trade, "awaiting_confirmations", byUserId);
    saveTrades(trades);
    return { trade };
}

// Ikkalasi ham tasdiqlagach: xaridor balansi tekshiriladi, yetarli bo'lsa
// darhol yechiladi ("hold" — auksion bid'idagi debit naqshiga mos) va narx
// qulflanadi. Yetmasa — xaridor tasdig'i bekor qilinadi (edge case: "Xaridor
// balansida yetarli mablag' yo'q bo'lsa, tasdiqlash bloklanadi").
//
// Bitta MongoDB tranzaksiyasida bajariladi (bidManager.js bilan bir xil
// sabab): sotuvchi va xaridor deyarli bir vaqtda "Tasdiqlayman" bossa,
// yoki xaridor shu payt boshqa joyda balansini sarflab qo'ysa ham, ikkita
// parallel `confirmTrade` chaqiruvidan biri ikkinchisining o'zgarishini
// "ko'rmay" bosib yozib yubormaydi — Mongo to'qnashuvni aniqlab, birini
// avtomatik qayta ishga tushiradi (yangilangan holat bilan).
async function confirmTrade(tradeId, byUserId) {
    return withTransaction(async (session) => {
        const trades = await readTx(session, "trades");
        const trade = trades.find(t => t.id === tradeId);
        if (!trade) return { error: "not_found" };
        if (![trade.sellerId, trade.buyerId].includes(byUserId)) return { error: "forbidden" };
        if (!trade.agreedPrice || trade.priceLocked) return { error: "no_price" };

        if (byUserId === trade.sellerId) trade.sellerConfirmed = true;
        if (byUserId === trade.buyerId)  trade.buyerConfirmed  = true;

        if (trade.sellerConfirmed && trade.buyerConfirmed) {
            const rawUsers = await readTx(session, "users");
            const users = Array.isArray(rawUsers) ? rawUsers : Object.values(rawUsers);
            const buyer = findUser(users, trade.buyerId);
            if (!buyer || (buyer.balance ?? 0) < trade.agreedPrice) {
                trade.buyerConfirmed = false;
                await writeTx(session, "trades", trades);
                return { error: "insufficient_balance", trade, cacheUpdates: { trades } };
            }
            buyer.balance -= trade.agreedPrice;
            logBalance(buyer, -trade.agreedPrice, `Obmen — skin sotib olindi (#${trade.id})`);

            trade.priceLocked    = true;
            trade.buyerFundsHeld = true;
            trade.status         = "seller_sending";
            logAudit(trade, "seller_sending", byUserId);

            await writeTx(session, "users", users);
            await writeTx(session, "trades", trades);
            return { trade, locked: true, cacheUpdates: { trades, users } };
        }

        logAudit(trade, trade.status, byUserId);
        await writeTx(session, "trades", trades);
        return { trade, locked: false, cacheUpdates: { trades } };
    });
}

// Market'da bitta bosishda sotib olish. AVVAL joinTrade() + confirmTrade()
// ketma-ket ikkita alohida chaqiruv sifatida yozilgan edi — buni test
// qilishda darhol takrorlanadigan haqiqiy race aniqlandi: joinTrade oddiy
// write() orqali (kesh darhol, Mongo fon rejimida/kutilmasdan) yozadi, keyin
// confirmTrade() o'zining tranzaksiyasi ichida Mongo'dan ENG YANGI holatni
// qayta o'qiydi (readTx) — agar joinTrade'ning Mongo yozuvi hali ulgurmagan
// bo'lsa, confirmTrade eski (hali buyerId yo'q) holatni o'qib "forbidden"
// bilan chiqib ketadi, xaridor "qo'shilgan" holatda ilib qoladi va boshqa
// hech qachon tasdiqlanmaydi (status endi "open" emas, /buy qayta ishlamaydi).
// Fix: ikkalasini BITTA tranzaksiyada, bitta o'qishdan keyin bajarish —
// oraliqda hech qanday tashqi write() bo'lmaydi, shu sabab race yo'qoladi.
async function buyMarketListing(tradeId, buyerId) {
    return withTransaction(async (session) => {
        const trades = await readTx(session, "trades");
        const trade = trades.find(t => t.id === tradeId);
        if (!trade || trade.kind !== "market") return { error: "not_found" };
        if (trade.sellerId === buyerId) return { error: "self" };
        if (trade.status !== "open") return { error: "not_open" };

        const rawUsers = await readTx(session, "users");
        const users = Array.isArray(rawUsers) ? rawUsers : Object.values(rawUsers);
        const buyer = findUser(users, buyerId);
        if (!buyer || (buyer.balance ?? 0) < trade.agreedPrice) {
            return { error: "insufficient_balance" };
        }

        buyer.balance -= trade.agreedPrice;
        logBalance(buyer, -trade.agreedPrice, `Market — skin sotib olindi (#${trade.id})`);

        trade.buyerId = buyerId;
        trade.buyerConfirmed = true;
        trade.priceLocked = true;
        trade.buyerFundsHeld = true;
        trade.status = "seller_sending";
        logAudit(trade, "seller_sending", buyerId);

        await writeTx(session, "users", users);
        await writeTx(session, "trades", trades);
        return { trade, cacheUpdates: { trades, users } };
    });
}

// ── Avtomatik yetkazib berish tekshiruvi (tradeDelivery.js orqali) ─────────
// Xaridor "Skinni oldim" tugmasini bosmasa ham, ikkala tomon OCHIQ Steam
// inventarini solishtirib skin haqiqatan o'tganini aniqlash uchun. Bu yerda
// faqat holat saqlanadi — Steam bilan gaplashish (async) tradeDelivery.js'da.
function getTradesAwaitingDelivery() {
    return getTrades().filter(t => t.status === "buyer_confirming");
}

// markSent chaqirilgan zahoti (xaridor hali skinni olmagan) xaridorning shu
// paytdagi inventar sonini saqlaydi — keyingi tekshiruvlar shundan oshgan-
// oshmaganini solishtiradi (xaridorda avvaldan bor bir xil skin bilan
// chalkashmaslik uchun).
function setDeliveryBaseline(tradeId, baseline) {
    const trades = getTrades();
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return;
    trade.deliveryBaseline = baseline;
    trade.deliveryMatchStreak = 0;
    saveTrades(trades);
}

// `leftSeller` — skin sotuvchi inventaridan (assetId bo'yicha) ketganmi.
// `matched` — SHU tekshiruvda skin ham sotuvchidan ketgan, ham xaridorda
// paydo bo'lgan bo'lsa true — ketma-ket necha marta mos kelganini sanaydi
// (Steam keshidagi vaqtinchalik nosozlikdan tasodifiy yakunlanmasligi uchun).
function markDeliveryProgress(tradeId, { leftSeller, matched }) {
    const trades = getTrades();
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return null;
    if (leftSeller != null) trade.deliveryLeftSeller = leftSeller;
    trade.deliveryLastCheckedAt = new Date().toISOString();
    trade.deliveryMatchStreak = matched ? (trade.deliveryMatchStreak || 0) + 1 : 0;
    saveTrades(trades);
    return trade;
}

// markReceived bilan bir xil natija beradi, lekin xaridor tugmani bosishini
// talab qilmaydi — `byUserId: null` audit logda "tizim tomonidan" ekanini
// bildiradi.
function autoCompleteTrade(tradeId) {
    const trades = getTrades();
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return { error: "not_found" };
    if (trade.status !== "buyer_confirming") return { error: "wrong_state" };

    trade.feeAmount      = trade.feeWaived ? 0 : tradeFee(trade.agreedPrice);
    trade.sellerProceeds = trade.agreedPrice - trade.feeAmount;
    trade.buyerMarkedReceived = true;
    trade.buyerFundsHeld      = false;
    trade.autoConfirmed       = true;
    trade.status              = "completed";
    trade.completedAt         = new Date().toISOString();
    logAudit(trade, "completed", null);
    saveTrades(trades);
    return { trade };
}

function markSent(tradeId, sellerId) {
    const trades = getTrades();
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return { error: "not_found" };
    if (trade.sellerId !== sellerId) return { error: "forbidden" };
    if (trade.status !== "seller_sending") return { error: "wrong_state" };

    trade.sellerMarkedSent = true;
    trade.status = "buyer_confirming";
    logAudit(trade, "buyer_confirming", sellerId);
    saveTrades(trades);
    return { trade };
}

// Sayt komissiyasi — narx oralig'iga qarab qat'iy (foizsiz) summa, sotuvchi
// tushumidan ushlab qolinadi (xaridor har doim to'liq agreedPrice'ni to'laydi/
// hold qiladi, komissiya faqat sotuvchiga tegadigan summani kamaytiradi).
// `Math.min(..., price)` — narx juda kichik bo'lib qolsa ham (nazariy holat,
// amalda minInitialPrice buni oldini oladi) sotuvchi balansi manfiyga
// tushmasligini kafolatlaydi. Darajalar admin panel orqali sozlanadi
// (settings.tradeFeeTiers) — shu yerda faqat DEFAULT qiymatlar (settings
// bo'sh/buzilgan bo'lsa ishlatiladi).
const DEFAULT_FEE_TIERS = [
    { max: 100000,   fee: 3000 },
    { max: 500000,   fee: 5000 },
    { max: 10000000, fee: 10000 },
];
function getFeeTiers() {
    const s = read("settings");
    const settings = Array.isArray(s) ? {} : s;
    const tiers = settings.tradeFeeTiers;
    if (Array.isArray(tiers) && tiers.length && tiers.every(t => Number.isFinite(t.max) && Number.isFinite(t.fee))) {
        return tiers;
    }
    return DEFAULT_FEE_TIERS;
}
function tradeFee(price) {
    if (!Number.isFinite(price) || price < 1000) return 0;
    const tiers = getFeeTiers();
    const tier = tiers.find(t => price <= t.max) || tiers[tiers.length - 1];
    return Math.min(tier.fee, price);
}

// Xaridor "oldim" deganda — savdo yakunlanadi. Sotuvchining pul olishi
// (7 kunlik hold ledgeriga tushishi) chaqiruvchi handler tomonidan shu
// funksiya muvaffaqiyatli qaytgandan keyin balanceManager orqali bajariladi —
// shu sabab bu yerda komissiya hisoblab, `trade.feeAmount`/`trade.sellerProceeds`
// sifatida saqlab qo'yamiz, chaqiruvchi shundan foydalanadi.
function markReceived(tradeId, buyerId) {
    const trades = getTrades();
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return { error: "not_found" };
    if (trade.buyerId !== buyerId) return { error: "forbidden" };
    if (trade.status !== "buyer_confirming") return { error: "wrong_state" };

    trade.feeAmount      = trade.feeWaived ? 0 : tradeFee(trade.agreedPrice);
    trade.sellerProceeds = trade.agreedPrice - trade.feeAmount;
    trade.buyerMarkedReceived = true;
    trade.buyerFundsHeld      = false;
    trade.status              = "completed";
    trade.completedAt         = new Date().toISOString();
    logAudit(trade, "completed", buyerId);
    saveTrades(trades);
    return { trade };
}

function cancelTrade(tradeId, byUserId) {
    const trades = getTrades();
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return { error: "not_found" };
    if (trade.status === "completed" || trade.status === "cancelled") return { error: "wrong_state" };
    if (byUserId != null && ![trade.sellerId, trade.buyerId].includes(byUserId)) return { error: "forbidden" };

    let refunded = null;
    if (trade.buyerFundsHeld && trade.buyerId) {
        const users = getAllUsers();
        const buyer = findUser(users, trade.buyerId);
        if (buyer) {
            buyer.balance = (buyer.balance ?? 0) + trade.agreedPrice;
            logBalance(buyer, trade.agreedPrice, `Obmen bekor qilindi — pul qaytarildi (#${trade.id})`);
            write("users", users);
            refunded = trade.agreedPrice;
        }
        trade.buyerFundsHeld = false;
    }

    trade.status = "cancelled";
    logAudit(trade, "cancelled", byUserId);
    saveTrades(trades);
    return { trade, refunded };
}

function markDisputed(tradeId, byUserId) {
    const trades = getTrades();
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return { error: "not_found" };
    if (![trade.sellerId, trade.buyerId].includes(byUserId)) return { error: "forbidden" };
    if (trade.status === "completed" || trade.status === "cancelled") return { error: "wrong_state" };

    trade.status = "disputed";
    logAudit(trade, "disputed", byUserId);
    saveTrades(trades);
    return { trade };
}

// Buyer qo'shilgan, lekin 24 soatdan beri hech qanday harakat bo'lmagan
// obmenlarni avtomatik bekor qilib, band qilingan mablag'ni qaytaradi. Sof
// "open" (hali buyer yo'q) e'lonlar bunga kirmaydi — ular faqat sotuvchi
// o'zi bekor qilmaguncha ochiq turadi.
const STALE_STATES = ["negotiating", "awaiting_confirmations", "seller_sending", "buyer_confirming"];
function sweepStaleTrades() {
    const now = Date.now();
    const cancelled = [];
    for (const trade of getTrades()) {
        if (!STALE_STATES.includes(trade.status)) continue;
        if (!trade.lastActivityAt) continue;
        if (now - new Date(trade.lastActivityAt).getTime() < STALE_MS) continue;
        // Skin sotuvchi inventaridan allaqachon ketgani aniqlangan bo'lsa —
        // demak jarayon haqiqatan boshlangan (Steam trade-hold/escrow tufayli
        // xaridorga yetib borishi 7-15 kungacha cho'zilishi mumkin). Bunday
        // holatda "javobsiz" deb bekor qilib pulni xaridorga qaytarish
        // sotuvchini aldab qo'yadi (skin ketgan, pul ham qaytmagan) — shu
        // sabab bunday obmenlarni avtomatik bekor qilmaymiz, admin diqqatiga
        // qoldiramiz (tradeDelivery.js baribir kuzatishda davom etadi).
        if (trade.status === "buyer_confirming" && trade.deliveryLeftSeller) continue;
        const result = cancelTrade(trade.id, null);
        if (result?.trade) cancelled.push(result);
    }
    return cancelled;
}

module.exports = {
    createTrade, getTradeById, getOpenTrades, getMyTrades, inviteLinkFor,
    joinTrade, proposePrice, confirmTrade, markSent, markReceived,
    cancelTrade, markDisputed, sweepStaleTrades, tradeFee, getFeeTiers,
    DEFAULT_FEE_TIERS,
    getTradesAwaitingDelivery, setDeliveryBaseline, markDeliveryProgress, autoCompleteTrade,
    getMarketListings, getMyMarketTrades, buyMarketListing,
};
