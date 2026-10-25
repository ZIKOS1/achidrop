// "Obmen" orqali topilgan pulning 7-kunlik "hold" ledgeri va admin tomonidan
// qo'lda pul chiqarish (withdraw) oqimi. Tushum DARHOL user.balance'ga
// qo'shiladi (auksionda bidlash uchun ham darhol ishlatsa bo'ladi) — bu
// ledger faqat "qachon kartaga yechib olsa bo'ladi" degan alohida hisobni
// yuritadi, pulning o'zini emas. Ya'ni "hold" faqat KARTAGA YECHISHni
// cheklaydi, balansning o'zini emas.
const { read, write, withTransaction, readTx, writeTx, readTxWhere, updateTx, patchCache } = require("./database/db");

// users (~270 KB) tranzaksiyada butunlay o'qilib/yozilmaydi — faqat shu user
// elementi o'qiladi va balans $inc / tarix $push bilan yoziladi (sekin Atlas).
async function readUserTx(session, userId) {
    const [user] = await readTxWhere(session, "users", { $eq: ["$$e.id", userId] });
    return user || null;
}
// Balansga `delta` (manfiy ham) va tarixga `entry` — Mongo'da va (commit'dan
// keyin chaqirilsa) lokal keshda; `user` — readUserTx natijasi.
function userDeltaUpdate(user, delta, entry) {
    const update = Number.isFinite(user.balance)
        ? { $inc: { "data.$.balance": delta } }
        : { $set: { "data.$.balance": (user.balance ?? 0) + delta } };
    if (Array.isArray(user.balanceHistory)) update.$push = { "data.$.balanceHistory": entry };
    else update.$set = { ...update.$set, "data.$.balanceHistory": [entry] };
    return update;
}
function patchUserCache(userId, delta, entry) {
    patchCache("users", (users) => {
        const u = users.find(x => x.id === userId);
        if (!u) return;
        u.balance = (u.balance ?? 0) + delta;
        if (!Array.isArray(u.balanceHistory)) u.balanceHistory = [];
        u.balanceHistory.push({ ...entry });
    });
}

const HOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 kun

function getAllLedgers() {
    const raw = read("tradeBalances");
    return Array.isArray(raw) ? raw : [];
}
function saveLedgers(arr) { write("tradeBalances", arr); }

function getLedger(userId) {
    const ledgers = getAllLedgers();
    return ledgers.find(l => l.userId === userId) || null;
}
function getOrCreateLedger(ledgers, userId) {
    let l = ledgers.find(x => x.userId === userId);
    if (!l) { l = { userId, entries: [] }; ledgers.push(l); }
    return l;
}

// Obmen yakunlanganda sotuvchi tushumini (komissiya allaqachon ushlab
// qolingan, `amount` = sellerProceeds) darhol user.balance'ga qo'shadi,
// va shu tushumni "hali kartaga yechib bo'lmaydi" deb belgilash uchun
// ledger'ga ham yozadi (7 kun to'lgach "available" bo'ladi). `fee` — faqat
// admin statistikasi uchun alohida "tradeFees" yozuviga tushadi, userning
// balansiga hech qanday ta'sir qilmaydi (u allaqachon `amount`dan chiqarilgan).
function creditTradeProceeds(userId, amount, tradeId, fee = 0) {
    const rawUsers = read("users");
    const users = Array.isArray(rawUsers) ? rawUsers : Object.values(rawUsers);
    const user = users.find(u => u.id === userId);
    if (user) {
        user.balance = (user.balance ?? 0) + amount;
        if (!Array.isArray(user.balanceHistory)) user.balanceHistory = [];
        user.balanceHistory.push({ amount, reason: `Obmen — skin sotildi (#${tradeId})`, date: new Date().toISOString() });
        write("users", users);
    }

    const ledgers = getAllLedgers();
    const ledger = getOrCreateLedger(ledgers, userId);
    const entry = {
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        amount, source: "trade", tradeId, fee,
        receivedAt: new Date().toISOString(),
        withdrawalStatus: null, // null | "pending" | "withdrawn"
    };
    ledger.entries.push(entry);
    saveLedgers(ledgers);

    if (fee > 0) {
        const tradeFees = read("tradeFees") || [];
        tradeFees.push({ id: entry.id, tradeId, sellerId: userId, amount: fee, at: entry.receivedAt });
        write("tradeFees", tradeFees);
    }

    return entry;
}

// Yozuvning o'z `holdMs` maydoni bo'lsa (masalan Skin sotish — 8 kun 12
// soat) shu ishlatiladi, aks holda eski 7 kunlik standart.
function unlockAtMs(entry) {
    const hold = Number.isFinite(entry.holdMs) ? entry.holdMs : HOLD_MS;
    return new Date(entry.receivedAt).getTime() + hold;
}

function isMatured(entry, now = Date.now()) {
    return now >= unlockAtMs(entry);
}

// Sof funksiya (testlanadi). `nextUnlockAt` — eng yaqin muzlatilgan
// yozuvning ochilish vaqti (UI'dagi taymer uchun), muzlatilgan yo'q bo'lsa null.
function summarizeHoldEntries(entries, now = Date.now()) {
    let frozen = 0, available = 0, pending = 0, nextUnlock = null;
    for (const e of entries || []) {
        if (e.withdrawalStatus === "withdrawn" || e.withdrawalStatus === "reversed") continue;
        if (e.withdrawalStatus === "pending") { pending += e.amount; continue; }
        if (isMatured(e, now)) { available += e.amount; continue; }
        frozen += e.amount;
        const at = unlockAtMs(e);
        if (nextUnlock == null || at < nextUnlock) nextUnlock = at;
    }
    return { frozen, available, pending, nextUnlockAt: nextUnlock == null ? null : new Date(nextUnlock).toISOString() };
}

// { frozen, available, pending, nextUnlockAt } — "available" faqat
// withdrawalStatus:null va hold muddati o'tgan yozuvlar (allaqachon so'rov
// yuborilgan yoki chiqarilgan summalar bu yerga kirmaydi).
// Ledger faqat "qancha pul tushgan"ni biladi — admin balansdan ayirsa yoki
// pul bidlashda sarflansa, ledger o'zgarmaydi. Shu sabab ko'rsatiladigan
// summalar joriy balansdan oshmasligi uchun cheklanadi (tartib: avval
// pending — u allaqachon so'ralgan, keyin available, keyin frozen).
function capHoldToBalance(summary, balance) {
    let left = Math.max(0, balance ?? 0);
    const take = (v) => { const x = Math.min(v, left); left -= x; return x; };
    const pending = take(summary.pending);
    const available = take(summary.available);
    const frozen = take(summary.frozen);
    return { ...summary, pending, available, frozen, nextUnlockAt: frozen > 0 ? summary.nextUnlockAt : null };
}

function getHoldSummary(userId) {
    const ledger = getLedger(userId);
    const summary = summarizeHoldEntries(ledger?.entries || []);
    const user = asArr(read("users")).find(u => u.id === userId);
    return capHoldToBalance(summary, user?.balance);
}

// Foydalanuvchi "Pul yechish" so'ragan payt — FIFO tartibda "available"
// yozuvlarni "pending" deb belgilaydi (ikkinchi so'rov bilan qayta
// hisoblanmasligi uchun) va admin tasdiqlashi uchun so'rov yaratadi.
// Tushum allaqachon balансга qo'shilgan va bidlashda ishlatilgan bo'lishi
// mumkin — shu sabab so'ralayotgan summa joriy balansdan oshib ketmasligi
// uchun cheklanadi (aks holda balans manfiyga tushib qolardi).
// Uchala amal (so'rov / tasdiq / rad) BITTA MongoDB tranzaksiyasida: Vercel'ning
// bir nechta nusxasi va bot (VPS) alohida keshlar bilan ishlaydi — keshdagi
// read()/write() bilan parallel ikkita so'rov (masalan console'dan bir vaqtda
// yuborilgan) bitta pulni ikki marta "pending" qilib, ikkita so'rov yaratishi,
// yoki botning eski keshidagi `users` massivi saytda tushgan pulni bosib
// yuborishi mumkin edi.
function asArr(raw) { return Array.isArray(raw) ? raw : (raw ? Object.values(raw) : []); }

async function requestWithdrawal(userId, cardNumber) {
    return withTransaction(async (session) => {
        const ledgers = asArr(await readTx(session, "tradeBalances"));
        const ledger = ledgers.find(l => l.userId === userId);
        const eligible = (ledger?.entries || [])
            .filter(e => !e.withdrawalStatus && isMatured(e))
            .sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
        if (!eligible.length) return { error: "nothing_available" };

        const currentBalance = (await readUserTx(session, userId))?.balance ?? 0;
        if (currentBalance <= 0) return { error: "nothing_available" };

        const total = Math.min(eligible.reduce((s, e) => s + e.amount, 0), currentBalance);
        for (const e of eligible) e.withdrawalStatus = "pending";

        const withdrawals = asArr(await readTx(session, "withdrawals"));
        let id = Date.now();
        while (withdrawals.some(w => w.id === id)) id++;
        const request = {
            id, userId, amount: total, cardNumber, entryIds: eligible.map(e => e.id),
            status: "pending",
            requestedAt: new Date().toISOString(),
            resolvedAt: null, rejectComment: null,
        };
        withdrawals.push(request);
        await writeTx(session, "tradeBalances", ledgers);
        await writeTx(session, "withdrawals", withdrawals);
        return { request, cacheUpdates: { tradeBalances: ledgers, withdrawals } };
    });
}

function getWithdrawalById(id) {
    return (read("withdrawals") || []).find(w => w.id === id) || null;
}

// Admin tasdiqlagach — yozuvlar "withdrawn" bo'ladi, user.balance'dan haqiqiy
// pul yechiladi (so'ralgan payt balansda bo'lgan, lekin shu orada yana
// sarflangan bo'lishi mumkin — shu sabab bu yerda ham joriy balans bilan
// qayta cheklanadi) va balans tarixiga yozuv qo'shiladi.
async function approveWithdrawal(id) {
    const result = await withTransaction(async (session) => {
        const withdrawals = asArr(await readTx(session, "withdrawals"));
        const request = withdrawals.find(w => w.id === id);
        if (!request || request.status !== "pending") return { error: "not_found" };

        const ledgers = asArr(await readTx(session, "tradeBalances"));
        const ledger = ledgers.find(l => l.userId === request.userId);
        for (const e of ledger?.entries || []) {
            if (request.entryIds.includes(e.id)) e.withdrawalStatus = "withdrawn";
        }
        request.status = "approved";
        request.resolvedAt = new Date().toISOString();

        const user = await readUserTx(session, request.userId);
        let change = null;
        if (user) {
            const deduct = Math.min(request.amount, user.balance ?? 0);
            change = { userId: user.id, delta: -deduct, entry: { amount: -deduct, reason: "Obmen — pul chiqarish (karta)", date: new Date().toISOString() } };
            await updateTx(session, "users", { "data.id": user.id }, userDeltaUpdate(user, change.delta, change.entry));
        }
        await writeTx(session, "tradeBalances", ledgers);
        await writeTx(session, "withdrawals", withdrawals);
        return { request, change, cacheUpdates: { tradeBalances: ledgers, withdrawals } };
    });
    if (result.change) patchUserCache(result.change.userId, result.change.delta, result.change.entry);
    return result;
}

// Rad etilsa — band qilingan yozuvlar yana "available" holatiga qaytadi.
async function rejectWithdrawal(id, comment) {
    return withTransaction(async (session) => {
        const withdrawals = asArr(await readTx(session, "withdrawals"));
        const request = withdrawals.find(w => w.id === id);
        if (!request || request.status !== "pending") return { error: "not_found" };

        const ledgers = asArr(await readTx(session, "tradeBalances"));
        const ledger = ledgers.find(l => l.userId === request.userId);
        for (const e of ledger?.entries || []) {
            if (request.entryIds.includes(e.id)) e.withdrawalStatus = null;
        }
        request.status = "rejected";
        request.resolvedAt = new Date().toISOString();
        request.rejectComment = comment || null;
        await writeTx(session, "tradeBalances", ledgers);
        await writeTx(session, "withdrawals", withdrawals);
        return { request, cacheUpdates: { tradeBalances: ledgers, withdrawals } };
    });
}

// Admin panel uchun — har bir foydalanuvchining muzlatilgan/bo'shatiladigan
// mablag'lari ro'yxati (faqat mablag'i bor userlar).
function getAllHoldsForAdmin() {
    return getAllLedgers()
        .map(l => ({ userId: l.userId, ...getHoldSummary(l.userId) }))
        .filter(s => s.frozen > 0 || s.available > 0 || s.pending > 0);
}

// Admin — Instant Sell (yoki istalgan trade-credit) yozuvini BEKOR QILADI:
// balansdan berilgan summani (agar hali sarflanmagan bo'lsa yoki qisman
// sarflangan bo'lsa — mavjud balans miqdorida) ayiradi va yozuvni
// "reversed" deb belgilaydi. Faqat hali KARTAGA CHIQARILMAGAN
// ("withdrawn" bo'lmagan) yozuvlarga ruxsat — pul haqiqatda ketgan bo'lsa,
// bu funksiya orqali qaytarib bo'lmaydi (alohida qo'lda jarayon kerak).
// Tranzaksiya ichida bajariladi — bir vaqtning o'zida user boshqa joyda
// (bid/withdraw) balansini o'zgartirsa ham, ikkalasi bir-birini
// "ko'rmay qolib" pulni noto'g'ri hisoblab qo'ymasligi uchun.
async function reverseTradeCreditEntry(userId, entryId, reason) {
    const result = await withTransaction(async (session) => {
        const ledgers = await readTx(session, "tradeBalances");
        const ledgersArr = Array.isArray(ledgers) ? ledgers : [];
        const ledger = ledgersArr.find(l => l.userId === userId);
        const entry = ledger?.entries.find(e => e.id === entryId);
        if (!entry) return { error: "not_found" };
        if (entry.withdrawalStatus === "withdrawn") return { error: "already_withdrawn" };
        if (entry.withdrawalStatus === "reversed") return { error: "already_reversed" };

        const user = await readUserTx(session, userId);
        const deducted = Math.min(entry.amount, user?.balance ?? 0);

        let change = null;
        if (user) {
            change = { userId, delta: -deducted, entry: { amount: -deducted, reason: `Bekor qilindi (#${entry.tradeId}): ${reason}`, date: new Date().toISOString() } };
            await updateTx(session, "users", { "data.id": userId }, userDeltaUpdate(user, change.delta, change.entry));
        }
        entry.withdrawalStatus = "reversed";
        entry.reversedAt = new Date().toISOString();
        entry.reverseReason = reason;

        await writeTx(session, "tradeBalances", ledgersArr);
        return { entry, deducted, change, cacheUpdates: { tradeBalances: ledgersArr } };
    });
    if (result.change) patchUserCache(result.change.userId, result.change.delta, result.change.entry);
    return result;
}

// ── "Pul yechish" promo kodi — muzlatilgan mablag'ning `unlockSom`gacha
// qismini darhol "available" qiladi (kartaga yechish odatdagidek: so'rov →
// admin tasdig'i). Eng uzoq kutiladigan yozuvlar birinchi ochiladi.
//
// Sof funksiya (testlanadi): `entries`ni joyida o'zgartiradi, ochilgan summani
// qaytaradi. Ochilgan yozuvga holdMs = 0 (receivedAt'dan darhol "matured");
// yozuv summadan katta bo'lsa — bo'linadi: qolgani muzlatilgan holda alohida
// yozuv bo'lib qoladi.
function unlockFrozenEntries(entries, maxSom, code, now = Date.now()) {
    const frozen = entries
        .filter(e => !e.withdrawalStatus && !isMatured(e, now))
        .sort((a, b) => unlockAtMs(b) - unlockAtMs(a));
    let left = maxSom, unlocked = 0;
    for (const e of frozen) {
        if (left <= 0) break;
        if (e.amount > left) {
            entries.push({ ...e, id: `${e.id}-r${now}`, amount: e.amount - left });
            e.amount = left;
        }
        e.holdMs = 0;
        e.promoUnlock = code;
        left -= e.amount;
        unlocked += e.amount;
    }
    return unlocked;
}

// { unlocked } yoki { error: not_found | exhausted | already_used | nothing_frozen }.
// Muzlatilgan mablag' yo'q bo'lsa kod SARFLANMAYDI.
async function unlockWithPromo(userId, rawCode) {
    const { checkPromoForUser, markPromoUsed } = require("./promoCheck");
    const code = String(rawCode || "").toUpperCase().trim();
    return withTransaction(async (session) => {
        const promos = asArr(await readTx(session, "promos"));
        const p = promos.find(x => x.code === code);
        if (!p || p.type !== "withdraw") return { error: "not_found" };
        const check = checkPromoForUser(p, userId);
        if (check.error) return check;

        const ledgers = asArr(await readTx(session, "tradeBalances"));
        const ledger = ledgers.find(l => l.userId === userId);
        const user = await readUserTx(session, userId);
        // Balansdan oshmaydigan muzlatilgan qism (getHoldSummary bilan bir xil hisob).
        const frozen = capHoldToBalance(summarizeHoldEntries(ledger?.entries || []), user?.balance).frozen;
        const max = Math.min(p.unlockSom || 0, frozen);
        if (!(max > 0)) return { error: "nothing_frozen" };

        const unlocked = unlockFrozenEntries(ledger.entries, max, code);
        markPromoUsed(p, userId);
        await writeTx(session, "tradeBalances", ledgers);
        await writeTx(session, "promos", promos);
        return { unlocked, cacheUpdates: { tradeBalances: ledgers, promos } };
    });
}

module.exports = {
    unlockFrozenEntries, unlockWithPromo,
    creditTradeProceeds, getHoldSummary, summarizeHoldEntries, capHoldToBalance, isMatured, HOLD_MS,
    requestWithdrawal, getWithdrawalById, approveWithdrawal, rejectWithdrawal,
    getAllHoldsForAdmin, reverseTradeCreditEntry,
};
