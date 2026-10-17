// 🛒 Market (CS.Float uslubidagi katalog) — Telegram bot tomoni. Obmen bilan
// bir xil "trades" state machine/tradeManager funksiyalaridan foydalanadi
// (tradeManager.js'ga qarang) — bu yerda faqat: (1) katalog ko'rish, (2) bitta
// skinni narx bilan sotuvga qo'yish, (3) bitta bosishda sotib olish uchun UI
// yozilgan. Sotib olingandan keyingi bosqichlar (yuborish/qabul qilish/
// nizo/bekor qilish) tradeHandler.js'ning UMUMIY `showTradeRoom`'idan
// (kind'ga qaramaydi) qayta ishlatiladi — market va obmen bir xil davomni bosib o'tadi.
const { Markup } = require("telegraf");
const { read, write, refresh } = require("../../backend/database/db");
const { notifyUser } = require("../../backend/notify");
const { fetchUserInventory } = require("../../backend/steam");
const { createPendingAuth } = require("../../backend/auth-steam");
const tradeManager = require("../../backend/tradeManager");
const balanceManager = require("../../backend/balanceManager");
const skinUtils    = require("../../backend/skinUtils");
const tradeHandler = require("./tradeHandler"); // showTradeRoom — faqat tradeHandler(bot) chaqirilgandan keyin mavjud bo'ladi (index.js shunday tartibda ulaydi)
const instantSellManager = require("../../backend/instantSellManager");
const { getInstantSellPriceSom } = require("../../backend/lisSkinsPrice");

const LISTINGS_PAGE_SIZE  = 5;
const INVENTORY_PAGE_SIZE = 6;
const MIN_TRADE_PRICE     = 999;

const marketListPage = {}; // userId -> page
const marketInvPage  = {}; // userId -> page
const pendingMarketSkin  = {}; // userId -> skin obyekti (narx so'ralayotgan payt)
const pendingInstantSell = {}; // userId -> { assetId, marketHashName, name, priceSom } (tanlangandan keyin, tasdiqlashni kutayotgan payt)

function readUsers() { const d = read("users"); return Array.isArray(d) ? d : Object.values(d); }
function getUser(id) { return readUsers().find(u => u.id === id) || null; }
function fmt(n) { return (n ?? 0).toLocaleString(); }

module.exports = (bot) => {
    const isAdmin = (ctx) => ctx.from.id === Number(process.env.ADMIN_ID);

    // ── 🛒 Katalog ────────────────────────────────────────────────────────────
    async function showMarketList(ctx, user, edit) {
        const listings = tradeManager.getMarketListings();
        const page = marketListPage[user.id] ?? 0;
        const { pageItems, page: p, totalPages, total } = skinUtils.paginate(listings, page, LISTINGS_PAGE_SIZE);
        marketListPage[user.id] = p;

        const rows = [];
        if (isAdmin({ from: { id: user.id } })) {
            rows.push([Markup.button.callback("➕ Sotuvga qo'yish", "market_new")]);
        } else {
            rows.push([Markup.button.callback("⚡ Tezkor sotish (o'z skiningizni soting)", "instant_sell_new")]);
        }
        rows.push([Markup.button.callback("📋 Mening bozorim", "market_mine")]);
        pageItems.forEach(t => {
            const mine = t.sellerId === user.id;
            const skin = t.skins?.[0];
            rows.push([Markup.button.callback(
                `${mine ? "🧑‍💼 " : ""}${skin?.name ?? "Skin"} — ${fmt(t.agreedPrice)} so'm`,
                `market_${t.id}`
            )]);
        });
        if (totalPages > 1) {
            const nav = [];
            if (p > 0) nav.push(Markup.button.callback("⬅️ Oldingi", `market_page_${p - 1}`));
            nav.push(Markup.button.callback(`📄 ${p + 1}/${totalPages}`, "auc_noop"));
            if (p < totalPages - 1) nav.push(Markup.button.callback("Keyingi ➡️", `market_page_${p + 1}`));
            rows.push(nav);
        }
        const text = total ? `🛒 *Market* (${total} ta sotuvda)\n\nBitta bosishda sotib oling — muzokarasiz.` : "🛒 *Market*\n\nHozircha sotuvda skin yo'q — birinchi bo'lib qo'ying!";
        const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) };
        try { return edit ? await ctx.editMessageText(text, opts) : await ctx.reply(text, opts); } catch {}
    }

    bot.hears(["🛒 Market", "🛒 Маркет"], async (ctx) => {
        if (isAdmin(ctx)) return;
        const user = getUser(ctx.from.id);
        if (!user) return ctx.reply("⚠️ Avval /start bosing.");
        if (user.blocked) return ctx.reply("⛔ Siz bloklangansiz. Admin bilan bog'laning.");
        await showMarketList(ctx, user, false);
    });

    bot.action("back_to_market", async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (user) await showMarketList(ctx, user, true);
    });

    bot.action(/^market_page_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (!user) return;
        marketListPage[user.id] = Number(ctx.match[1]);
        await showMarketList(ctx, user, true);
    });

    // ── 📋 Mening bozorim ────────────────────────────────────────────────────
    bot.action("market_mine", async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (!user) return;
        const mine = tradeManager.getMyMarketTrades(user.id).sort((a, b) => b.id - a.id);
        if (!mine.length) {
            return ctx.editMessageText("📋 *Mening bozorim*\n\nHozircha hech narsa sotmagansiz/sotib olmagansiz.",
                { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", "back_to_market")]]) }
            ).catch(() => {});
        }
        const rows = mine.slice(0, 15).map(t => {
            const role = t.sellerId === user.id ? "🧑‍💼" : "🛒";
            const skin = t.skins?.[0];
            return [Markup.button.callback(`${role} ${skin?.name ?? "Skin"} — ${fmt(t.agreedPrice)} so'm (${t.status})`, `market_${t.id}`)];
        });
        rows.push([Markup.button.callback("⬅️ Orqaga", "back_to_market")]);
        await ctx.editMessageText("📋 *Mening bozorim*", { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) }).catch(() => {});
    });

    // ── ➕ Sotuvga qo'yish: Steam ulash → inventar → narx ────────────────────
    // MUHIM: Telegram bitta callback query'ga FAQAT BITTA javob (answerCbQuery)
    // qabul qiladi — ikkinchisi rad etiladi va foydalanuvchi xato matnini
    // umuman ko'rmaydi. Shu sabab bu yerda "bo'sh" javob faqat xato bo'lmagan
    // yo'lda yuboriladi.
    bot.action("market_new", async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery("❌ Faqat admin sotuvga qo'ya oladi.", true);
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (!user) return;
        if (!user.steamId64) {
            if (!process.env.STEAM_API_KEY || !process.env.WEBAPP_URL) {
                return ctx.editMessageText("⚠️ Steam ulash hozircha sozlanmagan. Admin bilan bog'laning.",
                    Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", "back_to_market")]])).catch(() => {});
            }
            const nonce = await createPendingAuth(user.id, "bidder");
            const url = `${process.env.WEBAPP_URL}/api/auth/steam/start?state=${nonce}`;
            return ctx.editMessageText(
                "🔗 *Market'ga qo'yish uchun avval Steam hisobingizni ulang:*",
                { parse_mode: "Markdown", ...Markup.inlineKeyboard([
                    [Markup.button.url("🔗 Steam orqali ulash", url)],
                    [Markup.button.callback("⬅️ Orqaga", "back_to_market")],
                ])}
            ).catch(() => {});
        }
        await showMarketInventoryPicker(ctx, user, true);
    });

    // ── ⚡ Tezkor sotish (Instant Sell): Steam ulash → inventar → narx → tasdiq ─
    bot.action("instant_sell_new", async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (!user) return;
        if (!user.steamId64) {
            const nonce = await createPendingAuth(user.id, "bidder");
            const url = `${process.env.WEBAPP_URL}/api/auth/steam/start?state=${nonce}`;
            return ctx.editMessageText(
                "🔗 *Tezkor sotish uchun avval Steam hisobingizni ulang:*",
                { parse_mode: "Markdown", ...Markup.inlineKeyboard([
                    [Markup.button.url("🔗 Steam orqali ulash", url)],
                    [Markup.button.callback("⬅️ Orqaga", "back_to_market")],
                ])}
            ).catch(() => {});
        }
        if (!user.tradeLink) {
            return ctx.editMessageText(
                "⚠️ *Tezkor sotish uchun avval Trade Link kiritishingiz kerak.* Profil bo'limidan kiriting.",
                { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", "back_to_market")]]) }
            ).catch(() => {});
        }
        await showInstantSellInventoryPicker(ctx, user, true);
    });

    async function showInstantSellInventoryPicker(ctx, user, edit) {
        let items;
        try { items = await fetchUserInventory(user.steamId64); }
        catch (err) {
            const msg = `❌ Inventarni olishda xato: ${err.message}`;
            const opts = Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", "back_to_market")]]);
            try { return edit ? await ctx.editMessageText(msg, opts) : await ctx.reply(msg, opts); } catch {}
            return;
        }
        const tradable = items.filter(it => it.tradable !== false);
        const { pageItems, totalPages, total } = skinUtils.paginate(tradable, 0, INVENTORY_PAGE_SIZE);
        if (!total) {
            const msg = "😔 Steam inventaringizda savdo qilinadigan itemlar topilmadi.";
            return ctx.editMessageText(msg, Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", "back_to_market")]])).catch(() => {});
        }
        const rows = pageItems.map(it => [Markup.button.callback(
            `${it.name}${it.float != null ? ` (${skinUtils.wearCode(it.float)})` : ""}`,
            `is_pick_${it.assetId}`
        )]);
        rows.push([Markup.button.callback("⬅️ Orqaga", "back_to_market")]);
        const text = `⚡ *Tezkor sotish — skinni tanlang:* (${total} ta)`;
        const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) };
        try { return edit ? await ctx.editMessageText(text, opts) : await ctx.reply(text, opts); } catch {}
    }

    // answerCbQuery FAQAT bir marta — quyidagi xato yo'llari xabarni o'zi
    // ko'rsatadi (yuqorida bo'sh javob yuborilsa, ular ko'rinmay qolardi).
    bot.action(/^is_pick_(.+)$/, async (ctx) => {
        const user = getUser(ctx.from.id);
        if (!user) return ctx.answerCbQuery();
        const assetId = ctx.match[1];
        let items;
        try { items = await fetchUserInventory(user.steamId64); }
        catch (err) { return ctx.answerCbQuery("❌ Inventar xatosi: " + err.message, true); }
        const item = items.find(it => String(it.assetId) === assetId);
        if (!item) return ctx.answerCbQuery("❌ Item topilmadi (kesh eskirgan).", true);
        // `marketHashName` relay javobida YO'Q — Steam formatiga mos ravishda
        // o'zimiz hosil qilamiz (Task 2'da qo'shilgan skinUtils.marketHashName).
        const marketHashName = skinUtils.marketHashName(item.name, item.float);

        let priceSom;
        try { priceSom = await getInstantSellPriceSom(marketHashName); }
        catch (err) { return ctx.answerCbQuery("❌ Narx olishda xato: " + err.message, true); }
        if (priceSom == null) return ctx.answerCbQuery("❌ Bu skin uchun narx topilmadi.", true);

        pendingInstantSell[user.id] = { assetId: item.assetId, marketHashName, name: item.name, priceSom };
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            `⚡ *"${item.name}"*\n\n💰 Taklif: *${priceSom.toLocaleString()} so'm* (darhol to'lanadi)\n\nTasdiqlaysizmi?`,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([
                [Markup.button.callback("✅ Ha, sotaman", "is_confirm")],
                [Markup.button.callback("❌ Bekor", "back_to_market")],
            ])}
        ).catch(() => {});
    });

    bot.action("is_confirm", async (ctx) => {
        const user = getUser(ctx.from.id);
        if (!user) return ctx.answerCbQuery();
        const pending = pendingInstantSell[user.id];
        if (!pending) return ctx.answerCbQuery("❌ So'rov topilmadi, qaytadan boshlang.", true);
        delete pendingInstantSell[user.id];

        let result;
        try {
            result = await instantSellManager.createInstantSellRequest(user.id, pending.assetId, pending.marketHashName, user.steamId64);
        } catch (err) {
            return ctx.answerCbQuery("❌ Xatolik: " + err.message, true);
        }
        if (result.error) return ctx.answerCbQuery("❌ Xatolik: " + result.error, true);

        const botTradeUrl = process.env.BOT_STEAM_TRADE_URL || "(admin bilan bog'laning)";
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            `📤 *"${pending.name}"* itemini quyidagi trade-link'ga yuboring:\n\n\`${botTradeUrl}\`\n\n` +
            `⚠️ FAQAT shu itemni yuboring, hech narsa so'ramang. Qabul qilingach, *${pending.priceSom.toLocaleString()} so'm* darhol balansingizga tushadi.\n\n⏰ So'rov 15 daqiqa amal qiladi.`,
            { parse_mode: "Markdown" }
        ).catch(() => {});
    });

    async function showMarketInventoryPicker(ctx, user, edit) {
        let items;
        try {
            items = await fetchUserInventory(user.steamId64);
        } catch (err) {
            const msg = `❌ Inventarni olishda xato: ${err.message}`;
            const opts = Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", "back_to_market")]]);
            try { return edit ? await ctx.editMessageText(msg, opts) : await ctx.reply(msg, opts); } catch {}
            return;
        }
        const tradable = items.filter(it => it.tradable !== false);
        const page = marketInvPage[user.id] ?? 0;
        const { pageItems, page: p, totalPages, total } = skinUtils.paginate(tradable, page, INVENTORY_PAGE_SIZE);
        marketInvPage[user.id] = p;

        if (!total) {
            const msg = "😔 Steam inventaringizda savdo qilinadigan (tradable) itemlar topilmadi.";
            const opts = Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", "back_to_market")]]);
            try { return edit ? await ctx.editMessageText(msg, opts) : await ctx.reply(msg, opts); } catch {}
            return;
        }

        const rows = pageItems.map(it => [Markup.button.callback(
            `${it.name}${it.float != null ? ` (${skinUtils.wearCode(it.float)})` : ""}`,
            `mkt_pick_${it.assetId}`
        )]);
        if (totalPages > 1) {
            const nav = [];
            if (p > 0) nav.push(Markup.button.callback("⬅️ Oldingi", `market_invpage_${p - 1}`));
            nav.push(Markup.button.callback(`📄 ${p + 1}/${totalPages}`, "auc_noop"));
            if (p < totalPages - 1) nav.push(Markup.button.callback("Keyingi ➡️", `market_invpage_${p + 1}`));
            rows.push(nav);
        }
        rows.push([Markup.button.callback("⬅️ Orqaga", "back_to_market")]);
        const text = `🎒 *Sotmoqchi bo'lgan skinni tanlang:* (${total} ta)`;
        const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) };
        try { return edit ? await ctx.editMessageText(text, opts) : await ctx.reply(text, opts); } catch {}
    }

    bot.action(/^market_invpage_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (!user) return;
        marketInvPage[user.id] = Number(ctx.match[1]);
        await showMarketInventoryPicker(ctx, user, true);
    });

    bot.action(/^mkt_pick_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (!user) return;
        const assetId = ctx.match[1];
        let items;
        try { items = await fetchUserInventory(user.steamId64); }
        catch (err) { return ctx.answerCbQuery("❌ Inventar xatosi: " + err.message, true); }

        const item = items.find(it => String(it.assetId) === assetId);
        if (!item) return ctx.answerCbQuery("❌ Item topilmadi (kesh eskirgan bo'lishi mumkin).", true);

        pendingMarketSkin[user.id] = {
            assetId: item.assetId, name: item.name,
            wear: skinUtils.wearCode(item.float), float: item.float ?? null,
            inspectLink: item.inspectLink || null, imageUrl: item.image || null,
            priceEstimate: null,
        };
        await ctx.editMessageText(
            `💰 *"${item.name}" uchun narx belgilang (so'mda, kamida ${fmt(MIN_TRADE_PRICE)}):*`,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor", "back_to_market")]]) }
        ).catch(() => {});
    });

    // ── Bitta e'lonni ko'rish ────────────────────────────────────────────────
    async function showMarketListing(ctx, trade, viewerId, edit) {
        const seller = getUser(trade.sellerId);
        const isSeller = viewerId === trade.sellerId;
        const skin = trade.skins?.[0];

        let text = `🛒 *Market #${trade.id}*\n\n📦 *${skin?.name ?? "Skin"}*${skin?.wear ? ` (${skin.wear})` : ""}\n`;
        text += `👤 Sotuvchi: ${seller?.name ?? trade.sellerId}\n`;
        text += `💰 Narx: *${fmt(trade.agreedPrice)} so'm*\n`;

        const rows = [];
        if (trade.status === "open") {
            if (isSeller) rows.push([Markup.button.callback("❌ E'lonni bekor qilish", `market_cancel_${trade.id}`)]);
            else rows.push([Markup.button.callback("🛒 Sotib olish", `market_buy_${trade.id}`)]);
            rows.push([Markup.button.callback("⬅️ Market'ga", "back_to_market")]);
            const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) };
            try { return edit ? await ctx.editMessageText(text, opts) : await ctx.reply(text, opts); } catch {}
            return;
        }
        // Sotilgan/yakunlangan/bekor qilingan — sent/received/dispute bosqichlari
        // Obmen bilan bir xil, shu sabab umumiy trade-room ko'rinishidan foydalanamiz.
        return tradeHandler.showTradeRoom(ctx, trade, viewerId, edit);
    }

    bot.action(/^market_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const trade = tradeManager.getTradeById(Number(ctx.match[1]));
        if (!trade || trade.kind !== "market") return ctx.answerCbQuery("❌ Topilmadi.", true);
        await showMarketListing(ctx, trade, ctx.from.id, true);
    });

    bot.action(/^market_buy_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        await Promise.all([refresh("trades"), refresh("users")]).catch(() => {});
        const tradeId = Number(ctx.match[1]);
        const result = await tradeManager.buyMarketListing(tradeId, ctx.from.id);
        if (result.error === "self") return ctx.answerCbQuery("❌ O'zingizga sotib ololmaysiz.", true);
        if (result.error === "not_open") return ctx.answerCbQuery("❌ Bu e'lon endi ochiq emas.", true);
        if (result.error === "insufficient_balance") return ctx.answerCbQuery("❌ Balansingiz yetarli emas.", true);
        if (result.error) return ctx.answerCbQuery("❌ Xatolik yuz berdi.", true);

        const trade = result.trade;
        // Sotuvchi admin bo'lsa — tradeManager savdoni darhol "completed"
        // qildi: sotuvchi tushumini qo'shamiz va xaridorga "Chiqarib olish"
        // uchun marketPurchases yozuvini yozamiz (POST /api/market/:id/buy
        // dagi naqshning aynan o'zi — bot va mini-app bir xil ishlashi uchun).
        if (result.autoCompleted) {
            balanceManager.creditTradeProceeds(trade.sellerId, trade.sellerProceeds, trade.id, trade.feeAmount);
            const arr = readUsers();
            const buyer = arr.find(x => x.id === ctx.from.id);
            if (buyer) {
                if (!Array.isArray(buyer.marketPurchases)) buyer.marketPurchases = [];
                const skin = trade.skins?.[0];
                buyer.marketPurchases.push({
                    lotId: trade.id, lotName: skin?.name ?? "Skin",
                    image: skin?.imageUrl ?? null, float: skin?.float ?? null,
                    assetId: skin?.assetId ?? null, price: trade.agreedPrice,
                    status: "pending", requestedAt: null,
                });
                write("users", arr);
            }
        }

        await ctx.editMessageText(
            `✅ *Sotib olindi!*\n\n📦 ${trade.skins?.[0]?.name}\n💰 ${fmt(trade.agreedPrice)} so'm\n\n` +
            (result.autoCompleted
                ? `🎒 Skinni "Mening inventarim" bo'limidan istalgan payt Steam'ga chiqarib olishingiz mumkin.`
                : `Sotuvchi skinni Trade Link'ingizga yuborishini kuting.`),
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("📦 Savdoni ochish", `trade_${trade.id}`)]]) }
        ).catch(() => {});
        notifyUser(trade.sellerId,
            `🛒 *Market #${trade.id}*: "${trade.skins?.[0]?.name}" sotildi! *${fmt(trade.agreedPrice)} so'm*. ` +
            (result.autoCompleted
                ? `\n💰 *${fmt(trade.sellerProceeds)} so'm* hisobingizga tushdi (skin xaridorga avtomatik yetkaziladi).`
                : `Xaridorning trade linkiga skinni yuboring.`),
            bot.telegram.sendMessage.bind(bot.telegram),
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("📦 Savdoni ochish", `trade_${trade.id}`)]]) }
        );
    });

    bot.action(/^market_cancel_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        await refresh("trades").catch(() => {});
        const tradeId = Number(ctx.match[1]);
        const trade = tradeManager.getTradeById(tradeId);
        if (!trade || trade.sellerId !== ctx.from.id || trade.status !== "open") return ctx.answerCbQuery("❌ Bekor qilib bo'lmaydi.", true);
        const result = tradeManager.cancelTrade(tradeId, ctx.from.id);
        if (result.error) return ctx.answerCbQuery("❌ Xatolik yuz berdi.", true);
        await ctx.editMessageText("❌ E'lon bekor qilindi.",
            Markup.inlineKeyboard([[Markup.button.callback("⬅️ Market'ga", "back_to_market")]])
        ).catch(() => {});
    });

    // ── TEXT handler — faqat narx kutilayotgan holat ────────────────────────
    bot.on("text", async (ctx, next) => {
        if (isAdmin(ctx)) return next();
        if (ctx.message.text.startsWith("/")) return next();
        const userId = ctx.from.id;
        const skin = pendingMarketSkin[userId];
        if (!skin) return next();

        const text = ctx.message.text.trim();
        const price = Number(text.replace(/\s/g, "").replace(/,/g, ""));
        if (isNaN(price) || price < MIN_TRADE_PRICE) {
            return ctx.reply(`❌ Kamida ${fmt(MIN_TRADE_PRICE)} so'm bo'lgan musbat raqam kiriting.`);
        }
        delete pendingMarketSkin[userId];
        const trade = tradeManager.createTrade(userId, [skin], "telegram", price, "public", null, "market");
        await ctx.reply(
            `✅ *Market'ga qo'yildi!*\n\n📦 ${skin.name}\n💰 ${fmt(price)} so'm`,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🛒 Market'ga", "back_to_market")]]) }
        );
    });
};
