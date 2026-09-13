// "Obmen" orqali topilgan pulning 7-kunlik "hold" ledgeri va admin tomonidan
// qo'lda pul chiqarish (withdraw) oqimi. Tushum DARHOL user.balance'ga
// qo'shiladi (auksionda bidlash uchun ham darhol ishlatsa bo'ladi) — bu
// ledger faqat "qachon kartaga yechib olsa bo'ladi" degan alohida hisobni
// yuritadi, pulning o'zini emas. Ya'ni "hold" faqat KARTAGA YECHISHni
// cheklaydi, balansning o'zini emas.
const { read, write, withTransaction, readTx, writeTx } = require("./database/db");

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

function isMatured(entry) {
    return Date.now() - new Date(entry.receivedAt).getTime() >= HOLD_MS;
}

// { frozen, available } — "available" faqat withdrawalStatus:null va 7 kun
// o'tgan yozuvlar (allaqachon so'rov yuborilgan yoki chiqarilgan summalar bu
// yerga kirmaydi — ular alohida "pending"/"withdrawn" holatda).
function getHoldSummary(userId) {
    const ledger = getLedger(userId);
    const entries = ledger?.entries || [];
    let frozen = 0, available = 0, pending = 0;
    for (const e of entries) {
        if (e.withdrawalStatus === "withdrawn" || e.withdrawalStatus === "reversed") continue;
        if (e.withdrawalStatus === "pending") { pending += e.amount; continue; }
        if (isMatured(e)) available += e.amount; else frozen += e.amount;
    }
    return { frozen, available, pending };
}

// Foydalanuvchi "Pul yechish" so'ragan payt — FIFO tartibda "available"
// yozuvlarni "pending" deb belgilaydi (ikkinchi so'rov bilan qayta
// hisoblanmasligi uchun) va admin tasdiqlashi uchun so'rov yaratadi.
// Tushum allaqachon balансга qo'shilgan va bidlashda ishlatilgan bo'lishi
// mumkin — shu sabab so'ralayotgan summa joriy balansdan oshib ketmasligi
// uchun cheklanadi (aks holda balans manfiyga tushib qolardi).
function requestWithdrawal(userId, cardNumber) {
    const ledgers = getAllLedgers();
    const ledger = getOrCreateLedger(ledgers, userId);
    const eligible = ledger.entries
        .filter(e => !e.withdrawalStatus && isMatured(e))
        .sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));

    if (!eligible.length) return { error: "nothing_available" };

    const rawUsers = read("users");
    const users = Array.isArray(rawUsers) ? rawUsers : Object.values(rawUsers);
    const user = users.find(u => u.id === userId);
    const currentBalance = user?.balance ?? 0;
    if (currentBalance <= 0) return { error: "nothing_available" };

    const total = Math.min(eligible.reduce((s, e) => s + e.amount, 0), currentBalance);
    const entryIds = eligible.map(e => e.id);
    for (const e of eligible) e.withdrawalStatus = "pending";
    saveLedgers(ledgers);

    const withdrawals = read("withdrawals") || [];
    const request = {
        id: Date.now(), userId, amount: total, cardNumber, entryIds,
        status: "pending",
        requestedAt: new Date().toISOString(),
        resolvedAt: null, rejectComment: null,
    };
    withdrawals.push(request);
    write("withdrawals", withdrawals);
    return { request };
}

function getWithdrawalById(id) {
    return (read("withdrawals") || []).find(w => w.id === id) || null;
}

// Admin tasdiqlagach — yozuvlar "withdrawn" bo'ladi, user.balance'dan haqiqiy
// pul yechiladi (so'ralgan payt balansda bo'lgan, lekin shu orada yana
// sarflangan bo'lishi mumkin — shu sabab bu yerda ham joriy balans bilan
// qayta cheklanadi) va balans tarixiga yozuv qo'shiladi.
function approveWithdrawal(id) {
    const withdrawals = read("withdrawals") || [];
    const request = withdrawals.find(w => w.id === id);
    if (!request || request.status !== "pending") return { error: "not_found" };

    const ledgers = getAllLedgers();
    const ledger = getOrCreateLedger(ledgers, request.userId);
    for (const e of ledger.entries) {
        if (request.entryIds.includes(e.id)) e.withdrawalStatus = "withdrawn";
    }
    saveLedgers(ledgers);

    request.status = "approved";
    request.resolvedAt = new Date().toISOString();
    write("withdrawals", withdrawals);

    const rawUsers = read("users");
    const users = Array.isArray(rawUsers) ? rawUsers : Object.values(rawUsers);
    const user = users.find(u => u.id === request.userId);
    if (user) {
        const deduct = Math.min(request.amount, user.balance ?? 0);
        user.balance = (user.balance ?? 0) - deduct;
        if (!Array.isArray(user.balanceHistory)) user.balanceHistory = [];
        user.balanceHistory.push({ amount: -deduct, reason: "Obmen — pul chiqarish (karta)", date: new Date().toISOString() });
        write("users", users);
    }
    return { request, user };
}

// Rad etilsa — band qilingan yozuvlar yana "available" holatiga qaytadi.
function rejectWithdrawal(id, comment) {
    const withdrawals = read("withdrawals") || [];
    const request = withdrawals.find(w => w.id === id);
    if (!request || request.status !== "pending") return { error: "not_found" };

    const ledgers = getAllLedgers();
    const ledger = getOrCreateLedger(ledgers, request.userId);
    for (const e of ledger.entries) {
        if (request.entryIds.includes(e.id)) e.withdrawalStatus = null;
    }
    saveLedgers(ledgers);

    request.status = "rejected";
    request.resolvedAt = new Date().toISOString();
    request.rejectComment = comment || null;
    write("withdrawals", withdrawals);
    return { request };
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
    return withTransaction(async (session) => {
        const ledgers = await readTx(session, "tradeBalances");
        const ledgersArr = Array.isArray(ledgers) ? ledgers : [];
        const ledger = ledgersArr.find(l => l.userId === userId);
        const entry = ledger?.entries.find(e => e.id === entryId);
        if (!entry) return { error: "not_found" };
        if (entry.withdrawalStatus === "withdrawn") return { error: "already_withdrawn" };
        if (entry.withdrawalStatus === "reversed") return { error: "already_reversed" };

        const rawUsers = await readTx(session, "users");
        const users = Array.isArray(rawUsers) ? rawUsers : Object.values(rawUsers);
        const user = users.find(u => u.id === userId);
        const deducted = Math.min(entry.amount, user?.balance ?? 0);

        if (user) {
            user.balance = (user.balance ?? 0) - deducted;
            if (!Array.isArray(user.balanceHistory)) user.balanceHistory = [];
            user.balanceHistory.push({
                amount: -deducted,
                reason: `Bekor qilindi (#${entry.tradeId}): ${reason}`,
                date: new Date().toISOString(),
            });
        }
        entry.withdrawalStatus = "reversed";
        entry.reversedAt = new Date().toISOString();
        entry.reverseReason = reason;

        await writeTx(session, "users", users);
        await writeTx(session, "tradeBalances", ledgersArr);
        return { entry, deducted, cacheUpdates: { users, tradeBalances: ledgersArr } };
    });
}

module.exports = {
    creditTradeProceeds, getHoldSummary,
    requestWithdrawal, getWithdrawalById, approveWithdrawal, rejectWithdrawal,
    getAllHoldsForAdmin, reverseTradeCreditEntry,
};
