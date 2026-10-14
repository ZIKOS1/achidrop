// Skin sotish (Instant Sell) — user o'z Steam inventaridan skin(lar)ni
// tanlab, tizimga Lis-Skins narxidan arzonroq (marja %) narxda sotadi.
// Oqim (qo'lda, relay'siz):
//   1. createSellRequest — narx Lis-Skins'dan hisoblanadi va so'rov
//      "awaiting_admin" holatida saqlanadi. UI userga bizning trade
//      linkimizni ko'rsatadi, user skinni Steam orqali O'ZI yuboradi.
//   2. Adminga Telegram'da xabar boradi ("✅ Oldim" / "❌ Rad etish").
//   3. Admin Steam'da skin kelganini tekshirib "Oldim"ni bosadi →
//      approveSellRequest: pul balansga tushadi, lekin kartaga yechish
//      SELL_HOLD_MS (8 kun 12 soat) o'tgach ochiladi (balanceManager ledger).
//
// MUHIM (jarayonlararo xavfsizlik): bot (lokal) va mini-app (Vercel) alohida
// jarayonlar — holat o'zgarishi va pulni kreditlash BITTA MongoDB
// tranzaksiyasida bajariladi, va faqat "awaiting_admin" holatidagi so'rovga
// tegiladi. Shu sabab admin tugmani ikki marta bossa ham (yoki ikki joydan)
// pul ikki marta tushmaydi.
const { read, refresh, withTransaction, readTx, writeTx } = require("./database/db");
const { getInstantSellPricesSom, isLisConfigured } = require("./lisSkinsPrice");

const SELL_HOLD_MS = (8 * 24 + 12) * 60 * 60 * 1000; // 8 kun 12 soat
const MAX_ITEMS_PER_REQUEST = 30;
const MAX_OPEN_REQUESTS_PER_USER = 3;

function asArray(raw) {
    return Array.isArray(raw) ? raw : (raw ? Object.values(raw) : []);
}

function getAllRequests() {
    return asArray(read("instantSellRequests"));
}
function getInstantSellRequest(id) {
    return getAllRequests().find(r => r.id === id) || null;
}
function getMyInstantSellRequests(userId) {
    return getAllRequests().filter(r => r.userId === userId).sort((a, b) => b.id - a.id);
}
function getRequestsForAdmin(status) {
    return getAllRequests()
        .filter(r => !status || r.status === status)
        .sort((a, b) => b.id - a.id);
}

// Sof funksiya (testlanadi): yangi so'rovni mavjudlariga nisbatan tekshiradi.
// Bir xil skin (assetId) ikkita ochiq so'rovda bo'lmasin — aks holda user
// bitta skinni yuborib, ikki marta pul olishga urinishi mumkin.
function validateNewRequest(existing, userId, assetIds) {
    const open = existing.filter(r => r.userId === userId && r.status === "awaiting_admin");
    if (open.length >= MAX_OPEN_REQUESTS_PER_USER) return { error: "too_many_open" };
    const busy = new Set(open.flatMap(r => (r.items || []).map(i => String(i.assetId))));
    const dup = assetIds.filter(a => busy.has(String(a)));
    if (dup.length) return { error: "already_requested", assetIds: dup };
    return { ok: true };
}

function nextId(existing) {
    let id = Date.now();
    const ids = new Set(existing.map(r => r.id));
    while (ids.has(id)) id++;
    return id;
}

// items: [{ assetId, marketHashName, name, imageUrl?, float? }]
async function createSellRequest(userId, items) {
    if (!isLisConfigured()) return { error: "no_key" };
    if (!Array.isArray(items) || !items.length) return { error: "empty" };
    if (items.length > MAX_ITEMS_PER_REQUEST) return { error: "too_many" };

    // Tashqi I/O (Lis) — tranzaksiyadan TASHQARIDA (fn qayta ishga tushishi mumkin).
    const prices = await getInstantSellPricesSom(items.map(i => i.marketHashName));
    const missing = items.filter(i => !Number.isFinite(prices.get(i.marketHashName)));
    if (missing.length) return { error: "price_not_found", assetIds: missing.map(i => String(i.assetId)) };

    const priced = items.map(i => ({
        assetId: String(i.assetId),
        marketHashName: i.marketHashName,
        name: i.name ?? i.marketHashName,
        imageUrl: i.imageUrl ?? null,
        float: Number.isFinite(i.float) ? i.float : null,
        priceSom: prices.get(i.marketHashName),
    }));
    const totalSom = priced.reduce((s, i) => s + i.priceSom, 0);

    const result = await withTransaction(async (session) => {
        const requests = asArray(await readTx(session, "instantSellRequests"));
        const check = validateNewRequest(requests, userId, priced.map(i => i.assetId));
        if (check.error) return check;

        const request = {
            id: nextId(requests), userId,
            items: priced, totalSom,
            status: "awaiting_admin", // awaiting_admin | credited | rejected
            createdAt: new Date().toISOString(),
            resolvedAt: null, rejectReason: null,
        };
        requests.push(request);
        await writeTx(session, "instantSellRequests", requests);
        return { request, cacheUpdates: { instantSellRequests: requests } };
    });
    return result;
}

// Sof funksiya (testlanadi) — tranzaksiya ichida users/ledgers massivlarini
// o'zgartiradi. Ledger yozuvi balanceManager.creditTradeProceeds bilan bir
// xil shaklda (admin paneldagi "bekor qilish" va "Balans" sahifasi ham
// shu yozuvlarni oddiy tushum kabi ko'radi), faqat `holdMs` bilan.
function creditRequestInTx(users, ledgers, request, now = new Date()) {
    const user = users.find(u => u.id === request.userId);
    if (!user) return false;
    user.balance = (user.balance ?? 0) + request.totalSom;
    if (!Array.isArray(user.balanceHistory)) user.balanceHistory = [];
    user.balanceHistory.push({
        amount: request.totalSom,
        reason: `Skin sotildi (#${request.id}, ${request.items.length} ta)`,
        date: now.toISOString(),
    });

    let ledger = ledgers.find(l => l.userId === request.userId);
    if (!ledger) { ledger = { userId: request.userId, entries: [] }; ledgers.push(ledger); }
    if (!Array.isArray(ledger.entries)) ledger.entries = [];
    ledger.entries.push({
        id: now.getTime() + "-" + Math.random().toString(36).slice(2, 6),
        amount: request.totalSom, source: "instant_sell", tradeId: request.id, fee: 0,
        receivedAt: now.toISOString(),
        holdMs: SELL_HOLD_MS,
        withdrawalStatus: null,
    });
    return true;
}

async function approveSellRequest(id) {
    return withTransaction(async (session) => {
        const requests = asArray(await readTx(session, "instantSellRequests"));
        const request = requests.find(r => r.id === id);
        if (!request) return { error: "not_found" };
        if (request.status !== "awaiting_admin") return { error: "wrong_state", request };

        const users = asArray(await readTx(session, "users"));
        const ledgers = asArray(await readTx(session, "tradeBalances"));
        if (!creditRequestInTx(users, ledgers, request)) return { error: "user_not_found" };

        request.status = "credited";
        request.resolvedAt = new Date().toISOString();

        await writeTx(session, "users", users);
        await writeTx(session, "tradeBalances", ledgers);
        await writeTx(session, "instantSellRequests", requests);
        return { request, cacheUpdates: { users, tradeBalances: ledgers, instantSellRequests: requests } };
    });
}

async function rejectSellRequest(id, reason) {
    return withTransaction(async (session) => {
        const requests = asArray(await readTx(session, "instantSellRequests"));
        const request = requests.find(r => r.id === id);
        if (!request) return { error: "not_found" };
        if (request.status !== "awaiting_admin") return { error: "wrong_state", request };
        request.status = "rejected";
        request.resolvedAt = new Date().toISOString();
        request.rejectReason = reason || null;
        await writeTx(session, "instantSellRequests", requests);
        return { request, cacheUpdates: { instantSellRequests: requests } };
    });
}

// Userga yuboriladigan xabarlar (bot ham, admin panel ham bir xil matn ishlatadi).
function approvedText(request) {
    return `✅ *Skin sotish #${request.id} tasdiqlandi!*\n\n` +
        `💰 *${request.totalSom.toLocaleString()} so'm* balansingizga tushdi.\n\n` +
        `⏳ Pulni 8 kun 12 soatdan keyin "Balans" bo'limidan kartaga yechib olishingiz mumkin.`;
}
function rejectedText(request) {
    return `❌ *Skin sotish #${request.id} rad etildi.*` +
        (request.rejectReason ? `\n\nSabab: ${request.rejectReason}` : "") +
        `\n\nSavol bo'lsa, qo'llab-quvvatlash bo'limiga yozing.`;
}

async function refreshRequests() {
    await refresh("instantSellRequests").catch(() => {});
}

module.exports = {
    SELL_HOLD_MS, MAX_ITEMS_PER_REQUEST, MAX_OPEN_REQUESTS_PER_USER,
    createSellRequest, approveSellRequest, rejectSellRequest,
    getInstantSellRequest, getMyInstantSellRequests, getRequestsForAdmin, refreshRequests,
    validateNewRequest, creditRequestInTx, approvedText, rejectedText,
};
