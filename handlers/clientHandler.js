const { Markup } = require("telegraf");
const { read, write, refresh } = require("../database/db");
const { notifyUser } = require("../notify");
const bidManager = require("../bidManager");
const skinUtils = require("../skinUtils");

const pendingBid         = {};
const pendingTopup       = {};
const pendingTradeLink   = {};
const pendingPriceFilter = {}; // userId -> true (auksion narx oralig'i matnini kutmoqda)
const watchingLots        = {}; // userId -> Set of lotIds

const AUCTIONS_PAGE_SIZE = 5;
const auctionFilters     = {}; // userId -> { status, cat, wear, minPrice, maxPrice, page }

function getAuctionFilter(userId) {
    if (!auctionFilters[userId]) {
        auctionFilters[userId] = { status: "active", cat: "all", wear: "all", minPrice: null, maxPrice: null, page: 0 };
    }
    return auctionFilters[userId];
}
function auctionFilterIsActive(f) {
    return f.cat !== "all" || f.wear !== "all" || f.minPrice != null || f.maxPrice != null || f.status !== "active";
}
function applyAuctionFilter(list, f) {
    return list.filter(lot => {
        if (f.status === "active" && lot.status !== "active") return false;
        if (f.status === "finished" && lot.status !== "finished") return false;
        if (f.cat !== "all" && skinUtils.guessCategory(lot.name) !== f.cat) return false;
        if (f.wear !== "all" && skinUtils.wearCode(lot.float) !== f.wear) return false;
        if (f.minPrice != null && lot.price < f.minPrice) return false;
        if (f.maxPrice != null && lot.price > f.maxPrice) return false;
        return true;
    });
}
function filterMenuKeyboard(f) {
    const statusRow = [
        Markup.button.callback(`${f.status === "active" ? "✅ " : ""}🟢 Faol`, "auc_status_active"),
        Markup.button.callback(`${f.status === "finished" ? "✅ " : ""}🏁 Tugagan`, "auc_status_finished"),
    ];
    const catRows = [];
    for (let i = 0; i < skinUtils.CATEGORIES.length; i += 2) {
        catRows.push(skinUtils.CATEGORIES.slice(i, i + 2).map(c =>
            Markup.button.callback(`${f.cat === c.key ? "✅ " : ""}${c.label}`, `auc_cat_${c.key}`)
        ));
    }
    const wearRows = [];
    for (let i = 0; i < skinUtils.WEAR_TIERS.length; i += 3) {
        wearRows.push(skinUtils.WEAR_TIERS.slice(i, i + 3).map(w =>
            Markup.button.callback(`${f.wear === w.code ? "✅ " : ""}${w.label}`, `auc_wear_${w.code}`)
        ));
    }
    const priceLabel = (f.minPrice != null || f.maxPrice != null)
        ? `💰 ${f.minPrice != null ? f.minPrice.toLocaleString() : "0"} — ${f.maxPrice != null ? f.maxPrice.toLocaleString() : "∞"}`
        : "💰 Narx oralig'ini kiritish";
    return Markup.inlineKeyboard([
        statusRow,
        ...catRows,
        ...wearRows,
        [Markup.button.callback(priceLabel, "auc_price_prompt")],
        [Markup.button.callback("🧹 Filtrni tozalash", "auc_filter_clear"), Markup.button.callback("✅ Qo'llash", "auc_filter_apply")],
        [Markup.button.callback("⬅️ Orqaga", "auc_filter_back")],
    ]);
}

function readUsers() {
    const data = read("users");
    if (Array.isArray(data)) return data;
    return Object.values(data);
}
function getUser(id) { return readUsers().find(u => u.id === id) || null; }
function saveUsers(arr) { write("users", arr); }

function getPaymentCards() {
    return {
        payme:    { name: "Payme",     emoji: "🔵", card: process.env.PAYME_CARD    || "8600 0000 0000 0000", owner: process.env.CARD_OWNER || "KARTA EGASI" },
        click:    { name: "Click",     emoji: "🟢", card: process.env.CLICK_CARD    || "8600 0000 0000 0000", owner: process.env.CARD_OWNER || "KARTA EGASI" },
        paynet:   { name: "Paynet",    emoji: "🟠", card: process.env.PAYNET_CARD   || "8600 0000 0000 0000", owner: process.env.CARD_OWNER || "KARTA EGASI" },
        uzumbank: { name: "Uzum Bank", emoji: "🍇", card: process.env.UZUM_CARD     || "8600 0000 0000 0000", owner: process.env.CARD_OWNER || "KARTA EGASI" },
    };
}
function getPromoCodes() { return read("promos") || []; }
function checkPromo(code) { return getPromoCodes().find(p => p.code === code && p.active); }
// `perUserLimit` (default 1) — bitta odam shu kodni necha marta ishlata olishi.
// `usedBy` endi userId'larni TAKRORLAB saqlaydi (har ishlatishda push), shu
// orqali shu userda nechta marta ishlatilganini sanaymiz.
function promoLimitReached(promo, userId) {
    const limit = promo.perUserLimit || 1;
    if (limit <= 0) return false; // 0/bo'sh = cheksiz
    return (promo.usedBy || []).filter(id => id === userId).length >= limit;
}

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

// VIP badge
function vipBadge(user) {
    const wins = (user.wins || []).length;
    if (wins >= 10) return "💎 Legendary";
    if (wins >= 5)  return "🥇 VIP";
    if (wins >= 2)  return "🥈 Pro";
    return "🥉 Rookie";
}

const TEXTS = {
    uz: {
        auctions:   "🏷 Auksionlar",
        profile:    "👤 Profil",
        balance:    "💰 Balance",
        inventory:  "🎒 Inventar",
        no_auction: "😔 Hozircha faol auksionlar yo'q.",
        blocked:    "⛔ Siz bloklangansiz. Admin bilan bog'laning.",
        profile_msg: (u) =>
            `👤 *Profil*\n\n` +
            `🪪 ID: \`${u.id}\`\n` +
            `📛 Ism: ${u.name}\n` +
            `${vipBadge(u)}\n` +
            `🏆 Yutishlar: ${(u.wins||[]).length} ta\n` +
            `💰 Balance: ${(u.balance ?? 0).toLocaleString()} so'm\n` +
            `🔗 Trade Link: ${u.tradeLink ? "✅ Mavjud" : "❌ Yo'q"}\n` +
            `👥 Referral: ${(u.referrals||[]).length} ta do'st\n` +
            `🌐 Til: ${u.lang === "ru" ? "Русский" : "O'zbekcha"}`,
        inv_empty:  "🎒 Inventaringiz bo'sh.",
    },
    ru: {
        auctions:   "🏷 Аукционы",
        profile:    "👤 Профиль",
        balance:    "💰 Баланс",
        inventory:  "🎒 Инвентарь",
        no_auction: "😔 Активных аукционов пока нет.",
        blocked:    "⛔ Вы заблокированы. Свяжитесь с администратором.",
        profile_msg: (u) =>
            `👤 *Профиль*\n\n` +
            `🪪 ID: \`${u.id}\`\n` +
            `📛 Имя: ${u.name}\n` +
            `${vipBadge(u)}\n` +
            `🏆 Побед: ${(u.wins||[]).length}\n` +
            `💰 Баланс: ${(u.balance ?? 0).toLocaleString()} сум\n` +
            `🔗 Trade Link: ${u.tradeLink ? "✅ Есть" : "❌ Нет"}\n` +
            `👥 Рефералы: ${(u.referrals||[]).length} друзей\n` +
            `🌐 Язык: Русский`,
        inv_empty:  "🎒 Инвентарь пуст.",
    },
};

function T(user, key, ...args) {
    const lang = user?.lang || "uz";
    const val  = TEXTS[lang]?.[key];
    return typeof val === "function" ? val(...args) : (val ?? "");
}

// ── Show helpers ──────────────────────────────────────────────────────────────
async function showAuctionsFiltered(ctx, user, edit = false) {
    const userId = user.id;
    const f = getAuctionFilter(userId);
    const all = read("auctions");
    const filteredList = applyAuctionFilter(all, f);
    const { pageItems, page, totalPages, total } = skinUtils.paginate(filteredList, f.page, AUCTIONS_PAGE_SIZE);
    f.page = page;

    const filterActive = auctionFilterIsActive(f);
    const statusLabel = f.status === "finished" ? "Tugagan" : "Faol";

    if (!total) {
        const msg = `😔 ${statusLabel} auksionlar topilmadi.` + (filterActive ? "\n\n🎛 Filtr qo'llangan." : "");
        const rows = [[Markup.button.callback(filterActive ? "🎛 Filtr ●" : "🎛 Filtr", "auc_filter_menu")]];
        if (filterActive) rows.push([Markup.button.callback("🧹 Filtrni tozalash", "auc_filter_clear")]);
        const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) };
        try { return edit ? await ctx.editMessageText(msg, opts) : await ctx.reply(msg, opts); } catch {}
        return;
    }

    const buttons = pageItems.map(lot => {
        const tl = lot.status === "active" ? timeLeft(lot.endTime) : null;
        const icon = lot.status === "active" ? "📦" : "🏁";
        return [Markup.button.callback(
            `${icon} ${lot.name} | 💰 ${lot.price.toLocaleString()}${tl ? ` | ${tl}` : ""}`,
            `lot_${lot.id}`
        )];
    });

    if (totalPages > 1) {
        const navRow = [];
        if (page > 0) navRow.push(Markup.button.callback("⬅️ Oldingi", `auc_page_${page - 1}`));
        navRow.push(Markup.button.callback(`📄 ${page + 1}/${totalPages}`, "auc_noop"));
        if (page < totalPages - 1) navRow.push(Markup.button.callback("Keyingi ➡️", `auc_page_${page + 1}`));
        buttons.push(navRow);
    }

    const filterRow = [Markup.button.callback(filterActive ? "🎛 Filtr ●" : "🎛 Filtr", "auc_filter_menu")];
    if (filterActive) filterRow.push(Markup.button.callback("🧹 Tozalash", "auc_filter_clear"));
    buttons.push(filterRow);
    buttons.push([Markup.button.callback("🏆 Liderlar jadvali", "leaderboard")]);

    const title = `🏷 *${statusLabel} auksionlar* (${total} ta)`;
    const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) };
    try { return edit ? await ctx.editMessageText(title, opts) : await ctx.reply(title, opts); } catch {}
}

async function showProfile(ctx, user, edit = false) {
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🔗 Trade Link", "add_trade_link"), Markup.button.callback("🌐 Til", "change_lang")],
        [Markup.button.callback("🎒 Inventar", "my_inventory"),     Markup.button.callback("📊 Bid tarixi", "my_bid_history")],
        [Markup.button.callback("💰 Balans tarixi", "balance_history"), Markup.button.callback("👥 Referral", "my_referral")],
    ]);
    const opts = { parse_mode: "Markdown", ...keyboard };
    try { return edit ? await ctx.editMessageText(T(user, "profile_msg", user), opts) : await ctx.reply(T(user, "profile_msg", user), opts); } catch {}
}

async function showBalance(ctx, user, edit = false) {
    if (!FEATURES.topup) {
        // To'ldirish o'chiq — faqat balans va pul yechish (Skin sotish puli).
        const text = `💰 *Balansingiz: ${(user.balance ?? 0).toLocaleString()} so'm*`;
        const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("💸 Pul yechish / muzlatilgan mablag'", "wd_summary")]]) };
        try { return edit ? await ctx.editMessageText(text, opts) : await ctx.reply(text, opts); } catch {}
        return;
    }
    const text = `💰 *Balansingiz: ${(user.balance ?? 0).toLocaleString()} so'm*\n\n💳 To'lov usulini tanlang:`;
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🔵 Payme", "topup_payme"), Markup.button.callback("🟢 Click", "topup_click")],
        [Markup.button.callback("🟠 Paynet", "topup_paynet"), Markup.button.callback("🍇 Uzum Bank", "topup_uzumbank")],
        [Markup.button.callback("🧊 Obmen — muzlatilgan mablag'lar", "wd_summary")],
    ]);
    const opts = { parse_mode: "Markdown", ...keyboard };
    try { return edit ? await ctx.editMessageText(text, opts) : await ctx.reply(text, opts); } catch {}
}

async function showInventory(ctx, user, edit = false) {
    const wins      = Array.isArray(user.wins) ? user.wins : [];
    const pending   = wins.filter(w => !w.status || w.status === "requested" || w.status === "rejected");
    const delivered = wins.filter(w => w.status === "delivered");
    if (!wins.length) {
        const opts = Markup.inlineKeyboard([[Markup.button.callback("⬅️ Profilga", "back_to_profile")]]);
        try { return edit ? await ctx.editMessageText(T(user, "inv_empty"), opts) : await ctx.reply(T(user, "inv_empty"), opts); } catch {}
        return;
    }
    let text = `🎒 *Inventar*\n\n`;
    if (pending.length) {
        text += `📦 *Kutilayotgan (${pending.length}):*\n`;
        pending.forEach((w, i) => {
            const st = w.status === "requested" ? "✈️ Yuborilmoqda" : w.status === "rejected" ? "❌ Rad etildi" : "⏳ Kutilmoqda";
            text += `\n${i+1}. 🏷 *${w.lotName??"-"}* — ${(w.price??0).toLocaleString()} so'm\n   ${st}\n`;
            if (w.status === "rejected" && w.rejectComment) text += `   💬 ${w.rejectComment}\n`;
        });
    }
    if (delivered.length) {
        text += `\n✅ *Olingan (${delivered.length}):*\n`;
        delivered.forEach((w,i) => text += `${i+1}. 🏷 ${w.lotName??"-"} — ${(w.price??0).toLocaleString()} so'm\n`);
    }
    const btns = pending.filter(w => w.status !== "requested")
        .map(w => [Markup.button.callback(`📤 Chiqarish: ${w.lotName??"-"}`, `withdraw_${w.lotId}`)]);
    btns.push([Markup.button.callback("⬅️ Profilga", "back_to_profile")]);
    const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(btns) };
    try { return edit ? await ctx.editMessageText(text, opts) : await ctx.reply(text, opts); } catch {}
}

module.exports = (bot) => {
    const isAdmin = (ctx) => ctx.from.id === Number(process.env.ADMIN_ID);

    // ── ⏰ "Tugashiga N daqiqa qoldi" eslatmasi — o'sha auksionda bid qo'ygan
    //    ishtirokchilarning barchasiga (kuzatuvchilarga emas) yuboriladi ──────
    const ENDING_SOON_MINUTES = 5;
    const notifiedEndingSoon  = new Set();
    const adminId = Number(process.env.ADMIN_ID);
    setInterval(() => {
        const auctions = read("auctions").filter(a => a.status === "active" && a.endTime);
        const bids = read("bids") || [];
        const now = Date.now();
        const activeIds = new Set();

        for (const a of auctions) {
            activeIds.add(a.id);
            const msLeft = new Date(a.endTime).getTime() - now;
            if (msLeft <= 0 || msLeft > ENDING_SOON_MINUTES * 60000) continue;
            if (notifiedEndingSoon.has(a.id)) continue;
            notifiedEndingSoon.add(a.id);

            const minutesLeft = Math.max(1, Math.ceil(msLeft / 60000));
            const keyboard = process.env.WEBAPP_URL
                ? Markup.inlineKeyboard([[Markup.button.webApp("📦 Ko'rish", `${process.env.WEBAPP_URL}/?lot=${a.id}`)]])
                : Markup.inlineKeyboard([[Markup.button.callback("📦 Ko'rish", `lot_${a.id}`)]]);

            const participantIds = [...new Set(
                bids.filter(b => b.lotId === a.id).map(b => b.userId)
            )].filter(uid => uid !== adminId);

            for (const uid of participantIds) {
                notifyUser(
                    uid,
                    `⏰ *Diqqat! "${a.name}" auksioni ${minutesLeft} daqiqadan keyin tugaydi!*\n\n💰 Joriy narx: *${a.price.toLocaleString()} so'm*\n\nOxirgi imkoniyatni boy bermang!`,
                    bot.telegram.sendMessage.bind(bot.telegram),
                    { parse_mode: "Markdown", ...keyboard }
                );
            }
        }

        // Tugagan/faol bo'lmagan auksionlarni "xabar berilganlar" ro'yxatidan tozalash
        for (const id of notifiedEndingSoon) {
            if (!activeIds.has(id)) notifiedEndingSoon.delete(id);
        }
    }, 15_000);

    // ── 🏷 Auksionlar ────────────────────────────────────────────────────────
    bot.hears([TEXTS.uz.auctions, TEXTS.ru.auctions], async (ctx) => {
        if (isAdmin(ctx)) return;
        const user = getUser(ctx.from.id);
        if (!user) return ctx.reply("⚠️ Avval /start bosing.");
        if (user.blocked) return ctx.reply(T(user, "blocked"));
        await showAuctionsFiltered(ctx, user, false);
    });

    bot.action("back_to_auctions", async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (!user) { try { return await ctx.editMessageText("😔 Auksion yo'q."); } catch { return ctx.reply("😔 Auksion yo'q."); } }
        try { await showAuctionsFiltered(ctx, user, true); }
        catch { await showAuctionsFiltered(ctx, user, false); }
    });

    bot.action("auc_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^auc_page_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (!user) return;
        getAuctionFilter(user.id).page = Number(ctx.match[1]);
        await showAuctionsFiltered(ctx, user, true);
    });

    // ── 🎛 Auksion filtri ────────────────────────────────────────────────────
    bot.action("auc_filter_menu", async (ctx) => {
        await ctx.answerCbQuery();
        const f = getAuctionFilter(ctx.from.id);
        try { await ctx.editMessageText("🎛 *Filtr sozlamalari:*", { parse_mode: "Markdown", ...filterMenuKeyboard(f) }); } catch {}
    });

    bot.action("auc_status_active", async (ctx) => {
        await ctx.answerCbQuery();
        const f = getAuctionFilter(ctx.from.id); f.status = "active"; f.page = 0;
        try { await ctx.editMessageText("🎛 *Filtr sozlamalari:*", { parse_mode: "Markdown", ...filterMenuKeyboard(f) }); } catch {}
    });
    bot.action("auc_status_finished", async (ctx) => {
        await ctx.answerCbQuery();
        const f = getAuctionFilter(ctx.from.id); f.status = "finished"; f.page = 0;
        try { await ctx.editMessageText("🎛 *Filtr sozlamalari:*", { parse_mode: "Markdown", ...filterMenuKeyboard(f) }); } catch {}
    });
    bot.action(/^auc_cat_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const f = getAuctionFilter(ctx.from.id); f.cat = ctx.match[1]; f.page = 0;
        try { await ctx.editMessageText("🎛 *Filtr sozlamalari:*", { parse_mode: "Markdown", ...filterMenuKeyboard(f) }); } catch {}
    });
    bot.action(/^auc_wear_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const f = getAuctionFilter(ctx.from.id); f.wear = ctx.match[1]; f.page = 0;
        try { await ctx.editMessageText("🎛 *Filtr sozlamalari:*", { parse_mode: "Markdown", ...filterMenuKeyboard(f) }); } catch {}
    });
    bot.action("auc_price_prompt", async (ctx) => {
        await ctx.answerCbQuery();
        pendingPriceFilter[ctx.from.id] = true;
        try {
            await ctx.editMessageText(
                `💰 *Narx oralig'ini kiriting:*\n\nMisol: \`100000-500000\` (100 000 dan 500 000 gacha)\nFaqat minimal: \`100000-\`\nFaqat maksimal: \`-500000\`\nO'chirish uchun: \`0\``,
                { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor", "auc_filter_menu")]]) }
            );
        } catch {}
    });
    bot.action("auc_filter_clear", async (ctx) => {
        await ctx.answerCbQuery();
        auctionFilters[ctx.from.id] = { status: "active", cat: "all", wear: "all", minPrice: null, maxPrice: null, page: 0 };
        try { await ctx.editMessageText("🎛 *Filtr sozlamalari:*", { parse_mode: "Markdown", ...filterMenuKeyboard(getAuctionFilter(ctx.from.id)) }); } catch {}
    });
    bot.action("auc_filter_apply", async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (user) await showAuctionsFiltered(ctx, user, true);
    });
    bot.action("auc_filter_back", async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (user) await showAuctionsFiltered(ctx, user, true);
    });

    // ── 📦 Lot detail ────────────────────────────────────────────────────────
    bot.action(/^lot_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery("🔄 Yangilandi!");
        const lotId = Number(ctx.match[1]);
        const lot   = read("auctions").find(a => a.id === lotId);
        if (!lot) { try { return await ctx.editMessageText("❌ Topilmadi.", Markup.inlineKeyboard([[Markup.button.callback("⬅️", "back_to_auctions")]])); } catch {} return; }

        if (lot.status !== "active") {
            const msg = lot.status === "finished"
                ? `🏁 *${lot.name}*\n\n⛔ Bu auksion tugagan.\n💰 Yakuniy narx: *${lot.price.toLocaleString()} so'm*\n🏆 G'olib: ${lot.lastBidderName ?? "Yo'q"}`
                : `⛔ *${lot.name}*\n\nBu auksion bekor qilingan.`;
            try { return await ctx.editMessageText(msg, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Auksionlarga", "back_to_auctions")]]) }); } catch {} return;
        }
        if (lot.endTime && Date.now() >= new Date(lot.endTime).getTime()) {
            const aucs = read("auctions"); const a2 = aucs.find(x => x.id === lotId);
            if (a2) { a2.status = "finished"; write("auctions", aucs); }
            try { return await ctx.editMessageText(`⏰ *"${lot.name}"* tugadi!\n🏆 G'olib: ${lot.lastBidderName??"Yo'q"}\n💰 ${lot.price.toLocaleString()} so'm`, { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Auksionlarga","back_to_auctions")]])}); } catch {} return;
        }

        const minNext = lot.price + (lot.minBid ?? 1000);
        const tl      = timeLeft(lot.endTime);
        const userId  = ctx.from.id;
        const isWatching = (watchingLots[userId] || new Set()).has(lotId);

        const caption =
            `📦 *${lot.name}*\n\n` +
            `💰 Joriy narx: *${lot.price.toLocaleString()} so'm*\n` +
            `📈 Minimal bid: *${minNext.toLocaleString()} so'm*\n` +
            `👤 Oxirgi bidchi: ${lot.lastBidderName ?? "Hali yo'q"}\n` +
            `${tl ? tl + "\n" : ""}` +
            `\n💸 Bid qo'yish uchun tugmani bosing:`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback("💸 BID qilish", `bid_${lot.id}`), Markup.button.callback(`⚡ Tez bid (+${(lot.minBid??1000).toLocaleString()})`, `quickbid_${lot.id}`)],
            [Markup.button.callback(isWatching ? "🔕 Kuzatishni to'xtatish" : "🔔 Kuzatish", `watch_${lot.id}`), Markup.button.callback("🔄 Yangilash", `lot_${lot.id}`)],
            [Markup.button.callback("⬅️ Auksionlarga", "back_to_auctions")],
        ]);

        if (lot.image) {
            try {
                await ctx.editMessageCaption(caption, { parse_mode: "Markdown", ...keyboard });
                if (global.trackLotMessage) global.trackLotMessage(lot.id, ctx.chat.id, ctx.callbackQuery.message.message_id);
                return;
            } catch {}
        }
        try {
            await ctx.editMessageText(caption, { parse_mode: "Markdown", ...keyboard });
            if (global.trackLotMessage) global.trackLotMessage(lot.id, ctx.chat.id, ctx.callbackQuery.message.message_id);
        } catch {}
    });

    // ── ⚡ Tez bid ────────────────────────────────────────────────────────────
    bot.action(/^quickbid_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (isAdmin(ctx)) return;
        const userId = ctx.from.id;
        // Mini-app (Vercel) alohida jarayon — o'sha yerda qo'yilgan bid shu
        // botning xotiradagi keshida hali ko'rinmagan bo'lishi mumkin. Pul bilan
        // bog'liq bo'lgani uchun yozishdan oldin har doim Mongo'dan qayta o'qiymiz.
        await Promise.all([refresh("auctions"), refresh("users")]).catch(() => {});
        const user   = getUser(userId);
        if (!user) return;
        const lotId  = Number(ctx.match[1]);
        const preLot = read("auctions").find(a => a.id === lotId);
        if (!preLot || preLot.status !== "active") return ctx.answerCbQuery("❌ Auksion yopilgan!", true);
        if (preLot.endTime && Date.now() >= new Date(preLot.endTime).getTime()) return ctx.answerCbQuery("⏰ Vaqt tugadi!", true);

        // Haqiqiy narx/balans tekshiruvi va yozish BITTA Mongo tranzaksiyasida
        // (bidManager.js) — sayt bilan bir vaqtda bid kelsa ham hech biri
        // yo'qolib qolmaydi.
        const result = await bidManager.placeBid({
            lotId, userId, userName: user?.name ?? ctx.from.first_name, mode: "quick",
            getAmount: (lot, minNext) => minNext,
        });

        if (result.error === "insufficient_balance") {
            return ctx.reply(
                `❌ *Balansingiz yetarli emas!*\n\n💰 Balansingiz: *${(result.balance??0).toLocaleString()} so'm*\n📈 Kerak: *${result.needed.toLocaleString()} so'm*`,
                { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("💰 Balans to'ldirish", "go_to_balance")]]) }
            );
        }
        if (result.error === "time_up") return ctx.answerCbQuery("⏰ Vaqt tugadi!", true);
        if (result.error) return ctx.answerCbQuery("❌ Auksion yopilgan!", true);

        const { lot, amount, outbidUser } = result;
        if (outbidUser) {
            notifyUser(outbidUser.id,
                `🔄 *Siz endi yetakchi emassiz!*\n\n📦 ${lot.name}\n💰 Yangi narx: *${amount.toLocaleString()} so'm*\n👤 Yangi yetakchi: ${user?.name ?? ctx.from.first_name}\n\n💳 *${result.prevPrice.toLocaleString()} so'm* balansingizga qaytarildi.`,
                bot.telegram.sendMessage.bind(bot.telegram),
                process.env.WEBAPP_URL
                    ? { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.webApp("📦 Auksionni ko'rish", `${process.env.WEBAPP_URL}/?lot=${lot.id}`)]]) }
                    : { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("📦 Ko'rish", `lot_${lot.id}`)]]) }
            );
        }

        await ctx.answerCbQuery(`✅ Tez bid: ${amount.toLocaleString()} so'm!`, true);

        // Lot ni yangilash
        const tl = timeLeft(lot.endTime);
        const minNext2 = lot.price + (lot.minBid ?? 1000);
        const newCaption =
            `📦 *${lot.name}*\n\n💰 Joriy narx: *${lot.price.toLocaleString()} so'm*\n📈 Minimal bid: *${minNext2.toLocaleString()} so'm*\n👤 Oxirgi bidchi: ${lot.lastBidderName}\n${tl ? tl+"\n" : ""}\n💸 Bid qo'yish uchun tugmani bosing:`;
        const newKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback("💸 BID qilish", `bid_${lot.id}`), Markup.button.callback(`⚡ Tez bid (+${(lot.minBid??1000).toLocaleString()})`, `quickbid_${lot.id}`)],
            [Markup.button.callback("🔔 Kuzatish", `watch_${lot.id}`), Markup.button.callback("🔄 Yangilash", `lot_${lot.id}`)],
            [Markup.button.callback("⬅️ Auksionlarga", "back_to_auctions")],
        ]);
        if (lot.image) ctx.editMessageCaption(newCaption, { parse_mode:"Markdown", ...newKeyboard }).catch(() => {});
        else ctx.editMessageText(newCaption, { parse_mode:"Markdown", ...newKeyboard }).catch(() => {});

        // Adminga xabar
        bot.telegram.sendMessage(Number(process.env.ADMIN_ID),
            `⚡ *TEZ BID!*\n\n📦 *${lot.name}*\n💰 *${amount.toLocaleString()} so'm*\n👤 ${user?.name}\n🪪 \`${userId}\`\n🔗 ${getUser(userId)?.tradeLink??"Yo'q"}`,
            { parse_mode:"Markdown" }
        ).catch(() => {});
    });

    // ── 🔔 Kuzatish ──────────────────────────────────────────────────────────
    bot.action(/^watch_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (isAdmin(ctx)) return;
        const userId = ctx.from.id;
        const lotId  = Number(ctx.match[1]);
        if (!watchingLots[userId]) watchingLots[userId] = new Set();
        const isWatching = watchingLots[userId].has(lotId);
        if (isWatching) {
            watchingLots[userId].delete(lotId);
            ctx.answerCbQuery("🔕 Kuzatish to'xtatildi", true);
        } else {
            watchingLots[userId].add(lotId);
            ctx.answerCbQuery("🔔 Kuzatish yoqildi! Yangi bid bo'lsa xabar olasiz.", true);
        }
    });

    // ── 💸 BID tugmasi ───────────────────────────────────────────────────────
    bot.action(/^bid_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (isAdmin(ctx)) return;
        const userId = ctx.from.id;
        const user   = getUser(userId);
        if (!user) return ctx.reply("⚠️ Avval /start bosing.");
        if (user.blocked) return ctx.reply(T(user, "blocked"));
        const lotId = Number(ctx.match[1]);
        const lot   = read("auctions").find(a => a.id === lotId);
        if (!lot || lot.status !== "active") return ctx.reply("❌ Auksion yopilgan.");
        if (lot.endTime && Date.now() >= new Date(lot.endTime).getTime()) {
            const aucs = read("auctions"); const a2 = aucs.find(x => x.id === lotId);
            if (a2) { a2.status = "finished"; write("auctions", aucs); }
            return ctx.reply("⏰ *Vaqt tugadi!*", { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Auksionlarga","back_to_auctions")]]) });
        }
        const minNext = lot.price + (lot.minBid ?? 1000);
        if ((user.balance ?? 0) < minNext) {
            return ctx.reply(
                `❌ *Balansingiz yetarli emas!*\n\n💰 Balansingiz: *${(user.balance??0).toLocaleString()} so'm*\n📈 Minimal bid: *${minNext.toLocaleString()} so'm*`,
                { parse_mode:"Markdown", ...Markup.inlineKeyboard([
                    [Markup.button.callback("💰 Balans to'ldirish","go_to_balance")],
                    [Markup.button.callback("⬅️ Orqaga", `lot_${lotId}`)],
                ])}
            );
        }
        pendingBid[userId] = lotId;
        ctx.reply(
            `💸 *Stavka miqdorini kiriting:*\n\n📦 ${lot.name}\n💰 Joriy: *${lot.price.toLocaleString()} so'm*\n📈 Minimal: *${minNext.toLocaleString()} so'm*\n💳 Balansingiz: *${(user.balance??0).toLocaleString()} so'm*\n\n👇 Summani yozing:`,
            { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor", `cancel_bid_${lotId}`)]])}
        );
    });

    bot.action(/^cancel_bid_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        delete pendingBid[ctx.from.id];
        ctx.editMessageText("❌ Bid bekor qilindi.", Markup.inlineKeyboard([[Markup.button.callback("⬅️ Auksionni ko'rish", `lot_${Number(ctx.match[1])}`)]]) );
    });

    bot.action("go_to_balance", async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (user) await showBalance(ctx, user, true);
    });

    // ── 🏆 Liderlar jadvali ──────────────────────────────────────────────────
    bot.action("leaderboard", async (ctx) => {
        await ctx.answerCbQuery();
        const users = readUsers().filter(u => (u.wins||[]).length > 0)
            .sort((a, b) => (b.wins||[]).length - (a.wins||[]).length)
            .slice(0, 10);
        if (!users.length) {
            return ctx.editMessageText("🏆 *Liderlar jadvali*\n\n📭 Hozircha hech kim yutmagan.", { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga","back_to_auctions")]]) });
        }
        const medals = ["🥇","🥈","🥉","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
        let text = `🏆 *Liderlar jadvali (Top-10)*\n\n`;
        users.forEach((u, i) => {
            text += `${medals[i]} *${u.name}* — ${(u.wins||[]).length} ta yutish ${vipBadge(u)}\n`;
        });
        ctx.editMessageText(text, { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Auksionlarga","back_to_auctions")]]) });
    });

    // ── 👤 Profil ────────────────────────────────────────────────────────────
    bot.hears([TEXTS.uz.profile, TEXTS.ru.profile], async (ctx) => {
        if (isAdmin(ctx)) return;
        const user = getUser(ctx.from.id);
        if (!user) return ctx.reply("⚠️ Avval /start bosing.");
        if (user.blocked) return ctx.reply(T(user, "blocked"));
        await showProfile(ctx, user, false);
    });

    bot.action("back_to_profile", async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (user) await showProfile(ctx, user, true);
    });

    // ── 🌐 Til ───────────────────────────────────────────────────────────────
    bot.action("change_lang", async (ctx) => {
        await ctx.answerCbQuery();
        ctx.editMessageText("🌐 Tilni tanlang:", Markup.inlineKeyboard([
            [Markup.button.callback("🇺🇿 O'zbekcha","set_lang_uz"), Markup.button.callback("🇷🇺 Русский","set_lang_ru")],
            [Markup.button.callback("⬅️ Orqaga","back_to_profile")],
        ])).catch(() => {});
    });

    ["uz","ru"].forEach(lang => {
        bot.action(`set_lang_${lang}`, async (ctx) => {
            await ctx.answerCbQuery();
            const raw = read("users"), arr = Array.isArray(raw)?raw:Object.values(raw);
            const u = arr.find(x => x.id === ctx.from.id);
            if (u) { u.lang = lang; write("users", arr); }
            await showProfile(ctx, getUser(ctx.from.id), true);
        });
    });

    // ── 📊 Bid tarixi ─────────────────────────────────────────────────────────
    bot.action("my_bid_history", async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        const bids = (read("bids")||[]).filter(b => b.userId === ctx.from.id).slice(-10).reverse();
        let text = `📊 *Bid tarixi (oxirgi 10)*\n\n`;
        if (!bids.length) text += "📭 Hali bid qilmagansiz.";
        else bids.forEach((b,i) => {
            text += `${i+1}. 📦 ${b.lotName??"-"}\n   💰 ${(b.amount??0).toLocaleString()} so'm\n   📅 ${b.date?new Date(b.date).toLocaleString("uz-UZ"):"-"}\n\n`;
        });
        ctx.editMessageText(text, { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Profilga","back_to_profile")]]) }).catch(() => {});
    });

    // ── 💰 Balans tarixi ──────────────────────────────────────────────────────
    bot.action("balance_history", async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        const hist = (user?.balanceHistory || []).slice(-10).reverse();
        let text = `💰 *Balans tarixi (oxirgi 10)*\n\n`;
        if (!hist.length) text += "📭 Balans tarixi yo'q.";
        else hist.forEach((h,i) => {
            const sign = h.amount > 0 ? "+" : "";
            text += `${i+1}. ${sign}${h.amount.toLocaleString()} so'm — ${h.reason??"-"}\n   📅 ${h.date?new Date(h.date).toLocaleString("uz-UZ"):"-"}\n\n`;
        });
        ctx.editMessageText(text, { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Profilga","back_to_profile")]]) }).catch(() => {});
    });

    // ── 👥 Referral ───────────────────────────────────────────────────────────
    bot.action("my_referral", async (ctx) => {
        await ctx.answerCbQuery();
        const user    = getUser(ctx.from.id);
        const botName = process.env.BOT_USERNAME || "botingiz";
        const link    = `https://t.me/${botName}?start=ref_${ctx.from.id}`;
        const refs    = (user?.referrals || []).length;
        ctx.editMessageText(
            `👥 *Referral tizim*\n\n` +
            `🔗 Sizning havolangiz:\n\`${link}\`\n\n` +
            `👤 Taklif qilgan do'stlar: *${refs} ta*\n` +
            `🎁 Har bir do'st uchun: *10,000 so'm* bonus\n\n` +
            `Do'stingiz shu havola orqali kirsa, ikkalangiz ham 10,000 so'm olasizlar!`,
            { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Profilga","back_to_profile")]]) }
        ).catch(() => {});
    });

    // ── 🎒 Inventar ──────────────────────────────────────────────────────────
    bot.hears([TEXTS.uz.inventory, TEXTS.ru.inventory], async (ctx) => {
        if (!FEATURES.inventory) return;
        if (isAdmin(ctx)) return;
        const user = getUser(ctx.from.id);
        if (!user) return ctx.reply("⚠️ Avval /start bosing.");
        if (user.blocked) return ctx.reply(T(user, "blocked"));
        await showInventory(ctx, user, false);
    });

    bot.action("my_inventory", async (ctx) => {
        await ctx.answerCbQuery();
        const user = getUser(ctx.from.id);
        if (user) await showInventory(ctx, user, true);
    });

    // ── 📤 Chiqarib olish ────────────────────────────────────────────────────
    bot.action(/^withdraw_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (isAdmin(ctx)) return;
        const userId = ctx.from.id, lotId = Number(ctx.match[1]);
        const user   = getUser(userId);
        if (!user) return;
        const win = (user.wins||[]).find(w => w.lotId === lotId && w.status !== "delivered");
        if (!win) return ctx.answerCbQuery("❌ Item topilmadi.", true);
        if (!user.tradeLink) {
            return ctx.editMessageText(`❌ *Trade Link yo'q!*\n\nSkinni olish uchun avval Trade Link qo'shing.`,
                { parse_mode:"Markdown", ...Markup.inlineKeyboard([
                    [Markup.button.callback("🔗 Trade Link qo'shish","add_trade_link_inv")],
                    [Markup.button.callback("⬅️ Inventarga","my_inventory")],
                ])}
            ).catch(() => {});
            return;
        }
        ctx.editMessageText(
            `📤 *Tasdiqlang:*\n\n🏷 *${win.lotName}*\n💰 ${(win.price??0).toLocaleString()} so'm\n🔗 \`${user.tradeLink}\`\n\n⚠️ 1 soat ichida yuboriladi.`,
            { parse_mode:"Markdown", ...Markup.inlineKeyboard([
                [Markup.button.callback("✅ Ha, chiqarish",`confirm_withdraw_${lotId}`)],
                [Markup.button.callback("⬅️ Inventarga","my_inventory")],
            ])}
        ).catch(() => {});
    });

    bot.action("add_trade_link_inv", async (ctx) => {
        await ctx.answerCbQuery();
        pendingTradeLink[ctx.from.id] = "inventory";
        ctx.editMessageText(`🔗 *Steam Trade Link yuboring:*\n\nMisol: \`https://steamcommunity.com/tradeoffer/new/?partner=...\``,
            { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor","my_inventory")]]) }
        ).catch(() => {});
    });

    bot.action(/^confirm_withdraw_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (isAdmin(ctx)) return;
        const userId = ctx.from.id, lotId = Number(ctx.match[1]);
        const raw = read("users"), arr = Array.isArray(raw)?raw:Object.values(raw);
        const user = arr.find(u => u.id === userId);
        if (!user) return;
        const win = (user.wins||[]).find(w => w.lotId === lotId && w.status !== "delivered");
        if (!win) return;
        win.status = "requested"; win.requestedAt = new Date().toISOString();
        delete win.rejectComment;
        write("users", arr);
        ctx.editMessageText(`✅ *So'rov yuborildi!*\n\n🏷 *${win.lotName}*\n🔗 \`${user.tradeLink}\`\n\n⏳ Admin 1 soat ichida yuboradi.`,
            { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🎒 Inventar","my_inventory")]]) }
        ).catch(() => {});
        bot.telegram.sendMessage(Number(process.env.ADMIN_ID),
            `📤 *SKIN CHIQARISH!*\n\n👤 *${user.name}*\n🪪 \`${userId}\`\n🏷 *${win.lotName}*\n💰 ${(win.price??0).toLocaleString()} so'm\n🔗 \`${user.tradeLink}\`\n⏰ ${new Date().toLocaleString("uz-UZ")}`,
            { parse_mode:"Markdown", ...Markup.inlineKeyboard([
                [Markup.button.callback("✅ Skin yuborildi",`skin_sent_${userId}_${lotId}`)],
                [Markup.button.callback("❌ Rad etish",`skin_reject_${userId}_${lotId}`)],
            ])}
        ).catch(console.error);
    });

    bot.action(/^skin_sent_(\d+)_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const userId = Number(ctx.match[1]), lotId = Number(ctx.match[2]);
        const raw = read("users"), arr = Array.isArray(raw)?raw:Object.values(raw);
        const user = arr.find(u => u.id === userId);
        if (!user) return ctx.reply("❌ User topilmadi.");
        const win = (user.wins||[]).find(w => w.lotId === lotId);
        if (!win) return ctx.reply("❌ Item topilmadi.");
        win.status = "delivered"; win.deliveredAt = new Date().toISOString();
        write("users", arr);
        ctx.editMessageText(`✅ *Yuborildi!*\n\n👤 ${user.name}\n🏷 ${win.lotName}`, { parse_mode:"Markdown" }).catch(() => {});
        notifyUser(user,
            `🎉 *Skin yuborildi! Qabul qilib oling!*\n\n🏷 *${win.lotName}*\n\nSteam ilovangizni oching va trade offerni qabul qiling!`,
            bot.telegram.sendMessage.bind(bot.telegram),
            process.env.WEBAPP_URL
                ? { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.webApp("🎒 Inventarga o'tish", `${process.env.WEBAPP_URL}/?page=inventory`)]]) }
                : { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🎒 Inventar","my_inventory")]]) }
        );
    });

    // Market xaridlari uchun skin_sent_'ning aynan bir xil nusxasi — faqat
    // user.wins o'rniga user.marketPurchases ustida ishlaydi (Task 10
    // post-review fix: admin fallback tugmalari avval hech narsaga bog'lanmagan edi).
    bot.action(/^mkt_skin_sent_(\d+)_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const userId = Number(ctx.match[1]), purchaseId = Number(ctx.match[2]);
        const raw = read("users"), arr = Array.isArray(raw)?raw:Object.values(raw);
        const user = arr.find(u => u.id === userId);
        if (!user) return ctx.reply("❌ User topilmadi.");
        const purchase = (user.marketPurchases||[]).find(p => p.lotId === purchaseId);
        if (!purchase) return ctx.reply("❌ Item topilmadi.");
        purchase.status = "delivered"; purchase.deliveredAt = new Date().toISOString();
        write("users", arr);
        ctx.editMessageText(`✅ *Yuborildi!*\n\n👤 ${user.name}\n🏷 ${purchase.lotName}`, { parse_mode:"Markdown" }).catch(() => {});
        notifyUser(user,
            `🎉 *Skin yuborildi! Qabul qilib oling!*\n\n🏷 *${purchase.lotName}*\n\nSteam ilovangizni oching va trade offerni qabul qiling!`,
            bot.telegram.sendMessage.bind(bot.telegram),
            process.env.WEBAPP_URL
                ? { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.webApp("🛒 Marketga o'tish", `${process.env.WEBAPP_URL}/?page=market`)]]) }
                : { parse_mode:"Markdown" }
        );
    });

    // ── 🔗 Trade Link ────────────────────────────────────────────────────────
    bot.action("add_trade_link", async (ctx) => {
        await ctx.answerCbQuery();
        if (isAdmin(ctx)) return;
        pendingTradeLink[ctx.from.id] = "profile";
        ctx.editMessageText(`🔗 *Steam Trade Link yuboring:*\n\nMisol: \`https://steamcommunity.com/tradeoffer/new/?partner=...\``,
            { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor","cancel_trade_link")]]) }
        ).catch(() => {});
    });

    bot.action("cancel_trade_link", async (ctx) => {
        await ctx.answerCbQuery();
        delete pendingTradeLink[ctx.from.id];
        const user = getUser(ctx.from.id);
        if (user) await showProfile(ctx, user, true);
    });

    // ── 💰 Balance ───────────────────────────────────────────────────────────
    bot.hears([TEXTS.uz.balance, TEXTS.ru.balance], async (ctx) => {
        if (isAdmin(ctx)) return;
        const user = getUser(ctx.from.id);
        if (!user) return ctx.reply("⚠️ Avval /start bosing.");
        if (user.blocked) return ctx.reply(T(user, "blocked"));
        await showBalance(ctx, user, false);
    });

    ["payme","click","paynet","uzumbank"].forEach(bank => {
        bot.action(`topup_${bank}`, async (ctx) => {
            await ctx.answerCbQuery();
            if (isAdmin(ctx) || !FEATURES.topup) return;
            const user = getUser(ctx.from.id);
            if (!user) return;
            const info = getPaymentCards()[bank];
            pendingTopup[ctx.from.id] = { bank, step: "amount" };
            ctx.editMessageText(
                `${info.emoji} *${info.name}* orqali to'ldirish\n\n💳 Karta:\n\`${info.card}\`\n👤 *${info.owner}*\n\n📌 Kartaga pul o'tkazing, so'ng summani yozing:`,
                { parse_mode:"Markdown", ...Markup.inlineKeyboard([
                    [Markup.button.callback("⬅️ Orqaga","back_to_balance")],
                    [Markup.button.callback("❌ Bekor","cancel_topup")],
                ])}
            ).catch(() => {});
        });
    });

    bot.action("back_to_balance", async (ctx) => {
        await ctx.answerCbQuery();
        delete pendingTopup[ctx.from.id];
        const user = getUser(ctx.from.id);
        if (user) await showBalance(ctx, user, true);
    });

    bot.action("cancel_topup", async (ctx) => {
        await ctx.answerCbQuery();
        delete pendingTopup[ctx.from.id];
        ctx.editMessageText("❌ To'lov bekor qilindi.", Markup.inlineKeyboard([[Markup.button.callback("💰 Balansga","go_to_balance")]])).catch(() => {});
    });

    // ── Promo ─────────────────────────────────────────────────────────────────
    bot.action("enter_promo", async (ctx) => {
        await ctx.answerCbQuery();
        if (isAdmin(ctx)) return;
        const topup = pendingTopup[ctx.from.id];
        if (!topup?.amount) return;
        topup.step = "promo";
        ctx.editMessageText(
            `🎟 *Promo kodingizni kiriting:*\n\n💰 Depozit: *${topup.amount.toLocaleString()} so'm*\n🎁 Kod bonus foizini beradi (kodga qarab turlicha).`,
            { parse_mode:"Markdown", ...Markup.inlineKeyboard([
                [Markup.button.callback("⏭ Promocodsiz davom","skip_promo")],
                [Markup.button.callback("❌ Bekor","cancel_topup")],
            ])}
        ).catch(() => {});
    });

    bot.action("skip_promo", async (ctx) => {
        await ctx.answerCbQuery();
        const topup = pendingTopup[ctx.from.id];
        if (!topup) return;
        topup.step = "check"; topup.promoCode = null;
        ctx.editMessageText(
            `✅ *${topup.amount.toLocaleString()} so'm*\n\n📸 Endi to'lov *chekini* yuboring:`,
            { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor","cancel_topup")]])}
        ).catch(() => {});
    });

    // ── TEXT handler ─────────────────────────────────────────────────────────
    bot.on("text", async (ctx, next) => {
        if (isAdmin(ctx)) return next();
        if (ctx.message.text.startsWith("/")) return next();
        const userId = ctx.from.id;
        const text   = ctx.message.text.trim();
        const menuBtns = [...Object.values(TEXTS.uz),...Object.values(TEXTS.ru)].filter(v => typeof v === "string");
        if (menuBtns.includes(text)) return next();

        // 1. Trade Link
        if (pendingTradeLink[userId]) {
            const from = pendingTradeLink[userId];
            delete pendingTradeLink[userId];
            if (!text.startsWith("https://steamcommunity.com/tradeoffer/new/")) {
                return ctx.reply(`❌ *Noto'g'ri link!*\nFormat: \`https://steamcommunity.com/tradeoffer/new/?partner=...\``,
                    { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Qayta","add_trade_link")]])}
                );
            }
            const raw = read("users"), arr = Array.isArray(raw)?raw:Object.values(raw);
            const u = arr.find(x => x.id === userId);
            if (u) { u.tradeLink = text; write("users", arr); }
            return ctx.reply(`✅ *Trade Link saqlandi!*`,
                { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback(from==="inventory"?"🎒 Inventarga":"⬅️ Profilga", from==="inventory"?"my_inventory":"back_to_profile")]])}
            );
        }

        // 1b. Auksion narx-filtri
        if (pendingPriceFilter[userId]) {
            delete pendingPriceFilter[userId];
            const f = getAuctionFilter(userId);
            const raw = text.replace(/\s/g, "");
            if (raw === "0" || raw === "-") {
                f.minPrice = null; f.maxPrice = null;
            } else {
                const [rawMin, rawMax] = raw.split("-");
                const min = rawMin ? Number(rawMin.replace(/[^\d]/g, "")) : null;
                const max = rawMax ? Number(rawMax.replace(/[^\d]/g, "")) : null;
                f.minPrice = min && !isNaN(min) && min > 0 ? min : null;
                f.maxPrice = max && !isNaN(max) && max > 0 ? max : null;
            }
            f.page = 0;
            return ctx.reply("🎛 *Filtr sozlamalari:*", { parse_mode: "Markdown", ...filterMenuKeyboard(f) });
        }

        const topup = pendingTopup[userId];

        // 2. promo_ask step
        if (topup?.step === "promo_ask") {
            return ctx.reply("⬆️ Yuqoridagi tugmalardan birini tanlang:", Markup.inlineKeyboard([
                [Markup.button.callback("🎟 Promo kod","enter_promo")],
                [Markup.button.callback("⏭ Promocodsiz davom","skip_promo")],
                [Markup.button.callback("❌ Bekor","cancel_topup")],
            ]));
        }

        // 3. Promo kod
        if (topup?.step === "promo") {
            const code = text.toUpperCase().trim();
            const promo = checkPromo(code);
            // "trade" turidagi promo kodlar Obmen uchun (fee waiver), bu yerda
            // (balans depoziti) qabul qilinmaydi — eski (type maydonisiz)
            // kodlar "balance" deb hisoblanadi (backward-compat).
            if (!promo || promo.type === "trade") return ctx.reply(`❌ *Promo kod topilmadi!*`,
                { parse_mode:"Markdown", ...Markup.inlineKeyboard([
                    [Markup.button.callback("🔄 Qayta","enter_promo")],
                    [Markup.button.callback("⏭ Promocodsiz","skip_promo")],
                ])}
            );
            if (promoLimitReached(promo, userId)) return ctx.reply(`❌ *Bu kodni allaqachon ishlatgansiz!*`,
                { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⏭ Promocodsiz","skip_promo")]])}
            );

            // Kodni shu yerdayoq "ishlatilgan" deb belgilaymiz (admin tasdiqlashini
            // kutmasdan) — aks holda foydalanuvchi so'rovi hali tasdiqlanmagan
            // paytda bir xil kodni yana bir necha marta kiritib qo'yishi mumkin edi.
            await refresh("promos").catch(() => {});
            const promos = read("promos") || [];
            const p = promos.find(x => x.code === code);
            if (!p || p.type === "trade" || !p.active || promoLimitReached(p, userId)) {
                return ctx.reply(`❌ *Bu promo kod endi amal qilmaydi!*`,
                    { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⏭ Promocodsiz","skip_promo")]])}
                );
            }
            if (!p.usedBy) p.usedBy = [];
            p.usedBy.push(userId);
            p.usedCount = (p.usedCount ?? 0) + 1;
            if (p.maxUse && p.usedCount >= p.maxUse) p.active = false;
            write("promos", promos);

            topup.promoCode = code;
            topup.promoBonus = Math.floor(topup.amount * ((p.bonus ?? 15) / 100));
            topup.step = "check";
            return ctx.reply(
                `✅ *Promo kod qabul qilindi!*\n\n🎟 \`${code}\`\n💰 Depozit: *${topup.amount.toLocaleString()} so'm*\n🎁 Bonus: *+${topup.promoBonus.toLocaleString()} so'm*\n💳 Jami: *${(topup.amount+topup.promoBonus).toLocaleString()} so'm*\n\n📸 Endi chekni yuboring:`,
                { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor","cancel_topup")]])}
            );
        }

        // 4. TOPUP summa
        if (topup?.step === "amount") {
            const amount = Number(text.replace(/\s/g,"").replace(/,/g,""));
            if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Faqat musbat raqam kiriting:");
            topup.amount = amount; topup.step = "promo_ask";
            return ctx.reply(
                `✅ *${amount.toLocaleString()} so'm* qabul qilindi!\n\n🎟 *Promo kodingiz bormi?*\nKiritsangiz qo'shimcha bonus olishingiz mumkin!`,
                { parse_mode:"Markdown", ...Markup.inlineKeyboard([
                    [Markup.button.callback("🎟 Promo kod kiritish","enter_promo")],
                    [Markup.button.callback("⏭ Promocodsiz davom","skip_promo")],
                    [Markup.button.callback("❌ Bekor","cancel_topup")],
                ])}
            );
        }

        // 5. BID summa
        if (!pendingBid[userId]) return next();
        const lotId  = pendingBid[userId];
        const amount = Number(text.replace(/\s/g,"").replace(/,/g,""));
        if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Faqat musbat raqam kiriting!");

        // Mini-app (Vercel) alohida jarayon — pul bilan bog'liq bo'lgani uchun
        // yozishdan oldin har doim Mongo'dan qayta o'qiymiz (server.js bilan bir xil).
        await Promise.all([refresh("auctions"), refresh("users")]).catch(() => {});
        const user = getUser(userId);
        const preLot = read("auctions").find(a => a.id === lotId);
        if (!preLot || preLot.status !== "active") {
            delete pendingBid[userId];
            return ctx.reply("❌ Auksion yopilgan.", Markup.inlineKeyboard([[Markup.button.callback("⬅️","back_to_auctions")]]));
        }

        // Haqiqiy narx/balans tekshiruvi va yozish BITTA Mongo tranzaksiyasida
        // (bidManager.js) — sayt bilan bir vaqtda bid kelsa ham hech biri
        // yo'qolib qolmaydi.
        const result = await bidManager.placeBid({
            lotId, userId, userName: user?.name ?? ctx.from.first_name, mode: "full",
            getAmount: () => amount,
        });

        if (result.error === "time_up") {
            delete pendingBid[userId];
            return ctx.reply("⏰ *Vaqt tugadi! Bid qabul qilinmadi.*", { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️","back_to_auctions")]]) });
        }
        if (result.error === "lot_closed") {
            delete pendingBid[userId];
            return ctx.reply("❌ Auksion yopilgan.", Markup.inlineKeyboard([[Markup.button.callback("⬅️","back_to_auctions")]]));
        }
        if (result.error === "too_low") return ctx.reply(
            `❌ *Bid kam!*\n\n📈 Minimal: *${result.minBid.toLocaleString()}*\n🔢 Siz: *${amount.toLocaleString()}*`,
            { parse_mode:"Markdown" }
        );
        if (result.error === "insufficient_balance") return ctx.reply(
            `❌ *Balansingiz yetarli emas!*\n\n💰 Balansingiz: *${(result.balance??0).toLocaleString()}*\n💸 Kerak: *${result.needed.toLocaleString()}*`,
            { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("💰 Balans to'ldirish","go_to_balance"), Markup.button.callback("⬅️",`lot_${lotId}`)]])}
        );

        const { lot, outbidUser } = result;
        delete pendingBid[userId];

        if (outbidUser) {
            notifyUser(outbidUser.id,
                `🔄 *Siz endi yetakchi emassiz!*\n\n📦 ${lot.name}\n💰 Yangi narx: *${amount.toLocaleString()} so'm*\n👤 Yangi yetakchi: ${user?.name??ctx.from.first_name}\n\n💳 *${result.prevPrice.toLocaleString()} so'm* balansingizga qaytarildi.`,
                bot.telegram.sendMessage.bind(bot.telegram),
                process.env.WEBAPP_URL
                    ? { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.webApp("📦 Auksionni ko'rish", `${process.env.WEBAPP_URL}/?lot=${lotId}`)]])}
                    : { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("📦 Ko'rish",`lot_${lotId}`)]])}
            );
        }

        // Kuzatuvchilarga xabar
        for (const [wUserId, wLots] of Object.entries(watchingLots)) {
            if (Number(wUserId) === userId) continue;
            if (!wLots.has(lotId)) continue;
            notifyUser(Number(wUserId),
                `🔔 *Kuzatayotgan auksioningizda yangi bid!*\n\n📦 ${lot.name}\n💰 *${amount.toLocaleString()} so'm*\n👤 ${user?.name??ctx.from.first_name}`,
                bot.telegram.sendMessage.bind(bot.telegram),
                { parse_mode:"Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("📦 Ko'rish",`lot_${lotId}`)]])}
            );
        }

        await ctx.reply(
            `✅ *BID qabul qilindi!*\n\n📦 ${lot.name}\n💰 *${amount.toLocaleString()} so'm*\n💳 Qolgan balans: *${(result.newBalance??0).toLocaleString()} so'm*\n🏆 Hozircha siz yetakchisiz!`,
            { parse_mode:"Markdown", ...Markup.inlineKeyboard([
                [Markup.button.callback("📦 Auksionni ko'rish",`lot_${lotId}`)],
                [Markup.button.callback("⬅️ Barcha auksionlar","back_to_auctions")],
            ])}
        );

        // Adminga xabar
        bot.telegram.sendMessage(Number(process.env.ADMIN_ID),
            `🔥 *YANGI BID!*\n\n📦 *${lot.name}*\n💰 *${amount.toLocaleString()} so'm*\n👤 ${user?.name}\n🪪 \`${userId}\`\n🔗 ${getUser(userId)?.tradeLink??"Yo'q"}`,
            { parse_mode:"Markdown" }
        ).catch(() => {});
    });

    // ── 📸 Chek ───────────────────────────────────────────────────────────────
    bot.on("photo", async (ctx, next) => {
        if (isAdmin(ctx)) return next();
        const userId = ctx.from.id;
        const topup  = pendingTopup[userId];
        if (!topup || topup.step !== "check") return next();
        const user     = getUser(userId);
        const bankInfo = getPaymentCards()[topup.bank] || { emoji:"💳", name:"Noma'lum" };
        const fileId   = ctx.message.photo[ctx.message.photo.length-1].file_id;
        const reqId    = Date.now().toString().slice(-6);
        delete pendingTopup[userId];
        await ctx.reply(
            `✅ *Chek qabul qilindi!*\n\n💰 *${topup.amount.toLocaleString()} so'm*\n${topup.promoCode ? `🎟 Promo: \`${topup.promoCode}\` (+${(topup.promoBonus??0).toLocaleString()} so'm)\n` : ""}💳 ${bankInfo.emoji} ${bankInfo.name}\n🔖 №\`${reqId}\`\n\n⏳ Admin 5 daqiqa ichida tasdiqlaydi.`,
            { parse_mode:"Markdown" }
        );
        bot.telegram.sendPhoto(Number(process.env.ADMIN_ID), fileId, {
            caption:
                `💸 *Yangi to'lov so'rovi!*\n\n👤 *${user?.name??ctx.from.first_name}*\n🪪 \`${userId}\`\n` +
                `💰 Depozit: *${topup.amount.toLocaleString()} so'm*\n` +
                (topup.promoCode ? `🎟 Promo: \`${topup.promoCode}\` (+${(topup.promoBonus??0).toLocaleString()} so'm)\n💳 Jami: *${(topup.amount+(topup.promoBonus??0)).toLocaleString()} so'm*\n` : "") +
                `🏦 ${bankInfo.emoji} ${bankInfo.name}\n🔖 №\`${reqId}\``,
            parse_mode:"Markdown",
            ...Markup.inlineKeyboard([[
                Markup.button.callback("✅ Tasdiqlash", `approve_topup_${userId}_${topup.amount}_${topup.promoBonus??0}_${topup.promoCode??""}`),
                Markup.button.callback("❌ Rad etish",  `reject_topup_${userId}_${topup.promoCode??""}`),
            ]]),
        }).catch(console.error);
    });

    // ── ✅ To'lov tasdiqlash ──────────────────────────────────────────────────
    bot.action(/^approve_topup_(\d+)_(\d+)_?(\d*)_?(.*)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const userId = Number(ctx.match[1]), amount = Number(ctx.match[2]);
        // Promo kod so'rov yuborilgan (chek yuborilgan) paytdayoq "ishlatilgan"
        // deb belgilangan edi (1 kishi — 1 marta), shu sabab bu yerda faqat
        // hisoblangan bonusni qo'llaymiz, qayta tekshirish shart emas.
        const promoBonus = Number(ctx.match[3]||0), promoCode = ctx.match[4]||"";
        const totalAdd = amount + promoBonus;

        const raw = read("users"), arr = Array.isArray(raw)?raw:Object.values(raw);
        const u   = arr.find(x => x.id === userId);
        if (!u) return ctx.reply("❌ User topilmadi.");
        u.balance = (u.balance??0) + totalAdd;
        // Balans tarixi
        if (!u.balanceHistory) u.balanceHistory = [];
        u.balanceHistory.push({ amount: totalAdd, reason: promoCode ? `Depozit + promo (${promoCode})` : "Depozit", date: new Date().toISOString() });
        write("users", arr);

        // Admin statistikasidagi "jami tushgan pul" shu yerdan hisoblanadi — faqat
        // haqiqiy depozit summasi (bonus emas), chunki bonus real pul emas.
        const deposits = read("deposits") || [];
        deposits.push({ id: Date.now(), userId, userName: u.name, amount, date: new Date().toISOString() });
        write("deposits", deposits);
        ctx.editMessageCaption(
            `✅ *Tasdiqlandi!*\n\n👤 ${u.name}\n💰 +${amount.toLocaleString()} so'm${promoBonus?`\n🎟 Bonus: +${promoBonus.toLocaleString()} so'm`:""}\n💳 Jami: *+${totalAdd.toLocaleString()} so'm*\n💳 Yangi balans: *${u.balance.toLocaleString()} so'm*`,
            { parse_mode:"Markdown" }
        ).catch(() => ctx.reply(`✅ +${totalAdd.toLocaleString()} so'm qo'shildi!`));
        notifyUser(u,
            `✅ *To'lov tasdiqlandi!*\n\n💰 +${amount.toLocaleString()} so'm${promoBonus?`\n🎟 Promo bonus: +${promoBonus.toLocaleString()} so'm`:""}\n💳 Jami: *+${totalAdd.toLocaleString()} so'm*\n💳 Joriy balans: *${u.balance.toLocaleString()} so'm*`,
            bot.telegram.sendMessage.bind(bot.telegram),
            { parse_mode:"Markdown" }
        );
    });

    // ── ❌ To'lov rad etish ───────────────────────────────────────────────────
    bot.action(/^reject_topup_(\d+)_?(.*)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const userId    = Number(ctx.match[1]);
        const promoCode = ctx.match[2] || "";
        const u = readUsers().find(x => x.id === userId);

        // To'lov rad etilsa, kiritilgan promo kod ham foydalanuvchiga qaytariladi
        // (chunki bonus berilmadi — kodni "isrof qilmasin").
        if (promoCode) {
            const promos = read("promos") || [];
            const p = promos.find(x => x.code === promoCode);
            // `usedBy` endi takrorlanishi mumkin (perUserLimit > 1) — shu sabab
            // FAQAT bitta yozuvni olib tashlaymiz, hammasini emas (aks holda
            // shu userning avvalgi muvaffaqiyatli ishlatishlari ham bekor bo'lardi).
            const idx = (p?.usedBy || []).indexOf(userId);
            if (p && idx !== -1) {
                p.usedBy.splice(idx, 1);
                p.usedCount = Math.max(0, (p.usedCount ?? 0) - 1);
                if (p.maxUse && p.usedCount < p.maxUse) p.active = true;
                write("promos", promos);
            }
        }

        ctx.editMessageCaption(`❌ *Rad etildi!*\n👤 ${u?.name??userId}`, { parse_mode:"Markdown" }).catch(() => ctx.reply("❌ Rad etildi."));
        notifyUser(userId, `❌ *To'lovingiz rad etildi.*\n\nAdmin bilan bog'laning.`, bot.telegram.sendMessage.bind(bot.telegram), { parse_mode:"Markdown" });
    });

    // ── Referral orqali kirish (startHandler da chaqiriladi) ─────────────────
    module.exports.handleRef = async (bot, newUserId, refId) => {
        if (newUserId === refId) return;
        await refresh("settings").catch(() => {});
        const rawS = read("settings");
        const settings = Array.isArray(rawS) ? {} : rawS;
        const bonus = settings.referralBonus ?? 10000;

        const raw = read("users"), arr = Array.isArray(raw)?raw:Object.values(raw);
        const ref = arr.find(u => u.id === refId);
        const newU = arr.find(u => u.id === newUserId);
        if (!ref || !newU) return;
        if (!ref.referrals) ref.referrals = [];
        if (ref.referrals.includes(newUserId)) return;
        ref.referrals.push(newUserId);
        ref.balance = (ref.balance??0) + bonus;
        if (!ref.balanceHistory) ref.balanceHistory = [];
        ref.balanceHistory.push({ amount:bonus, reason:`Referral bonus (${newU.name})`, date:new Date().toISOString() });
        newU.balance = (newU.balance??0) + bonus;
        if (!newU.balanceHistory) newU.balanceHistory = [];
        newU.balanceHistory.push({ amount:bonus, reason:"Referral orqali kelgan bonus", date:new Date().toISOString() });
        write("users", arr);
        notifyUser(ref, `🎉 *${newU.name}* sizning havolangiz orqali keldi!\n💰 *+${bonus.toLocaleString()} so'm* balansingizga qo'shildi!`, bot.telegram.sendMessage.bind(bot.telegram), { parse_mode:"Markdown" });
        notifyUser(newU, `🎉 Referral orqali keldingiz!\n💰 *+${bonus.toLocaleString()} so'm* balansingizga qo'shildi!`, bot.telegram.sendMessage.bind(bot.telegram), { parse_mode:"Markdown" });
    };
};