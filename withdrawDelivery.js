// Auksionda yutilgan skinni avtomatik (haqiqiy Steam trade offer orqali)
// yetkazib berishni boshqaradi: yuborishga urinish, holatini kuzatish,
// 1 soat javobsiz qolsa bekor qilib qo'lda-admin oqimiga qaytarish.
const { read, write } = require("./database/db");
const { sendTradeOffer, getTradeOfferStatus, cancelTradeOffer } = require("./steamTradeOffer");

const AUTO_TIMEOUT_MS    = 2 * 60 * 60 * 1000; // 2 soat — javobsiz qolsa bekor qilinadi
const MAX_AUTO_ATTEMPTS  = 2;              // shundan keyin butunlay qo'lda-admin oqimiga o'tkaziladi
const CHECK_INTERVAL_MS  = 2 * 60 * 1000;  // /api middleware'dan qanchalik tez-tez tekshirilsin

function readUsers() {
    const raw = read("users");
    return Array.isArray(raw) ? raw : Object.values(raw);
}

// server.js'ning POST /api/withdraw/:lotId'idan chaqiriladi. Muvaffaqiyatli
// bo'lsa { offerId } qaytaradi, aks holda (relay hali tayyor emas, assetId
// yo'q, yoki haqiqiy xato) null — chaqiruvchi shu holda eski qo'lda-admin
// oqimiga (admin'ga xabar + "Skin yuborildi" tugmasi) tushadi.
async function trySendAutoOffer(user, win) {
    if (!win.assetId) return null;
    try {
        const offerId = await sendTradeOffer(user.tradeLink, win.assetId);
        return { offerId };
    } catch (err) {
        console.log(`AVTO-YUBORISH XATO (lot #${win.lotId}, user ${user.id}):`, err.message);
        return null;
    }
}

function clearAutoState(win) {
    delete win.tradeOfferId;
    delete win.autoSentAt;
}

// win'ni qayta so'ralishi mumkin bo'lgan holatga qaytaradi. MAX_AUTO_ATTEMPTS
// marta ketma-ket muvaffaqiyatsiz bo'lsa, avtomatikadan butunlay voz kechamiz
// (status'ni tozalab — keyingi so'rov to'g'ridan-to'g'ri qo'lda-admin oqimiga
// tushadi, chunki trySendAutoOffer avtomatik ravishda qayta urinmaydi, faqat
// so'rov kelganda chaqiriladi — bu yerda faqat holat "ochiq"ligini ta'minlaymiz).
function failAutoDelivery(win, reason) {
    win.autoFailCount  = (win.autoFailCount || 0) + 1;
    win.lastFailReason = reason;
    clearAutoState(win);
    if (win.autoFailCount >= MAX_AUTO_ATTEMPTS) {
        delete win.status;
    } else {
        win.status = "auto_failed";
    }
}

// index.js (bot) yoki server.js (/api middleware) dan davriy chaqiriladi —
// "auto_sent" holatidagi barcha yutuqlarni tekshiradi: qabul qilindimi,
// rad etildimi, yoki 1 soatdan oshib ketdimi.
async function checkPendingWithdrawals(notifyFn) {
    const users = readUsers();
    let changed = false;

    for (const user of users) {
        for (const win of user.wins || []) {
            if (win.status !== "auto_sent" || !win.tradeOfferId) continue;

            let status;
            try {
                status = await getTradeOfferStatus(win.tradeOfferId);
            } catch {
                continue; // Relay vaqtincha ishlamasa — keyingi tsiklda qayta tekshiramiz
            }

            const overdue = win.autoSentAt && (Date.now() - new Date(win.autoSentAt).getTime() > AUTO_TIMEOUT_MS);

            if (status === "Accepted") {
                win.status      = "delivered";
                win.deliveredAt = new Date().toISOString();
                clearAutoState(win);
                changed = true;
                notifyFn(user, `✅ *"${win.lotName}" muvaffaqiyatli yetkazildi!*\n\nSteam trade offer qabul qilindi.`);
            } else if (["Declined", "Canceled", "Expired", "InvalidItems"].includes(status)) {
                failAutoDelivery(win, "Taklif rad etildi yoki bekor bo'ldi");
                changed = true;
                notifyFn(user, `⚠️ *"${win.lotName}" trade taklifi bekor bo'ldi.*\n\nIltimos, qaytadan "Chiqarib olish"ni bosing.`);
            } else if (status === "Active" && overdue) {
                await cancelTradeOffer(win.tradeOfferId).catch(() => {});
                failAutoDelivery(win, "2 soat ichida qabul qilinmadi");
                changed = true;
                notifyFn(user, `⚠️ *"${win.lotName}" trade taklifi bekor bo'ldi.*\n\nSabab: 2 soat ichida qabul qilinmadi. Iltimos, qaytadan "Chiqarib olish"ni bosing.`);
            }
        }
    }

    if (changed) write("users", users);
}

let lastCheckAt = 0;
// server.js'ning /api middleware'idan har so'rovda emas, CHECK_INTERVAL_MS'da
// bir marta chaqiriladi (relay'ga keraksiz tez-tez murojaat qilmaslik uchun).
// Fire-and-forget — javobni kutmaydi, so'rovni sekinlashtirmaydi.
function maybeCheckPendingWithdrawals(notifyFn) {
    const now = Date.now();
    if (now - lastCheckAt < CHECK_INTERVAL_MS) return;
    lastCheckAt = now;
    checkPendingWithdrawals(notifyFn).catch(err => console.log("WITHDRAW TEKSHIRUV XATO:", err.message));
}

module.exports = { trySendAutoOffer, checkPendingWithdrawals, maybeCheckPendingWithdrawals };
