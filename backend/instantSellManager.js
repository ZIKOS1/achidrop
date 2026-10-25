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
// Tranzaksiyalar butun massivlarni emas, faqat kerakli elementlarni o'qiydi
// (readTxWhere) va faqat o'zgargan maydonlarni yozadi (updateTx) — sekin
// Atlas'da to'liq massiv (340 KB + users 270 KB) har amalga 8–15 s qo'shardi.
const { read, refresh, withTransaction, readTxWhere, updateTx, patchCache } = require("./database/db");
const { getInstantSellQuotesSom, minSellSom, bulkSellSom, isLisConfigured } = require("./lisSkinsPrice");

const SELL_HOLD_MS = (8 * 24 + 12) * 60 * 60 * 1000; // 8 kun 12 soat
const REQ = "instantSellRequests";
const eq = (field, value) => ({ $eq: [`$$e.${field}`, value] });
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
// Har skin alohida so'rov, lekin bir sotuvdagilari bitta groupId'da —
// ochiq sotuvlar soni guruh bo'yicha cheklanadi.
function validateNewRequest(existing, userId, assetIds) {
    const open = existing.filter(r => r.userId === userId && r.status === "awaiting_admin");
    if (new Set(open.map(r => r.groupId ?? r.id)).size >= MAX_OPEN_REQUESTS_PER_USER) return { error: "too_many_open" };
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
// priceByAsset: Map(assetId -> so'm) — Lis avtosell narxi (faqat Lis cookie
// egasi uchun, lisAutosell.ownerPricesSom); bor bo'lsa formula o'rniga shu.
// Har skin uchun ALOHIDA so'rov yaratiladi (admin har birini alohida
// "Oldim"/"Rad etadi"), hammasi bitta groupId bilan. Natija: { requests }.
async function createSellRequest(userId, items, { priceByAsset = null } = {}) {
    if (!isLisConfigured()) return { error: "no_key" };
    if (!Array.isArray(items) || !items.length) return { error: "empty" };
    if (items.length > MAX_ITEMS_PER_REQUEST) return { error: "too_many" };

    // Tashqi I/O (Lis) — tranzaksiyadan TASHQARIDA (fn qayta ishga tushishi mumkin).
    const fixed = (i) => priceByAsset?.get(String(i.assetId));
    // Narx kaliti — Doppler'da nom + faza (buffPrice.priceKey), boshqasida nomning o'zi.
    const key = (i) => i.priceKey || i.marketHashName;
    const { prices: byName, tooCheap } = await getInstantSellQuotesSom(items.filter(i => !Number.isFinite(fixed(i))).map(key));
    const priceOf = (i) => Number.isFinite(fixed(i)) ? fixed(i) : byName.get(key(i));
    const minSom = minSellSom();
    const isCheap = (i) => Number.isFinite(fixed(i)) ? fixed(i) < minSom : tooCheap.has(key(i));
    // Arzon skinning narxi tooCheap'da (prices'da null).
    const sellPrice = (i) => !Number.isFinite(fixed(i)) && tooCheap.has(key(i)) ? tooCheap.get(key(i)) : priceOf(i);
    const cheap = items.filter(isCheap);
    // Arzon skinlar faqat jami BULK_SELL_USD dan oshgan sotuv ichida.
    if (cheap.length && items.reduce((n, i) => n + (sellPrice(i) || 0), 0) < bulkSellSom()) {
        return { error: "too_cheap", assetIds: cheap.map(i => String(i.assetId)) };
    }
    const missing = items.filter(i => !Number.isFinite(sellPrice(i)));
    if (missing.length) return { error: "price_not_found", assetIds: missing.map(i => String(i.assetId)) };

    const priced = items.map(i => ({
        assetId: String(i.assetId),
        marketHashName: i.marketHashName,
        phase: i.phase || null,
        name: i.name ?? i.marketHashName,
        imageUrl: i.imageUrl ?? null,
        float: Number.isFinite(i.float) ? i.float : null,
        priceSom: sellPrice(i),
    }));

    const result = await withTransaction(async (session) => {
        const open = await readTxWhere(session, REQ, { $and: [eq("userId", userId), eq("status", "awaiting_admin")] });
        const check = validateNewRequest(open, userId, priced.map(i => i.assetId));
        if (check.error) return check;

        // id = Date.now() (+1 band bo'lsa) — shu paytdan keyingi id'larni tekshirish yetarli.
        const taken = await readTxWhere(session, REQ, { $gte: ["$$e.id", Date.now()] });
        const createdAt = new Date().toISOString();
        let groupId = null;
        const created = priced.map(item => {
            const id = nextId(taken);
            groupId ??= id;
            const request = {
                id, groupId, userId,
                items: [item], totalSom: item.priceSom,
                status: "awaiting_admin", // awaiting_admin | credited | rejected
                createdAt, sentAt: null, // sentAt — user "Skinni yubordim"ni bosgan vaqt
                resolvedAt: null, rejectReason: null,
            };
            taken.push(request);
            return request;
        });
        await updateTx(session, REQ, {}, { $push: { data: { $each: created } } }, { upsert: true });
        return { requests: created };
    });
    if (result.requests) patchCache(REQ, (arr) => arr.push(...structuredClone(result.requests)));
    return result;
}

// User "Skinni yubordim"ni bosdi — o'zining ochiq so'rovlariga sentAt qo'yiladi.
// Faqat YANGI belgilanganlari qaytadi (adminga xabar shular uchun ketadi) —
// ikki marta bosilsa xabar takrorlanmaydi.
async function markSent(userId, ids) {
    const want = new Set(ids.map(Number));
    const result = await withTransaction(async (session) => {
        const marked = await readTxWhere(session, REQ, { $and: [
            { $in: ["$$e.id", [...want]] }, eq("userId", userId), eq("status", "awaiting_admin"),
            { $not: [{ $ifNull: ["$$e.sentAt", false] }] },
        ] });
        if (!marked.length) return { requests: [] };
        const now = new Date().toISOString();
        await updateTx(session, REQ, {}, { $set: { "data.$[r].sentAt": now } }, { arrayFilters: [{ "r.id": { $in: marked.map(r => r.id) } }] });
        for (const r of marked) r.sentAt = now;
        return { requests: marked };
    });
    const done = new Set(result.requests.map(r => r.id));
    const at = result.requests[0]?.sentAt;
    if (done.size) patchCache(REQ, (arr) => { for (const r of arr) if (done.has(r.id)) r.sentAt = at; });
    return result;
}

// Sof funksiya (testlanadi) — tranzaksiya ichida users/ledgers massivlarini
// o'zgartiradi. Ledger yozuvi balanceManager.creditTradeProceeds bilan bir
// xil shaklda (admin paneldagi "bekor qilish" va "Balans" sahifasi ham
// shu yozuvlarni oddiy tushum kabi ko'radi), faqat `holdMs` bilan.
function creditEntries(request, now = new Date()) {
    return {
        history: {
            amount: request.totalSom,
            reason: `Skin sotildi (#${request.id}, ${request.items.length} ta)`,
            date: now.toISOString(),
        },
        ledger: {
            id: now.getTime() + "-" + Math.random().toString(36).slice(2, 6),
            amount: request.totalSom, source: "instant_sell", tradeId: request.id, fee: 0,
            receivedAt: now.toISOString(),
            holdMs: SELL_HOLD_MS,
            withdrawalStatus: null,
        },
    };
}

// Massivlarga kreditni qo'llaydi (testlar va approve'dan keyingi lokal kesh uchun).
// `entries` berilsa — aynan shu yozuvlarning nusxasi qo'shiladi.
function creditRequestInTx(users, ledgers, request, now = new Date(), entries = creditEntries(request, now)) {
    const user = users.find(u => u.id === request.userId);
    if (!user) return false;
    user.balance = (user.balance ?? 0) + request.totalSom;
    if (!Array.isArray(user.balanceHistory)) user.balanceHistory = [];
    user.balanceHistory.push({ ...entries.history });

    let ledger = ledgers.find(l => l.userId === request.userId);
    if (!ledger) { ledger = { userId: request.userId, entries: [] }; ledgers.push(ledger); }
    if (!Array.isArray(ledger.entries)) ledger.entries = [];
    ledger.entries.push({ ...entries.ledger });
    return true;
}

// So'rov holatini faqat "awaiting_admin"dan o'zgartiradi (filtrda ham).
function setResolvedTx(session, id, fields) {
    const $set = {};
    for (const [k, v] of Object.entries(fields)) $set[`data.$.${k}`] = v;
    return updateTx(session, REQ, { data: { $elemMatch: { id, status: "awaiting_admin" } } }, { $set });
}
function patchRequest(id, fields) {
    patchCache(REQ, (arr) => { const r = arr.find(x => x.id === id); if (r) Object.assign(r, fields); });
}

async function approveSellRequest(id) {
    const result = await withTransaction(async (session) => {
        const [request] = await readTxWhere(session, REQ, eq("id", id));
        if (!request) return { error: "not_found" };
        if (request.status !== "awaiting_admin") return { error: "wrong_state", request };

        const uid = request.userId;
        const [user] = await readTxWhere(session, "users", eq("id", uid));
        if (!user) return { error: "user_not_found" };
        const [ledger] = await readTxWhere(session, "tradeBalances", eq("userId", uid));

        const now = new Date();
        const entries = creditEntries(request, now);
        const amount = request.totalSom;
        // Balans — $inc (parallel boshqa o'zgarishni bosib yubormaydi); raqam
        // bo'lmagan qiymatda eski mantiq: (balance ?? 0) + amount.
        const userUpdate = Number.isFinite(user.balance)
            ? { $inc: { "data.$.balance": amount } }
            : { $set: { "data.$.balance": (user.balance ?? 0) + amount } };
        if (Array.isArray(user.balanceHistory)) userUpdate.$push = { "data.$.balanceHistory": entries.history };
        else userUpdate.$set = { ...userUpdate.$set, "data.$.balanceHistory": [entries.history] };
        await updateTx(session, "users", { "data.id": uid }, userUpdate);

        if (!ledger) {
            await updateTx(session, "tradeBalances", {}, { $push: { data: { userId: uid, entries: [entries.ledger] } } }, { upsert: true });
        } else if (Array.isArray(ledger.entries)) {
            await updateTx(session, "tradeBalances", { "data.userId": uid }, { $push: { "data.$.entries": entries.ledger } });
        } else {
            await updateTx(session, "tradeBalances", { "data.userId": uid }, { $set: { "data.$.entries": [entries.ledger] } });
        }

        const fields = { status: "credited", resolvedAt: now.toISOString() };
        await setResolvedTx(session, id, fields);
        Object.assign(request, fields);
        return { request, now, entries };
    });
    if (!result.entries) return result;
    const { request, now, entries } = result;
    // users — patchCache diff bazasiga ham qo'llaydi (balans ikki marta yozilmasin).
    patchCache("users", (users) => creditRequestInTx(users, [], request, now, entries));
    patchCache("tradeBalances", (ledgers) => creditRequestInTx([{ id: request.userId }], ledgers, request, now, entries));
    patchRequest(request.id, { status: request.status, resolvedAt: request.resolvedAt });
    return { request };
}

async function rejectSellRequest(id, reason) {
    const result = await withTransaction(async (session) => {
        const [request] = await readTxWhere(session, REQ, eq("id", id));
        if (!request) return { error: "not_found" };
        if (request.status !== "awaiting_admin") return { error: "wrong_state", request };
        const fields = { status: "rejected", resolvedAt: new Date().toISOString(), rejectReason: reason || null };
        await setResolvedTx(session, id, fields);
        Object.assign(request, fields);
        return { request, fields };
    });
    if (!result.fields) return result;
    patchRequest(id, result.fields);
    return { request: result.request };
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

// Ochiq statistika (bosh sahifadagi ishonch bloki va "So'nggi sotuvlar" lentasi) —
// faqat tasdiqlangan sotuvlar, foydalanuvchi haqida hech qanday ma'lumot chiqmaydi.
function publicStats(requests, recentLimit = 12) {
    const done = requests.filter(r => r.status === "credited");
    const recent = done
        .slice()
        .sort((a, b) => String(b.resolvedAt || b.createdAt).localeCompare(String(a.resolvedAt || a.createdAt)))
        .flatMap(r => (r.items || []).map(it => ({
            name: it.name || it.marketHashName, imageUrl: it.imageUrl || null,
            priceSom: it.priceSom, at: r.resolvedAt || r.createdAt,
        })))
        .slice(0, recentLimit);
    return {
        deals: done.length,
        skins: done.reduce((n, r) => n + (r.items || []).length, 0),
        paidSom: done.reduce((n, r) => n + (r.totalSom || 0), 0),
        recent,
    };
}

async function refreshRequests() {
    await refresh("instantSellRequests").catch(() => {});
}

module.exports = {
    SELL_HOLD_MS, MAX_ITEMS_PER_REQUEST, MAX_OPEN_REQUESTS_PER_USER,
    createSellRequest, markSent, approveSellRequest, rejectSellRequest,
    getInstantSellRequest, getMyInstantSellRequests, getRequestsForAdmin, refreshRequests,
    validateNewRequest, creditRequestInTx, approvedText, rejectedText, publicStats,
    getAllRequests,
};
