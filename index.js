require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { read, connect, refresh } = require("./database/db");
const { notifyUser } = require("./notify");
const { finishAuction } = require("./auctionLifecycle");

// Vaqtni chiroyli ko'rsatish
function timeLeft(endTime) {
    if (!endTime) return null;
    const diff = new Date(endTime).getTime() - Date.now();
    if (diff <= 0) return "⏰ Tugagan";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (h > 0) return `⏳ ${h}s ${m}d qoldi`;
    if (m > 0) return `⏳ ${m}d ${s}s qoldi`;
    return `⏳ ${s}s qoldi`;
}

async function main() {
    // MongoDB ga ulanib, keshni to'ldirib olamiz — shundan keyingina
    // bot va mini-app serverini ishga tushiramiz.
    await connect();

    // Mini App API server
    require("./server");

    const bot = new Telegraf(process.env.BOT_TOKEN);

    bot.catch((err, ctx) => {
        console.error(`❌ Bot xatosi [update ${ctx.updateType}]:`, err.message || err);
    });

    require("./handlers/sellHandler")(bot);    // ← ENG BIRINCHI (o'chirilgan bo'limlar to'sig'i + Skin sotish)
    require("./handlers/startHandler")(bot);
    require("./handlers/promoHandler")(bot);   // ← adminHandler DAN OLDIN
    require("./handlers/adminHandler")(bot);
    require("./handlers/clientHandler")(bot);
    const tradeHandler = require("./handlers/tradeHandler");
    tradeHandler(bot);   // ← clientHandler DAN KEYIN (uning matn-handler'i oxirgi bo'lishi kerak)
    require("./handlers/marketHandler")(bot);   // ← tradeHandler DAN KEYIN (showTradeRoom'ni undan qayta ishlatadi)

    // Aktiv lot xabarlarini saqlash: { lotId -> [{ chatId, messageId }] }
    const lotMessages = {};

    // Lot xabarini ro'yxatga qo'shish uchun global funksiya
    global.trackLotMessage = (lotId, chatId, messageId) => {
        if (!lotMessages[lotId]) lotMessages[lotId] = [];
        // Bir chatda bir xabar saqlansin
        lotMessages[lotId] = lotMessages[lotId].filter(m => m.chatId !== chatId);
        lotMessages[lotId].push({ chatId, messageId });
    };

    // ── Kesh yangilanishi (har 4 soniyada) ─────────────────────────────────────────
    // Bot (bu jarayon) va mini-app (Vercel) alohida jarayonlar, har birining o'z
    // xotiradagi keshi bor. Mini-appdan qo'yilgan bid/o'zgarish shu bot jarayonida
    // avval umuman ko'rinmas edi (faqat bot qayta ishga tushganda yangilanardi) —
    // bu esa ikki tomon bir-birining yozganini "bosib yuborishi"ga olib kelardi.
    setInterval(() => {
        Promise.all([refresh("auctions"), refresh("users"), refresh("settings"), refresh("promos")])
            .catch((err) => console.log("KESH YANGILASH XATO:", err.message));
    }, 4_000);

    // Skin sotish inventar so'rovlarini (inventoryBridge.js) faqat inventory-worker.js
    // bajaradi — bot ham bajarsa Steam'ga har so'rov ikki marta ketib, IP 429 olardi.

    // ── Obmen: 24 soat javobsiz qolgan (buyer qo'shilgan) obmenlarni avtomatik
    //    bekor qilish va band qilingan mablag'ni qaytarish ─────────────────────
    setInterval(async () => {
        try {
            await Promise.all([refresh("trades"), refresh("users")]);
            tradeHandler.sweepStaleTrades(bot);
        } catch (err) {
            console.log("OBMEN SWEEP XATO:", err.message);
        }
    }, 60_000);

    // ── Obmen: xaridor "Skinni oldim" tugmasini bosmasa ham, ikkala tomonning
    //    Steam inventarini solishtirib skin o'tganini avtomatik aniqlash ──────
    setInterval(async () => {
        try {
            await Promise.all([refresh("trades"), refresh("users")]);
            await tradeHandler.checkAutoDeliveries(bot);
        } catch (err) {
            console.log("OBMEN AUTO-TASDIQ XATO:", err.message);
        }
    }, 5 * 60_000);

    // ── Auction tugash tekshirish (har 10 soniyada) ───────────────────────────────
    // MUHIM: g'olib yozuvini (rasm/float/stiker/trade-ban snapshot bilan) yagona
    // auctionLifecycle.js'dagi finishAuction() orqali yozamiz — server.js'ning
    // /api middleware'i ham xuddi shu funksiyani chaqiradi. Ilgari bu yerda
    // alohida (eski, snapshot maydonlarisiz) qo'lda yozilgan nusxa bo'lgan —
    // bot auksionni Vercel'dan oldin tugatib ulgurgan har safar g'olib
    // Inventory'da rasmsiz/floatsiz va trade-ban hisoblanmagan holda qolardi.
    setInterval(async () => {
        const auctions = read("auctions");
        const now      = Date.now();

        for (const a0 of auctions) {
            if (a0.status !== "active") continue;
            if (!a0.endTime) continue;
            const endMs = new Date(a0.endTime).getTime();
            if (isNaN(endMs) || now < endMs) continue;

            const result = finishAuction(a0.id);
            if (!result) continue;
            const { auction: a, winner } = result;
            console.log(`⏰ TUGADI: ${a.name}`);

            if (a.lastBidder) {
                notifyUser(
                    winner || a.lastBidder,
                    `🏆 *Tabriklaymiz! "${a.name}" auksionini yutdingiz!*\n\n` +
                    `💰 Yakuniy narx: ${a.price.toLocaleString()} so'm\n\n` +
                    `🎒 Skinni olish uchun Inventarga o'ting.`,
                    bot.telegram.sendMessage.bind(bot.telegram),
                    process.env.WEBAPP_URL
                        ? { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.webApp("🎒 Inventarga o'tish", `${process.env.WEBAPP_URL}/?page=inventory`)]]) }
                        : { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🎒 Inventar", "my_inventory")]]) }
                );

                const raw2     = read("users");
                const allUsers = Array.isArray(raw2) ? raw2 : Object.values(raw2);
                for (const u of allUsers) {
                    if (u.id === a.lastBidder) continue;
                    if (u.id === Number(process.env.ADMIN_ID)) continue; // adminga ketmasin
                    notifyUser(
                        u,
                        `⏰ *"${a.name}"* auksioi tugadi!\n🏆 G'olib: ${a.lastBidderName ?? "Yo'q"}\n💰 Narx: ${a.price.toLocaleString()} so'm`,
                        bot.telegram.sendMessage.bind(bot.telegram),
                        { parse_mode: "Markdown" }
                    );
                }
            } else if (process.env.ADMIN_ID) {
                bot.telegram.sendMessage(
                    Number(process.env.ADMIN_ID),
                    `⏰ *"${a.name}"* auksioi tugadi, lekin hech kim bid qilmadi.`,
                    { parse_mode: "Markdown" }
                ).catch(() => {});
            }

            // Lot xabarlarini "tugadi" deb yangilash
            if (lotMessages[a.id]) {
                for (const { chatId, messageId } of lotMessages[a.id]) {
                    bot.telegram.editMessageText(
                        chatId, messageId, null,
                        `📦 *${a.name}*\n\n⛔ Bu auksion tugadi!\n🏆 G'olib: ${a.lastBidderName ?? "Yo'q"}\n💰 Yakuniy narx: ${a.price.toLocaleString()} so'm`,
                        { parse_mode: "Markdown" }
                    ).catch(() => {});
                }
                delete lotMessages[a.id];
            }
        }
    }, 3_000);

    // ── Aktiv lot xabarlarini avtomatik yangilash (har 30 soniyada) ───────────────
    setInterval(async () => {
        const auctions = read("auctions").filter(a => a.status === "active" && a.endTime);

        for (const a of auctions) {
            const tl = timeLeft(a.endTime);
            if (!tl || tl === "⏰ Tugagan") continue;
            if (!lotMessages[a.id]) continue;

            const minNext = a.price + (a.minBid ?? 1000);
            const caption =
                `📦 *${a.name}*\n\n` +
                `💰 Joriy narx: *${a.price.toLocaleString()} so'm*\n` +
                `📈 Minimal bid: *${minNext.toLocaleString()} so'm*\n` +
                `👤 Oxirgi bidchi: ${a.lastBidderName ?? "Hali yo'q"}\n` +
                `${tl}\n\n` +
                `💸 Bid qo'yish uchun tugmani bosing:`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback("💸 BID qilish", `bid_${a.id}`), Markup.button.callback("🔄 Yangilash", `lot_${a.id}`)],
                [Markup.button.callback("⬅️ Auksionlarga", "back_to_auctions")],
            ]);

            for (const { chatId, messageId } of lotMessages[a.id]) {
                if (a.image) {
                    bot.telegram.editMessageCaption(chatId, messageId, null, caption, { parse_mode: "Markdown", ...keyboard }).catch(() => {});
                } else {
                    bot.telegram.editMessageText(chatId, messageId, null, caption, { parse_mode: "Markdown", ...keyboard }).catch(() => {});
                }
            }
        }
    }, 5_000);

    bot.launch();
    console.log("✅ BOT ishga tushdi!");

    process.once("SIGINT",  () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main().catch((err) => {
    console.error("❌ Botni ishga tushirishda xato:", err);
    process.exit(1);
});
