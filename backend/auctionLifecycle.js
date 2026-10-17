const { read, write } = require("./database/db");

function getAllUsers() {
    const raw = read("users");
    return Array.isArray(raw) ? raw : Object.values(raw);
}

// Auksionni "finished" holatiga o'tkazadi va (agar bidder bo'lsa) g'olib
// ro'yxatiga yutuqni yozadi — bu yozuv bo'lmasa, g'olib skinni hech qachon
// so'rab (withdraw) ololmaydi. Avval bu faqat vaqti tugagan auksionlar uchun
// (index.js'dagi setInterval) ishlar edi; admin auksionni qo'lda tugatganda
// (bot tugmasi yoki mini-app) yutuq yozilmay qolar edi.
function finishAuction(auctionId) {
    const auctions = read("auctions");
    const a = auctions.find(x => x.id === auctionId);
    if (!a || a.status !== "active") return null;

    a.status = "finished";

    let winner = null;
    if (a.lastBidder) {
        const allUsers = getAllUsers();
        winner = allUsers.find(u => u.id === a.lastBidder) || null;
        if (winner) {
            if (!Array.isArray(winner.wins))    winner.wins    = [];
            if (!Array.isArray(winner.history)) winner.history = [];
            // Admin lot yaratganda "Trade Ban (kun)" belgilagan bo'lsa (Steam
            // trade-ban bilan chiqqan skin) — g'olibga shu muddat davomida
            // haqiqiy Steam savdosi ishlamasligini bildirish uchun saqlanadi,
            // Inventory.jsx shu asosda qolgan kunni hisoblab ko'rsatadi.
            const tradeBanUntil = a.tradeBanDays
                ? new Date(Date.now() + a.tradeBanDays * 24 * 60 * 60 * 1000).toISOString()
                : null;
            winner.wins.push({
                lotId:      a.id,
                lotName:    a.name,
                price:      a.price,
                date:       new Date().toISOString(),
                status:     "pending",
                tradeBanUntil,
                // Haqiqiy Steam trade offer avtomatik yuborilishi uchun kerak
                // (steamTradeOffer.js) — item hali bot akkauntidan chiqmagan
                // ekan, shu assetId doim amal qiladi.
                assetId:    a.assetId    || null,
                // Inventar sahifasida rasm/float/stiker ko'rsatish uchun — auksion
                // keyinchalik o'chirilsa ham (yoki qiymatlari o'zgarsa ham) g'olib
                // yozuvi o'zining qiymatlarini saqlab qoladi (lotName/price kabi).
                image:      a.image      || null,
                float:      a.float      ?? null,
                paintSeed:  a.paintSeed  ?? null,
                paintIndex: a.paintIndex ?? null,
                stickers:   a.stickers   || [],
                rarity:     a.rarity     || null,
                statTrak:   a.statTrak   || false,
            });
            write("users", allUsers);
        }
    }

    write("auctions", auctions);
    return { auction: a, winner };
}

// Auksionni bekor qiladi. Agar aktiv bidder bo'lsa, bid vaqtida ushlab
// qolingan balansini qaytaradi — avval bu qaytarilmay, pul "yo'qolib" qolardi.
function cancelAuction(auctionId) {
    const auctions = read("auctions");
    const a = auctions.find(x => x.id === auctionId);
    if (!a) return null;

    let refunded = null;
    if (a.status === "active" && a.lastBidder) {
        const allUsers = getAllUsers();
        const bidder = allUsers.find(u => u.id === a.lastBidder);
        if (bidder) {
            bidder.balance = (bidder.balance ?? 0) + a.price;
            refunded = bidder;
            write("users", allUsers);
        }
    }

    a.status = "cancelled";
    write("auctions", auctions);
    return { auction: a, refunded };
}

module.exports = { finishAuction, cancelAuction };
