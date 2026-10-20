// 💸 Skin sotish — Telegram bot tomoni + vaqtincha o'chirilgan bo'limlar
// (features.js) uchun to'siq. index.js'da BOSHQA handlerlardan OLDIN
// ulanadi — shunda o'chirilgan bo'lim tugmalari/callbacklari boshqa
// handlerlarga yetib bormaydi (ularning kodi o'chirilmagan, faqat to'silgan).
//
// Sotish oqimining o'zi mini-app/saytda (ko'p skinni belgilash qulay):
// bu yerda faqat (1) "💸 Skin sotish" tugmasi mini-appni ochadi, (2) admin
// "✅ Oldim" / "❌ Rad etish" tugmalarini bosadi (server.js yuborgan xabarda).
const { Markup } = require("telegraf");
const { isAdminId } = require("../../backend/adminIds");
const { refresh } = require("../../backend/database/db");
const { notifyUser } = require("../../backend/notify");
const { FEATURES } = require("../../backend/features");
const instantSellManager = require("../../backend/instantSellManager");

const SELL_TEXTS = ["💸 Skin sotish", "💸 Продать скин"];

const DISABLED_TEXTS = [
    ...(!FEATURES.auctions ? ["🏷 Auksionlar", "🏷 Аукционы"] : []),
    ...(!FEATURES.trade ? ["🔄 Obmen", "🔄 Обмен"] : []),
    ...(!FEATURES.market ? ["🛒 Market", "🛒 Маркет"] : []),
];
// Eski xabarlardagi tugmalar orqali YANGI amal boshlashni to'sish.
// Boshlangan obmen/market savdolarining davomi (sent/received/dispute...)
// va yutilgan skinni chiqarib olish to'silmaydi.
const DISABLED_CALLBACKS = [
    ...(!FEATURES.auctions ? [/^quickbid_\d+$/, /^bid_\d+$/] : []),
    ...(!FEATURES.trade ? [/^trade_new$/, /^trade_pick_/] : []),
    ...(!FEATURES.market ? [/^market_new$/, /^mkt_pick_/, /^market_buy_\d+$/] : []),
    /^instant_sell_new$/, /^is_pick_/, /^is_confirm$/, // eski bot-ichidagi sotish oqimi
];

function sellKeyboard() {
    const url = process.env.WEBAPP_URL;
    if (!url) return undefined;
    return Markup.inlineKeyboard([[Markup.button.webApp("💸 Skin sotish", `${url}/?page=sell`)]]);
}

module.exports = (bot) => {
    const isAdmin = (ctx) => isAdminId(ctx.from?.id);

    bot.use(async (ctx, next) => {
        const text = ctx.message?.text;
        if (text && DISABLED_TEXTS.includes(text)) {
            return ctx.reply("⏸ Bu bo'lim vaqtincha o'chirilgan. Hozir faqat 💸 Skin sotish ishlaydi.", sellKeyboard() || {});
        }
        const data = ctx.callbackQuery?.data;
        if (data && DISABLED_CALLBACKS.some(re => re.test(data))) {
            return ctx.answerCbQuery("⏸ Bu bo'lim vaqtincha o'chirilgan.", { show_alert: true }).catch(() => {});
        }
        return next();
    });

    bot.hears(SELL_TEXTS, async (ctx) => {
        const kb = sellKeyboard();
        if (!kb) return ctx.reply("⚠️ Sayt manzili sozlanmagan (WEBAPP_URL).");
        await ctx.reply(
            "💸 *Skin sotish*\n\n" +
            "1. Steam akkauntingizni ulang\n" +
            "2. Sotmoqchi bo'lgan skin(lar)ni belgilang va \"Sotish\"ni bosing\n" +
            "3. Ko'rsatilgan trade linkka skinni Steam orqali yuboring\n" +
            "4. Admin qabul qilgach, pul balansingizga tushadi\n\n" +
            "⏳ Pulni kartaga yechish — 8 kun 12 soatdan keyin.",
            { parse_mode: "Markdown", ...kb }
        );
    });

    // ── Admin: ✅ Oldim / ❌ Rad etish ─────────────────────────────────────
    async function markMessage(ctx, suffix) {
        const original = ctx.callbackQuery?.message?.text || "";
        await ctx.editMessageText(`${original}\n\n${suffix}`).catch(() => {});
    }

    bot.action(/^isell_ok_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Faqat admin uchun", { show_alert: true });
        const id = Number(ctx.match[1]);
        let result;
        try { result = await instantSellManager.approveSellRequest(id); }
        catch (err) { return ctx.answerCbQuery("❌ Xatolik: " + err.message, { show_alert: true }); }

        if (result.error === "wrong_state") {
            await markMessage(ctx, `ℹ️ Allaqachon ko'rib chiqilgan: ${result.request.status === "credited" ? "✅ pul berilgan" : "❌ rad etilgan"}`);
            return ctx.answerCbQuery("Bu so'rov allaqachon ko'rib chiqilgan");
        }
        if (result.error) return ctx.answerCbQuery("❌ Xatolik: " + result.error, { show_alert: true });

        await refresh("users").catch(() => {});
        notifyUser(result.request.userId, instantSellManager.approvedText(result.request),
            bot.telegram.sendMessage.bind(bot.telegram), { parse_mode: "Markdown" });
        await markMessage(ctx, `✅ OLINDI — ${result.request.totalSom.toLocaleString()} so'm balansga tushdi (${new Date().toLocaleString("uz-UZ")})`);
        return ctx.answerCbQuery("✅ Pul userning balansiga tushdi");
    });

    bot.action(/^isell_no_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Faqat admin uchun", { show_alert: true });
        const id = Number(ctx.match[1]);
        let result;
        try { result = await instantSellManager.rejectSellRequest(id, "Skin qabul qilinmadi"); }
        catch (err) { return ctx.answerCbQuery("❌ Xatolik: " + err.message, { show_alert: true }); }

        if (result.error === "wrong_state") {
            await markMessage(ctx, `ℹ️ Allaqachon ko'rib chiqilgan: ${result.request.status === "credited" ? "✅ pul berilgan" : "❌ rad etilgan"}`);
            return ctx.answerCbQuery("Bu so'rov allaqachon ko'rib chiqilgan");
        }
        if (result.error) return ctx.answerCbQuery("❌ Xatolik: " + result.error, { show_alert: true });

        notifyUser(result.request.userId, instantSellManager.rejectedText(result.request),
            bot.telegram.sendMessage.bind(bot.telegram), { parse_mode: "Markdown" });
        await markMessage(ctx, "❌ RAD ETILDI");
        return ctx.answerCbQuery("Rad etildi");
    });
};

module.exports.SELL_TEXTS = SELL_TEXTS;
