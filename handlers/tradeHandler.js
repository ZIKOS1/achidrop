const { Markup } = require("telegraf");
const { read, refresh } = require("../database/db");
const { notifyUser } = require("../notify");
const { fetchUserInventory } = require("../steam");
const { createPendingAuth } = require("../auth-steam");
const tradeManager   = require("../tradeManager");
const tradeDelivery  = require("../tradeDelivery");
const balanceManager = require("../balanceManager");
const chatManager    = require("../chatManager");
const skinUtils      = require("../skinUtils");

const TRADES_PAGE_SIZE    = 5;
const INVENTORY_PAGE_SIZE = 6;

// Session (jarayon xotirasida) — mavjud pendingBid/watchingLots konvensiyasiga mos.
const tradeListPage      = {}; // userId -> page
const inventoryPage      = {}; // userId -> page
const pendingTradePrice  = {}; // userId -> tradeId
const pendingTradeChat   = {}; // userId -> tradeId
const pendingWithdrawCard = {}; // userId -> true

function readUsers() { const d = read("users"); return Array.isArray(d) ? d : Object.values(d); }
function getUser(id) { return readUsers().find(u => u.id === id) || null; }
function fmt(n) { return (n ?? 0).toLocaleString(); }

const STATUS_LABELS = {
    open:                    "🟢 Ochiq",
    negotiating:             "💬 Kelishilmoqda",
    awaiting_confirmations:  "⏳ Tasdiqlash kutilmoqda",
    seller_sending:          "📤 Yuborish kutilmoqda",
    buyer_confirming:        "📥 Qabul qilish kutilmoqda",
    completed:               "✅ Yakunlangan",
    cancelled:               "❌ Bekor qilingan",
    disputed:                "⚠️ Nizoli",
};

module.exports = (bot) => {
    const isAdmin = (ctx) => ctx.from.id === Number(process.env.ADMIN_ID);

    function notifyOther(trade, fromUserId, text) {
        const otherId = fromUserId === trade.sellerId ? trade.buyerId : trade.sellerId;
        if (!otherId) return;
        notifyUser(otherId, text, bot.telegram.sendMessage.bind(bot.telegram),
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("📦 Obmenni ochish", `trade_${trade.id}`)]]) });
    }
    function notifyBoth(trade, text) {
        [trade.sellerId, trade.buyerId].filter(Boolean).forEach(id => {
            notifyUser(id, text, bot.telegram.sendMessage.bind(bot.telegram),
                { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("📦 Obmenni ochish", `trade_${trade.id}`)]]) });
        });
    }

    // ── 🔄 Obmenlar ro'yxati ─────────────────────────────────────────────────
    // trade.skins har doim massiv (bitta skin bo'lsa ham) — ko'p skinli
    // obmenlarda "birinchi skin nomi + va yana N ta" tarzida qisqartiriladi.
    function skinsLabel(trade) {
        const skins = trade.skins || [];
        if (!skins.length) return "Skin";
        if (skins.length === 1) return skins[0].name;
        return `${skins[0].name} va yana ${skins.length - 1} ta`;
    }

    function tradeLabel(trade, userId) {
        const role = trade.sellerId === userId ? "🧑‍💼" : trade.buyerId === userId ? "🛒" : "🌐";
        return `${role} ${skinsLabel(trade)} | ${STATUS_LABELS[trade.status] || trade.status}`;
    }

    async function showTradeList(ctx, user, edit = false) {
        const mine = tradeManager.getMyTrades(user.id);
        const open = tradeManager.getOpenTrades(user.id).filter(t => !mine.some(m => m.id === t.id));
        const items = [...mine, ...open];
        const page  = tradeListPage[user.id] ?? 0;
        const { pageItems, page: p, totalPages, total } = skinUtils.paginate(items, page, TRADES_PAGE_SIZE);
        tradeListPage[user.id] = p;

        const rows = [[Markup.button.callback("➕ Yangi obmen ochish", "trade_new")]];
        pageItems.forEach(t => rows.push([Markup.button.callback(tradeLabel(t, user.id), `trade_${t.id}`)]));
        if (totalPages > 1) {
            const nav = [];
            if (p > 0) nav.push(Markup.button.callback("⬅️ Oldingi", `trade_page_${p - 1}`));
            nav.push(Markup.button.callback(`📄 ${p + 1}/${totalPages}`, "auc_noop"));
            if (p < totalPages - 1) nav.push(Markup.button.callback("Keyingi ➡️", `trade_page_${p + 1}`));
            rows.push(nav);
        }
        const text = total ? `🔄 *Obmenlar* (${total} ta)` : "🔄 *Obmenlar*\n\nHozircha ochiq obmenlar yo'q — birinchi bo'lib ochib ko'ring!";
        const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) };
        try { return edit ? await ctx.editMessageText(text, opts) : await ctx.reply(text, opts); } catch {}
    }

    bot.hears(["🔄 Obmen", "🔄 Обмен"], async (ctx) => {
        if (isAdmin(ctx)) return;
        const user = getUser(ctx.from.id);
        if (!user) return ctx.reply("⚠️ Avval /start bosing.");
        if (user.blocked) return ctx.reply("⛔ Siz bloklangansiz. Admin bilan bog'laning.");
        await showTradeList(ctx, user, false);
    });

    bot.action("back_to_trades", async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (user) await showTradeList(ctx, user, true);
    });

    bot.action(/^trade_page_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (!user) return;
        tradeListPage[user.id] = Number(ctx.match[1]);
        await showTradeList(ctx, user, true);
    });

    // ── ➕ Yangi obmen: Steam ulash → inventar → skin tanlash ────────────────
    bot.action("trade_new", async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (!user) return;
        if (!user.steamId64) {
            if (!process.env.STEAM_API_KEY || !process.env.WEBAPP_URL) {
                return ctx.editMessageText("⚠️ Steam ulash hozircha sozlanmagan. Admin bilan bog'laning.",
                    Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", "back_to_trades")]])).catch(() => {});
            }
            const nonce = await createPendingAuth(user.id, "bidder");
            const url = `${process.env.WEBAPP_URL}/api/auth/steam/start?state=${nonce}`;
            return ctx.editMessageText(
                "🔗 *Obmen ochish uchun avval Steam hisobingizni ulang:*",
                { parse_mode: "Markdown", ...Markup.inlineKeyboard([
                    [Markup.button.url("🔗 Steam orqali ulash", url)],
                    [Markup.button.callback("⬅️ Orqaga", "back_to_trades")],
                ])}
            ).catch(() => {});
        }
        await showInventoryPicker(ctx, user, true);
    });

    async function showInventoryPicker(ctx, user, edit) {
        let items;
        try {
            items = await fetchUserInventory(user.steamId64);
        } catch (err) {
            const msg = `❌ Inventarni olishda xato: ${err.message}`;
            const opts = Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", "back_to_trades")]]);
            try { return edit ? await ctx.editMessageText(msg, opts) : await ctx.reply(msg, opts); } catch {}
            return;
        }
        const tradable = items.filter(it => it.tradable !== false);
        const page = inventoryPage[user.id] ?? 0;
        const { pageItems, page: p, totalPages, total } = skinUtils.paginate(tradable, page, INVENTORY_PAGE_SIZE);
        inventoryPage[user.id] = p;

        if (!total) {
            const msg = "😔 Steam inventaringizda savdo qilinadigan (tradable) itemlar topilmadi.";
            const opts = Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", "back_to_trades")]]);
            try { return edit ? await ctx.editMessageText(msg, opts) : await ctx.reply(msg, opts); } catch {}
            return;
        }

        const rows = pageItems.map(it => [Markup.button.callback(
            `${it.name}${it.float != null ? ` (${skinUtils.wearCode(it.float)})` : ""}`,
            `trade_pick_${it.assetId}`
        )]);
        if (totalPages > 1) {
            const nav = [];
            if (p > 0) nav.push(Markup.button.callback("⬅️ Oldingi", `trade_invpage_${p - 1}`));
            nav.push(Markup.button.callback(`📄 ${p + 1}/${totalPages}`, "auc_noop"));
            if (p < totalPages - 1) nav.push(Markup.button.callback("Keyingi ➡️", `trade_invpage_${p + 1}`));
            rows.push(nav);
        }
        rows.push([Markup.button.callback("⬅️ Orqaga", "back_to_trades")]);
        const text = `🎒 *Sotmoqchi bo'lgan skinni tanlang:* (${total} ta)`;
        const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) };
        try { return edit ? await ctx.editMessageText(text, opts) : await ctx.reply(text, opts); } catch {}
    }

    bot.action(/^trade_invpage_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (!user) return;
        inventoryPage[user.id] = Number(ctx.match[1]);
        await showInventoryPicker(ctx, user, true);
    });

    bot.action(/^trade_pick_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (!user) return;
        const assetId = ctx.match[1];
        let items;
        try { items = await fetchUserInventory(user.steamId64); }
        catch (err) { return ctx.answerCbQuery("❌ Inventar xatosi: " + err.message, true); }

        const item = items.find(it => String(it.assetId) === assetId);
        if (!item) return ctx.answerCbQuery("❌ Item topilmadi (kesh eskirgan bo'lishi mumkin).", true);

        const skin = {
            assetId: item.assetId, name: item.name,
            wear: skinUtils.wearCode(item.float), float: item.float ?? null,
            inspectLink: item.inspectLink || null, imageUrl: item.image || null,
            priceEstimate: null,
        };
        const trade = tradeManager.createTrade(user.id, [skin], "telegram");
        const linkText = trade.inviteLink ? `\n\n🔗 *Taklif havolasi* (xaridorga yuboring):\n\`${trade.inviteLink}\`` : "";
        await ctx.editMessageText(
            `✅ *Obmen ochildi!*\n\n📦 ${skin.name}${linkText}\n\nXaridor shu havola orqali kirishi bilan sizga xabar beramiz.`,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Obmenlarga", "back_to_trades")]]) }
        ).catch(() => {});
    });

    // ── Trade room ────────────────────────────────────────────────────────────
    async function showTradeRoom(ctx, trade, viewerId, edit = true) {
        const seller = getUser(trade.sellerId);
        const buyer  = trade.buyerId ? getUser(trade.buyerId) : null;
        const isSeller = viewerId === trade.sellerId;
        const isBuyer  = viewerId === trade.buyerId;

        const firstSkin = trade.skins?.[0];
        let text = `🔄 *Obmen #${trade.id}*\n\n📦 *${skinsLabel(trade)}*${firstSkin?.wear && trade.skins.length === 1 ? ` (${firstSkin.wear})` : ""}\n`;
        text += `👤 Sotuvchi: ${seller?.name ?? trade.sellerId}\n`;
        text += `🛒 Xaridor: ${buyer?.name ?? "Hali yo'q"}\n`;
        text += `📊 Holat: ${STATUS_LABELS[trade.status] || trade.status}\n`;
        if (trade.agreedPrice) {
            text += `💰 Narx: *${fmt(trade.agreedPrice)} so'm* ${trade.priceLocked ? "🔒" : `(${trade.sellerConfirmed ? "✅" : "❌"} sotuvchi / ${trade.buyerConfirmed ? "✅" : "❌"} xaridor)`}\n`;
        }
        if (trade.chatLog?.length) {
            text += `\n💬 *Oxirgi xabarlar:*\n`;
            trade.chatLog.slice(-5).forEach(m => {
                const who = m.from === trade.sellerId ? "Sotuvchi" : "Xaridor";
                text += `_${who}:_ ${m.text}\n`;
            });
        }

        const rows = [];
        if ((isSeller || isBuyer) && !["completed", "cancelled"].includes(trade.status) && trade.buyerId) {
            if (!trade.priceLocked) rows.push([Markup.button.callback("💰 Narx taklif qilish", `trade_price_${trade.id}`)]);
            if (trade.agreedPrice && !trade.priceLocked) {
                const already = isSeller ? trade.sellerConfirmed : trade.buyerConfirmed;
                if (!already) rows.push([Markup.button.callback("✅ Tasdiqlayman", `trade_confirm_${trade.id}`)]);
            }
            if (isSeller && trade.status === "seller_sending") rows.push([Markup.button.callback("📤 Skinni yubordim", `trade_sent_${trade.id}`)]);
            if (isBuyer && trade.status === "buyer_confirming") rows.push([Markup.button.callback("📥 Skinni oldim", `trade_received_${trade.id}`)]);
            rows.push([Markup.button.callback("💬 Chat", `trade_chat_${trade.id}`)]);
            rows.push([Markup.button.callback("⚠️ Muammo bor", `trade_dispute_${trade.id}`), Markup.button.callback("❌ Bekor qilish", `trade_cancel_${trade.id}`)]);
        } else if (isSeller && trade.status === "open") {
            rows.push([Markup.button.callback("❌ E'lonni bekor qilish", `trade_cancel_${trade.id}`)]);
        }
        rows.push([Markup.button.callback("🔄 Obmenlarga", "back_to_trades")]);

        const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) };
        try { return edit ? await ctx.editMessageText(text, opts) : await ctx.reply(text, opts); } catch {}
    }

    bot.action(/^trade_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const trade = tradeManager.getTradeById(Number(ctx.match[1]));
        if (!trade) return ctx.answerCbQuery("❌ Topilmadi.", true);
        await showTradeRoom(ctx, trade, ctx.from.id, true);
    });

    // marketHandler.js sotib olingan/o'z Market e'lonini ochganda bir xil
    // trade-room ko'rinishidan (sent/received/dispute/cancel) foydalanish uchun.
    module.exports.showTradeRoom = showTradeRoom;

    bot.action(/^trade_price_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const tradeId = Number(ctx.match[1]);
        const trade = tradeManager.getTradeById(tradeId);
        if (!trade) return;
        pendingTradePrice[ctx.from.id] = tradeId;
        await ctx.editMessageText("💰 *Taklif qilayotgan narxni kiriting (so'mda):*",
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor", `trade_${tradeId}`)]]) }
        ).catch(() => {});
    });

    bot.action(/^trade_confirm_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        await Promise.all([refresh("trades"), refresh("users")]).catch(() => {});
        const tradeId = Number(ctx.match[1]);
        const result = await tradeManager.confirmTrade(tradeId, ctx.from.id);
        if (result.error === "insufficient_balance") return ctx.answerCbQuery("❌ Xaridorning balansi yetarli emas!", true);
        if (result.error) return ctx.answerCbQuery("❌ Xatolik yuz berdi.", true);
        const trade = result.trade;
        if (result.locked) {
            notifyBoth(trade, `🔒 *Obmen #${trade.id}* narxi qulflandi: *${fmt(trade.agreedPrice)} so'm*. Sotuvchi skinni yuborishi kerak.`);
        } else {
            notifyOther(trade, ctx.from.id, `✅ *Obmen #${trade.id}*: hamkoringiz narxni tasdiqladi. Sizning ham tasdig'ingiz kerak.`);
        }
        await showTradeRoom(ctx, trade, ctx.from.id, true);
    });

    bot.action(/^trade_sent_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        await refresh("trades").catch(() => {});
        const tradeId = Number(ctx.match[1]);
        const result = tradeManager.markSent(tradeId, ctx.from.id);
        if (result.error) return ctx.answerCbQuery("❌ Xatolik yuz berdi.", true);
        const trade = result.trade;
        const buyer = getUser(trade.buyerId);
        if (buyer?.steamId64) tradeDelivery.snapshotBuyerBaseline(trade, buyer.steamId64).catch(() => {});
        notifyOther(trade, ctx.from.id, `📤 *Obmen #${trade.id}*: sotuvchi skinni yubordi! Steam'da tekshirib, "Skinni oldim" tugmasini bosing.`);
        await showTradeRoom(ctx, trade, ctx.from.id, true);
    });

    bot.action(/^trade_received_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        await Promise.all([refresh("trades"), refresh("users")]).catch(() => {});
        const tradeId = Number(ctx.match[1]);
        const result = tradeManager.markReceived(tradeId, ctx.from.id);
        if (result.error) return ctx.answerCbQuery("❌ Xatolik yuz berdi.", true);
        const trade = result.trade;
        balanceManager.creditTradeProceeds(trade.sellerId, trade.sellerProceeds, trade.id, trade.feeAmount);
        const feeLine = trade.feeAmount > 0 ? `\n💸 Xizmat haqi: ${fmt(trade.feeAmount)} so'm ushlab qolindi.` : "";
        notifyUser(trade.sellerId,
            `🎉 *Obmen #${trade.id}* yakunlandi!*\n💰 *${fmt(trade.sellerProceeds)} so'm* hisobingizga tushdi.${feeLine}\n\n🧊 7 kundan keyin "Balans" bo'limidan yechib olishingiz mumkin bo'ladi.`,
            bot.telegram.sendMessage.bind(bot.telegram), { parse_mode: "Markdown" }
        );
        await showTradeRoom(ctx, trade, ctx.from.id, true);
    });

    bot.action(/^trade_dispute_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const tradeId = Number(ctx.match[1]);
        const result = tradeManager.markDisputed(tradeId, ctx.from.id);
        if (result.error) return ctx.answerCbQuery("❌ Xatolik yuz berdi.", true);
        const trade = result.trade;
        notifyOther(trade, ctx.from.id, `⚠️ *Obmen #${trade.id}* bo'yicha muammo bildirildi. Admin tez orada bog'lanadi.`);
        bot.telegram.sendMessage(Number(process.env.ADMIN_ID),
            `⚠️ *NIZOLI OBMEN!*\n\n🆔 #${trade.id}\n👤 Sotuvchi: \`${trade.sellerId}\`\n🛒 Xaridor: \`${trade.buyerId ?? "-"}\`\n📦 ${skinsLabel(trade)}\n💰 ${trade.agreedPrice ? fmt(trade.agreedPrice) + " so'm" : "kelishilmagan"}`,
            { parse_mode: "Markdown" }
        ).catch(() => {});
        await showTradeRoom(ctx, trade, ctx.from.id, true);
    });

    bot.action(/^trade_cancel_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const tradeId = Number(ctx.match[1]);
        await ctx.editMessageText("❗ Haqiqatan ham obmenni bekor qilmoqchimisiz?",
            Markup.inlineKeyboard([
                [Markup.button.callback("✅ Ha, bekor qilish", `trade_cancel_confirm_${tradeId}`)],
                [Markup.button.callback("⬅️ Orqaga", `trade_${tradeId}`)],
            ])
        ).catch(() => {});
    });

    bot.action(/^trade_cancel_confirm_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        await Promise.all([refresh("trades"), refresh("users")]).catch(() => {});
        const tradeId = Number(ctx.match[1]);
        const result = tradeManager.cancelTrade(tradeId, ctx.from.id);
        if (result.error) return ctx.answerCbQuery("❌ Xatolik yuz berdi.", true);
        const trade = result.trade;
        notifyOther(trade, ctx.from.id,
            `❌ *Obmen #${trade.id}* bekor qilindi.` + (result.refunded ? `\n💰 ${fmt(result.refunded)} so'm balansingizga qaytarildi.` : ""));
        await showTradeRoom(ctx, trade, ctx.from.id, true);
    });

    bot.action(/^trade_chat_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const tradeId = Number(ctx.match[1]);
        pendingTradeChat[ctx.from.id] = tradeId;
        await ctx.editMessageText("💬 *Xabaringizni yozing:*",
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor", `trade_${tradeId}`)]]) }
        ).catch(() => {});
    });

    // ── 🧊 Muzlatilgan mablag'lar / Pul yechish (Balans bo'limidan chaqiriladi) ──
    bot.action("wd_summary", async (ctx) => {
        await ctx.answerCbQuery();
        const { frozen, available, pending } = balanceManager.getHoldSummary(ctx.from.id);
        let text = `🧊 *Obmen orqali tushgan mablag'lar*\n\n🧊 Muzlatilgan: *${fmt(frozen)} so'm* (7 kun to'lmagan)\n✅ Yechib olish mumkin: *${fmt(available)} so'm*`;
        if (pending) text += `\n⏳ So'rov jarayonida: *${fmt(pending)} so'm*`;
        const rows = [];
        if (available > 0) rows.push([Markup.button.callback("💸 Pul yechish", "wd_request")]);
        rows.push([Markup.button.callback("⬅️ Balansga", "go_to_balance")]);
        await ctx.editMessageText(text, { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) }).catch(() => {});
    });

    bot.action("wd_request", async (ctx) => {
        await ctx.answerCbQuery();
        const { available } = balanceManager.getHoldSummary(ctx.from.id);
        if (available <= 0) return ctx.answerCbQuery("❌ Hozircha yechib olinadigan mablag' yo'q.", true);
        pendingWithdrawCard[ctx.from.id] = true;
        await ctx.editMessageText(`💳 *Karta raqamingizni kiriting:*\n\n💰 Yechiladigan summa: *${fmt(available)} so'm*`,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor", "wd_summary")]]) }
        ).catch(() => {});
    });

    // ── TEXT handler (matn kiritish kutilgan holatlar) ──────────────────────
    bot.on("text", async (ctx, next) => {
        if (isAdmin(ctx)) return next();
        if (ctx.message.text.startsWith("/")) return next();
        const userId = ctx.from.id;
        const text   = ctx.message.text.trim();

        if (pendingWithdrawCard[userId]) {
            delete pendingWithdrawCard[userId];
            const user = getUser(userId);
            const result = balanceManager.requestWithdrawal(userId, text);
            if (result.error) return ctx.reply("❌ Hozircha yechib olish mumkin bo'lgan mablag' yo'q.");
            const { request } = result;
            await ctx.reply(
                `✅ *So'rov yuborildi!*\n\n💰 ${fmt(request.amount)} so'm\n💳 Karta: \`${request.cardNumber}\`\n\n⏳ Admin tekshirib, tez orada o'tkazadi.`,
                { parse_mode: "Markdown" }
            );
            bot.telegram.sendMessage(Number(process.env.ADMIN_ID),
                `💸 *Pul chiqarish so'rovi!*\n\n👤 ${user?.name ?? userId}\n🪪 \`${userId}\`\n💰 *${fmt(request.amount)} so'm*\n💳 \`${request.cardNumber}\``,
                { parse_mode: "Markdown", ...Markup.inlineKeyboard([[
                    Markup.button.callback("✅ Tasdiqlash", `wd_approve_${request.id}`),
                    Markup.button.callback("❌ Rad etish",  `wd_reject_${request.id}`),
                ]])}
            ).catch(() => {});
            return;
        }

        if (pendingTradePrice[userId]) {
            const tradeId = pendingTradePrice[userId];
            delete pendingTradePrice[userId];
            const price = Number(text.replace(/\s/g, "").replace(/,/g, ""));
            if (isNaN(price) || price <= 0) return ctx.reply("❌ Faqat musbat raqam kiriting!");
            const result = tradeManager.proposePrice(tradeId, userId, price);
            if (result.error) return ctx.reply("❌ Bu obmenga narx taklif qila olmaysiz.");
            const trade = result.trade;
            await ctx.reply(`✅ Narx taklif qilindi: *${fmt(price)} so'm*\n\nIkkalangiz ham "✅ Tasdiqlayman" bosishi kerak.`,
                { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("📦 Obmenni ochish", `trade_${tradeId}`)]]) });
            notifyOther(trade, userId, `💰 *Obmen #${trade.id}* uchun yangi narx taklifi: *${fmt(price)} so'm*.`);
            return;
        }

        if (pendingTradeChat[userId]) {
            const tradeId = pendingTradeChat[userId];
            delete pendingTradeChat[userId];
            const result = chatManager.addChatMessage(tradeId, userId, text);
            if (result.error) return ctx.reply("❌ Obmen topilmadi.");
            const trade = result.trade;
            notifyOther(trade, userId, `💬 *Obmen #${tradeId}* xabari:*\n${text}`);
            await ctx.reply("✅ Xabar yuborildi.", Markup.inlineKeyboard([[Markup.button.callback("📦 Obmenni ochish", `trade_${tradeId}`)]]));
            return;
        }

        return next();
    });

    // ── Referral/weblogin naqshiga mos: startHandler'dan trade_<id> deep link ──
    module.exports.joinTradeFromDeepLink = async (bot, userId, tradeId) => {
        const result = tradeManager.joinTrade(tradeId, userId);
        if (result.error === "self") {
            return bot.telegram.sendMessage(userId, "❌ Bu sizning o'z e'loningiz — o'zingizga xaridor bo'la olmaysiz.").catch(() => {});
        }
        if (result.error) {
            return bot.telegram.sendMessage(userId, "❌ Bu obmen havolasi endi amal qilmaydi (band qilingan yoki bekor qilingan).").catch(() => {});
        }
        const trade = result.trade;
        const buyer = getUser(userId);
        bot.telegram.sendMessage(trade.sellerId,
            `🎉 *Obmen #${trade.id}* uchun xaridor topildi!*\n👤 ${buyer?.name ?? userId}\n\nNarxni kelishish uchun obmenni oching.`,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("📦 Obmenni ochish", `trade_${trade.id}`)]]) }
        ).catch(() => {});
        bot.telegram.sendMessage(userId,
            `✅ *Obmenga qo'shildingiz!*\n📦 ${skinsLabel(trade)}\n\nSotuvchi bilan narxni kelishing.`,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("📦 Obmenni ochish", `trade_${trade.id}`)]]) }
        ).catch(() => {});
    };

    // ── index.js'dagi setInterval orqali chaqiriladi — xaridor tugma bosmasa
    //    ham, Steam inventar solishtiruvi orqali avtomatik yakunlangan
    //    obmenlar uchun bildirishnoma va balans hisob-kitobi ──────────────────
    module.exports.checkAutoDeliveries = async (bot) => {
        await tradeDelivery.checkAllPendingDeliveries(async (trade) => {
            balanceManager.creditTradeProceeds(trade.sellerId, trade.sellerProceeds, trade.id, trade.feeAmount);
            const feeLine = trade.feeAmount > 0 ? `\n💸 Xizmat haqi: ${fmt(trade.feeAmount)} so'm ushlab qolindi.` : "";
            notifyUser(trade.sellerId,
                `🎉 *Obmen #${trade.id}* yakunlandi!*\n💰 *${fmt(trade.sellerProceeds)} so'm* hisobingizga tushdi.${feeLine}\n\n🤖 Steam inventaringiz orqali avtomatik tekshirilib tasdiqlandi.\n\n🧊 7 kundan keyin "Balans" bo'limidan yechib olishingiz mumkin bo'ladi.`,
                bot.telegram.sendMessage.bind(bot.telegram), { parse_mode: "Markdown" }
            );
            notifyUser(trade.buyerId,
                `🤖 *Obmen #${trade.id}*: skin Steam inventaringizda topildi, savdo avtomatik yakunlandi!`,
                bot.telegram.sendMessage.bind(bot.telegram), { parse_mode: "Markdown" }
            );
        });
    };

    // ── index.js'dagi setInterval orqali chaqiriladi (24 soat javobsiz obmenlar) ──
    module.exports.sweepStaleTrades = (bot) => {
        const cancelled = tradeManager.sweepStaleTrades();
        for (const { trade, refunded } of cancelled) {
            [trade.sellerId, trade.buyerId].filter(Boolean).forEach(id => {
                bot.telegram.sendMessage(id,
                    `⏰ *Obmen #${trade.id}* 24 soat javobsiz qolgani uchun avtomatik bekor qilindi.` +
                    (refunded && id === trade.buyerId ? `\n💰 ${fmt(refunded)} so'm balansingizga qaytarildi.` : ""),
                    { parse_mode: "Markdown" }
                ).catch(() => {});
            });
        }
    };
};
