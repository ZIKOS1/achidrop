// Auksionga bid qo'yish — botning o'zi (handlers/clientHandler.js) va sayt
// (server.js) ikkalasi ham shu yerdan chaqiradi. Avval har birida bir xil
// mantiqning alohida-alohida nusxasi bor edi (4 joyda takrorlangan) — bu
// nafaqat qo'llab-quvvatlashni qiyinlashtirar edi, balki MongoDB
// tranzaksiyasiz "o'qi-o'zgartir-yoz" naqshi tufayli ikkita bid deyarli bir
// vaqtda kelsa (masalan bot va sayt orqali, yoki saytning ikkita Vercel
// nusxasidan), bittasi ikkinchisini "ko'rmay" ustidan bosib yozib
// yuborishi mumkin edi. Endi butun zanjir (joriy narxni o'qish → tekshirish
// → ikkala balansni yangilash → yozish) BITTA MongoDB tranzaksiyasida
// bajariladi — to'qnashuv bo'lsa Mongo avtomatik qayta urinadi (yangilangan
// narx bilan), shu sabab hech qanday bid "yo'qolib qolmaydi".
const { withTransaction, readTx, writeTx } = require("./database/db");

function logBalance(user, amount, reason) {
    if (!user) return;
    if (!Array.isArray(user.balanceHistory)) user.balanceHistory = [];
    user.balanceHistory.push({ amount, reason, date: new Date().toISOString() });
}

// `mode` — "full" (qo'lda summani kiritib qo'yilgan bid) yoki "quick"
// (bitta tugma bilan minimal qadamga bid). Faqat balans tarixi matnini
// tanlash uchun kerak, mantiqning o'zi bir xil.
// `getAmount(lot, minNext)` — "full" rejimda foydalanuvchi kiritgan summani,
// "quick" rejimda `minNext`ning o'zini qaytaradi (chaqiruvchi belgilaydi).
async function placeBid({ lotId, userId, userName, mode, getAmount }) {
    return withTransaction(async (session) => {
        const auctions = await readTx(session, "auctions");
        const lot = auctions.find(a => a.id === lotId);
        if (!lot || lot.status !== "active") return { error: "lot_closed" };

        if (lot.endTime && Date.now() >= new Date(lot.endTime).getTime()) {
            lot.status = "finished";
            await writeTx(session, "auctions", auctions);
            return { error: "time_up", cacheUpdates: { auctions } };
        }

        const minNext = lot.price + (lot.minBid ?? 1000);
        const amount = getAmount(lot, minNext);
        if (!Number.isFinite(amount) || amount < minNext) return { error: "too_low", minBid: minNext };

        const rawUsers = await readTx(session, "users");
        const users = Array.isArray(rawUsers) ? rawUsers : Object.values(rawUsers);
        const bidUser = users.find(u => u.id === userId);
        const isRaise = lot.lastBidder === userId;
        const need = isRaise ? amount - lot.price : amount;
        if (!bidUser || (bidUser.balance ?? 0) < need) {
            return { error: "insufficient_balance", balance: bidUser?.balance ?? 0, needed: need };
        }

        const raiseReason = mode === "quick" ? `Auksion — tezkor bid (${lot.name})` : `Auksion — bid oshirildi (${lot.name})`;
        const newReason   = mode === "quick" ? `Auksion — tezkor bid (${lot.name})` : `Auksion — bid qo'yildi (${lot.name})`;

        let outbidUser = null;
        const prevPrice = lot.price;
        if (isRaise) {
            bidUser.balance -= need;
            logBalance(bidUser, -need, raiseReason);
        } else {
            if (lot.lastBidder) {
                const prev = users.find(u => u.id === lot.lastBidder);
                if (prev) {
                    prev.balance = (prev.balance ?? 0) + lot.price;
                    logBalance(prev, lot.price, `Auksion — ustingizdan bid qilishdi, pul qaytarildi (${lot.name})`);
                    outbidUser = { id: prev.id, name: prev.name };
                }
            }
            bidUser.balance -= amount;
            logBalance(bidUser, -amount, newReason);
        }

        lot.price          = amount;
        lot.lastBidder     = userId;
        lot.lastBidderName = userName;
        lot.lastBidTime    = new Date().toISOString();

        const bids = await readTx(session, "bids");
        bids.push({ id: Date.now(), lotId, lotName: lot.name, userId, userName, amount, date: new Date().toISOString() });

        await writeTx(session, "auctions", auctions);
        await writeTx(session, "users", users);
        await writeTx(session, "bids", bids);

        return {
            success: true,
            lot: { ...lot },
            amount,
            prevPrice,
            outbidUser,
            newBalance: bidUser.balance,
            cacheUpdates: { auctions, users, bids },
        };
    });
}

module.exports = { placeBid };
