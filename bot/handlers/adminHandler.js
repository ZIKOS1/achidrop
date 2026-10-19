const { Markup } = require("telegraf");
const { read, write } = require("../../backend/database/db");
const { finishAuction, cancelAuction } = require("../../backend/auctionLifecycle");
const { notifyUser, pushNotification } = require("../../backend/notify");
const balanceManager = require("../../backend/balanceManager");
const supportManager = require("../../backend/supportManager");

function readUsers() {
    const data = read("users");
    if (Array.isArray(data)) return data;
    return Object.values(data);
}

function safeUser(u) {
    return {
        id:       u.id,
        name:     u.name ?? String(u.id),
        lang:     u.lang ?? null,
        balance:  u.balance ?? 0,
        blocked:  u.blocked ?? false,
        history:  Array.isArray(u.history)  ? u.history  : [],
        wins:     Array.isArray(u.wins)     ? u.wins     : [],
        auctions: Array.isArray(u.auctions) ? u.auctions : [],
        tradeLink: u.tradeLink ?? null,
    };
}

const ADMIN_MAIN_MENU = Markup.keyboard([
    ["➕ Auction ochish", "📦 Auksionlar"],
    ["👥 Foydalanuvchilar", "📊 Statistika"],
    ["🔒 Muzlatilgan mablag'lar"],
]).resize();

const ADMIN_BTNS = {
    create: "➕ Auction ochish",
    list:   "📦 Auksionlar",
    users:  "👥 Foydalanuvchilar",
    stats:  "📊 Statistika",
    holds:  "🔒 Muzlatilgan mablag'lar",
};

const CANCEL_BTN = Markup.inlineKeyboard([
    [Markup.button.callback("❌ Bekor qilish", "cancel_create")],
]);

const temp     = {};
const editTemp = {};

// ── Auksionlar ro'yxati (qayta ishlatish uchun) ───────────────────────────────
function auctionListKeyboard(withBack = false) {
    const auctions = read("auctions");
    if (!auctions.length) {
        const btns = [[Markup.button.callback("➕ Yangi auction", "create_auction")]];
        if (withBack) btns.push([Markup.button.callback("⬅️ Admin Panel", "open_admin")]);
        return { text: "📭 Hozircha auction yo'q.", keyboard: Markup.inlineKeyboard(btns) };
    }
    const buttons = auctions.map(a => [
        Markup.button.callback(
            `${a.status === "active" ? "🟢" : a.status === "cancelled" ? "🚫" : "🔴"} ${a.name} | ${a.price.toLocaleString()} so'm`,
            `auction_${a.id}`
        ),
    ]);
    if (withBack) buttons.push([Markup.button.callback("⬅️ Admin Panel", "open_admin")]);
    return { text: "📦 *Barcha auksionlar:*", keyboard: Markup.inlineKeyboard(buttons) };
}

// ── User ro'yxati (qayta ishlatish uchun) ────────────────────────────────────
function userListKeyboard() {
    const users = readUsers().map(safeUser);
    if (!users.length) return { text: "👥 Hozircha user yo'q.", keyboard: null };
    const buttons = users.map(u => [
        Markup.button.callback(
            `${u.blocked ? "⛔" : "✅"} ${u.name} | 💰${u.balance.toLocaleString()}`,
            `user_${u.id}`
        ),
    ]);
    buttons.push([Markup.button.callback("⬅️ Admin Panel", "open_admin")]);
    return { text: "👥 *Foydalanuvchilar:*", keyboard: Markup.inlineKeyboard(buttons) };
}

// ── User detail xabari ────────────────────────────────────────────────────────
function userDetailText(u) {
    return (
        `👤 *${u.name}*\n` +
        `🪪 ID: \`${u.id}\`\n` +
        `💰 Balance: ${u.balance.toLocaleString()} so'm\n` +
        `🏆 Wins: ${u.wins.length}\n` +
        `🔗 Trade Link: ${u.tradeLink ?? "Yo'q"}\n` +
        `${u.blocked ? "⛔ Bloklangan" : "✅ Aktiv"}`
    );
}

function userDetailKeyboard(u) {
    return Markup.inlineKeyboard([
        [Markup.button.callback("💰 Balance", `bal_${u.id}`),   Markup.button.callback("📜 History", `hist_${u.id}`)],
        [Markup.button.callback("🏆 Wins",    `wins_${u.id}`),  Markup.button.callback(u.blocked ? "✅ Unlock" : "⛔ Block", `block_${u.id}`)],
        [Markup.button.callback("💵 Balans qo'shish", `addbal_${u.id}`)],
        [Markup.button.callback("⬅️ Foydalanuvchilarga", "back_to_users")],
    ]);
}

module.exports = (bot) => {
    const isAdmin = (ctx) => ctx.from.id === Number(process.env.ADMIN_ID);

    // ── /admin komandasi ──────────────────────────────────────────────────────
    bot.command("admin", (ctx) => {
        if (!isAdmin(ctx)) return ctx.reply("⛔ Siz admin emassiz.");
        ctx.reply("🛠 *Admin Panel*", { parse_mode: "Markdown", ...ADMIN_MAIN_MENU });
    });

    bot.action("open_admin", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        ctx.reply("🛠 *Admin Panel*", { parse_mode: "Markdown", ...ADMIN_MAIN_MENU });
    });

    // ── Bekor qilish ─────────────────────────────────────────────────────────
    bot.action("cancel_create", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        delete temp[ctx.from.id];
        delete editTemp[ctx.from.id];
        ctx.editMessageText("❌ Bekor qilindi.");
        ctx.reply("🛠 *Admin Panel*", { parse_mode: "Markdown", ...ADMIN_MAIN_MENU });
    });

    // ── 📦 Auksionlar ro'yxati ────────────────────────────────────────────────
    bot.hears(ADMIN_BTNS.list, async (ctx) => {
        if (!isAdmin(ctx)) return;
        const { text, keyboard } = auctionListKeyboard(false);
        ctx.reply(text, { parse_mode: "Markdown", ...keyboard });
    });

    // back_to_auctions — clientHandler da ro'yxatdan o'tgan

    // ── 👥 Foydalanuvchilar ───────────────────────────────────────────────────
    bot.hears(ADMIN_BTNS.users, async (ctx) => {
        if (!isAdmin(ctx)) return;
        const { text, keyboard } = userListKeyboard();
        ctx.reply(text, { parse_mode: "Markdown", ...(keyboard || {}) });
    });

    bot.action("back_to_users", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const { text, keyboard } = userListKeyboard();
        ctx.editMessageText(text, { parse_mode: "Markdown", ...(keyboard || {}) });
    });

    // ── 📊 Statistika ─────────────────────────────────────────────────────────
    bot.hears(ADMIN_BTNS.stats, async (ctx) => {
        if (!isAdmin(ctx)) return;
        const users    = readUsers();
        const auctions = read("auctions");
        const bids     = read("bids");
        const promos   = read("promos") || [];
        const active   = auctions.filter(a => a.status === "active").length;
        const finished = auctions.filter(a => a.status === "finished").length;
        const blocked  = users.filter(u => u.blocked).length;
        const activeP  = promos.filter(p => p.active).length;
        ctx.reply(
            `📊 *Statistika*\n\n` +
            `👥 Jami userlar: *${users.length}*\n` +
            `⛔ Bloklangan: *${blocked}*\n\n` +
            `📦 Jami auksionlar: *${auctions.length}*\n` +
            `🟢 Aktiv: *${active}*\n` +
            `🔴 Tugagan: *${finished}*\n\n` +
            `💸 Jami bidlar: *${bids.length}*\n\n` +
            `🎟 Promo kodlar: *${promos.length}* ta | Aktiv: *${activeP}* ta`,
            {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("🎟 Promo kodlarni boshqarish", "manage_promos")],
                ]),
            }
        );
    });

    // ── 🔒 Obmen — muzlatilgan mablag'lar ────────────────────────────────────
    bot.hears(ADMIN_BTNS.holds, async (ctx) => {
        if (!isAdmin(ctx)) return;
        const holds = balanceManager.getAllHoldsForAdmin();
        if (!holds.length) return ctx.reply("📭 Hozircha obmen orqali muzlatilgan mablag' yo'q.");
        const users = readUsers();
        const rows = holds.map(h => {
            const u = users.find(x => x.id === h.userId);
            return [Markup.button.callback(`👤 ${u?.name ?? h.userId} — 🧊 ${h.frozen.toLocaleString()} so'm`, `holds_user_${h.userId}`)];
        });
        ctx.reply("🔒 *Obmen — muzlatilgan mablag'lar*\n\nBatafsil ko'rish uchun userni tanlang:", { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
    });

    bot.action(/^holds_user_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const userId = Number(ctx.match[1]);
        const ledger = read("tradeBalances").find(l => l.userId === userId);
        const entries = (ledger?.entries || []).filter(e => e.withdrawalStatus !== "withdrawn" && e.withdrawalStatus !== "reversed");
        if (!entries.length) return ctx.editMessageText("📭 Bu userda faol yozuv yo'q.").catch(() => {});
        const rows = entries.map(e => [Markup.button.callback(
            `#${e.tradeId} — ${e.amount.toLocaleString()} so'm (${new Date(e.receivedAt).toLocaleDateString("uz-UZ")})`,
            `holds_entry_${userId}_${e.id}`
        )]);
        ctx.editMessageText(`👤 *User ${userId}* — faol yozuvlar:`, { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) }).catch(() => {});
    });

    bot.action(/^holds_entry_(\d+)_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const userId = Number(ctx.match[1]);
        const entryId = ctx.match[2];
        ctx.editMessageText(
            `⚠️ *#${entryId} yozuvini bekor qilasizmi?* Bu userning balansidan mos summa AYIRILADI.`,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([
                [Markup.button.callback("✅ Ha, bekor qilish", `holds_reverse_${userId}_${entryId}`)],
                [Markup.button.callback("❌ Yo'q", "holds_cancel")],
            ])}
        ).catch(() => {});
    });

    bot.action(/^holds_reverse_(\d+)_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const userId = Number(ctx.match[1]);
        const entryId = ctx.match[2];
        const result = await balanceManager.reverseTradeCreditEntry(userId, entryId, "Admin tomonidan bekor qilindi");
        if (result.error) {
            const errMsg = {
                not_found: "Yozuv topilmadi.",
                already_withdrawn: "Bu yozuv allaqachon kartaga chiqarilgan, bekor qilib bo'lmaydi.",
                already_reversed: "Bu yozuv allaqachon bekor qilingan.",
            }[result.error] || "Noma'lum xatolik.";
            return ctx.editMessageText(`❌ ${errMsg}`).catch(() => {});
        }
        ctx.editMessageText(`✅ Bekor qilindi. ${result.deducted.toLocaleString()} so'm balansdan ayirildi.`).catch(() => {});
        notifyUser(userId,
            `⚠️ *Diqqat!* Sizning oldingi Instant Sell/Obmen tranzaksiyangiz (#${result.entry.tradeId}) bekor qilindi, ${result.deducted.toLocaleString()} so'm balansingizdan ayirildi. Savol bo'lsa admin bilan bog'laning.`,
            bot.telegram.sendMessage.bind(bot.telegram), { parse_mode: "Markdown" }
        );
    });

    bot.action("holds_cancel", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        ctx.editMessageText("Bekor qilindi.").catch(() => {});
    });

    // ── 💸 Pul chiqarish so'rovini tasdiqlash/rad etish (Obmen) ──────────────
    bot.action(/^wd_approve_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const id = Number(ctx.match[1]);
        let result;
        try { result = await balanceManager.approveWithdrawal(id); }
        catch (err) { return ctx.reply("❌ Xatolik: " + err.message); }
        if (result.error) return ctx.reply("❌ So'rov topilmadi yoki allaqachon ko'rib chiqilgan.");
        const { request, user } = result;
        ctx.editMessageText(
            `✅ *Tasdiqlandi!*\n\n👤 ${user?.name ?? request.userId}\n💰 ${request.amount.toLocaleString()} so'm\n💳 \`${request.cardNumber}\``,
            { parse_mode: "Markdown" }
        ).catch(() => ctx.reply("✅ Tasdiqlandi."));
        notifyUser(request.userId,
            `✅ *Pul chiqarish so'rovingiz tasdiqlandi!*\n\n💰 ${request.amount.toLocaleString()} so'm kartangizga o'tkazildi.`,
            bot.telegram.sendMessage.bind(bot.telegram), { parse_mode: "Markdown" }
        );
    });

    bot.action(/^wd_reject_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const id = Number(ctx.match[1]);
        let result;
        try { result = await balanceManager.rejectWithdrawal(id, null); }
        catch (err) { return ctx.reply("❌ Xatolik: " + err.message); }
        if (result.error) return ctx.reply("❌ So'rov topilmadi yoki allaqachon ko'rib chiqilgan.");
        const { request } = result;
        ctx.editMessageText(`❌ *Rad etildi.*\n\n🪪 \`${request.userId}\``, { parse_mode: "Markdown" }).catch(() => ctx.reply("❌ Rad etildi."));
        notifyUser(request.userId,
            `❌ *Pul chiqarish so'rovingiz rad etildi.*\n\nAdmin bilan bog'laning.`,
            bot.telegram.sendMessage.bind(bot.telegram), { parse_mode: "Markdown" }
        );
    });

    // ── 🎟 Promo boshqaruv (Statistikadan kirish) ─────────────────────────────
    bot.action("manage_promos", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const promos = read("promos") || [];
        const active = promos.filter(p => p.active);
        ctx.editMessageText(
            `🎟 *Promo Kodlar*\n\nJami: *${promos.length}* ta | Aktiv: *${active.length}* ta\n\n` +
            `Foydalanuvchilarga *15%* bonus beradi.`,
            {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("➕ Yangi promo kod", "create_promo")],
                    [Markup.button.callback("📋 Barcha kodlar",   "list_promos")],
                ]),
            }
        );
    });

    // ── ➕ Auction ochish ─────────────────────────────────────────────────────
    bot.hears(ADMIN_BTNS.create, async (ctx) => {
        if (!isAdmin(ctx)) return;
        temp[ctx.from.id] = { step: "name" };
        ctx.reply("📦 *1/5* — Auction nomini yozing:", { parse_mode: "Markdown", ...CANCEL_BTN });
    });

    bot.action("create_auction", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        temp[ctx.from.id] = { step: "name" };
        ctx.editMessageText("📦 *1/5* — Auction nomini yozing:", { parse_mode: "Markdown", ...CANCEL_BTN });
    });

    // ── Auction detail ────────────────────────────────────────────────────────
    bot.action(/^auction_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const id = Number(ctx.match[1]);
        const a  = read("auctions").find(x => x.id === id);
        if (!a) return ctx.reply("❌ Topilmadi.");

        const statusText  = a.status === "active" ? "🟢 Aktiv" : a.status === "cancelled" ? "🚫 Bekor" : "🔴 Tugagan";
        const endTimeText = a.endTime ? new Date(a.endTime).toLocaleString("uz-UZ") : "Belgilanmagan";
        const lastBidText = a.lastBidderName
            ? `${a.lastBidderName} — ${a.price.toLocaleString()} so'm`
            : "Yo'q";

        const actionButtons = a.status === "active"
            ? [
                [Markup.button.callback("✏️ Tahrirlash", `edit_${a.id}`), Markup.button.callback("⛔ Tugatish", `finish_${a.id}`)],
                [Markup.button.callback("🚫 Bekor qilish", `cancel_auction_${a.id}`)],
                [Markup.button.callback("🗑 O'chirish", `delete_${a.id}`)],
                [Markup.button.callback("⬅️ Auksionlarga", "back_to_auctions")],
              ]
            : [
                [Markup.button.callback("🗑 O'chirish", `delete_${a.id}`)],
                [Markup.button.callback("⬅️ Auksionlarga", "back_to_auctions")],
              ];

        const text =
            `📦 *${a.name}*\n\n` +
            `💰 Joriy narx: ${a.price.toLocaleString()} so'm\n` +
            `📈 Min bid: ${(a.minBid ?? 1000).toLocaleString()} so'm\n` +
            `📊 Holat: ${statusText}\n` +
            `⏰ Tugash: ${endTimeText}\n` +
            `👤 Oxirgi bid: ${lastBidText}`;

        try {
            await ctx.editMessageText(text, { parse_mode: "Markdown", ...Markup.inlineKeyboard(actionButtons) });
        } catch {
            ctx.reply(text, { parse_mode: "Markdown", ...Markup.inlineKeyboard(actionButtons) });
        }
    });

    bot.action(/^edit_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        editTemp[ctx.from.id] = { id: Number(ctx.match[1]), step: "name" };
        ctx.editMessageText("✏️ Yangi nom yozing:", CANCEL_BTN);
    });

    bot.action(/^finish_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const id = Number(ctx.match[1]);
        const result = finishAuction(id);
        if (!result) return;
        const { auction: a, winner } = result;

        if (winner) {
            notifyUser(
                winner,
                `🏆 *Tabriklaymiz! "${a.name}" auksionini yutdingiz!*\n\n` +
                `💰 Yakuniy narx: ${a.price.toLocaleString()} so'm\n\n` +
                `🎒 Skinni olish uchun Inventarga o'ting.`,
                bot.telegram.sendMessage.bind(bot.telegram),
                process.env.WEBAPP_URL
                    ? { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.webApp("🎒 Inventarga o'tish", `${process.env.WEBAPP_URL}/?page=inventory`)]]) }
                    : { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🎒 Inventar", "my_inventory")]]) }
            );
        }

        ctx.editMessageText(
            `✅ *${a.name}* tugatildi.`,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Auksionlarga", "back_to_auctions")]]) }
        );
    });

    bot.action(/^cancel_auction_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const id = Number(ctx.match[1]);
        const a  = read("auctions").find(x => x.id === id);
        if (!a) return ctx.reply("❌ Topilmadi.");
        ctx.editMessageText(
            `🚫 *${a.name}* ni bekor qilmoqchimisiz?`,
            {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("✅ Ha, bekor qilish", `confirm_cancel_${id}`)],
                    [Markup.button.callback("⬅️ Orqaga", `auction_${id}`)],
                ]),
            }
        );
    });

    bot.action(/^confirm_cancel_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const id = Number(ctx.match[1]);
        const result = cancelAuction(id);
        if (!result) return ctx.reply("❌ Topilmadi.");
        const { auction: a, refunded } = result;

        if (refunded) {
            notifyUser(
                refunded,
                `🚫 *"${a.name}" auksioni bekor qilindi.*\n\n💳 *${a.price.toLocaleString()} so'm* balansingizga qaytarildi.`,
                bot.telegram.sendMessage.bind(bot.telegram),
                { parse_mode: "Markdown" }
            );
        }

        ctx.editMessageText(
            `🚫 *${a.name}* bekor qilindi.`,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Auksionlarga", "back_to_auctions")]]) }
        );
    });

    bot.action(/^delete_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const id = Number(ctx.match[1]);
        const a  = read("auctions").find(x => x.id === id);
        write("auctions", read("auctions").filter(x => x.id !== id));
        ctx.editMessageText(
            `🗑 *${a?.name ?? "Auction"}* o'chirildi.`,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Auksionlarga", "back_to_auctions")]]) }
        );
    });

    // ── User detail ───────────────────────────────────────────────────────────
    bot.action(/^user_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const id = Number(ctx.match[1]);
        const u  = readUsers().map(safeUser).find(x => x.id === id);
        if (!u) return ctx.reply("User topilmadi.");
        try {
            await ctx.editMessageText(userDetailText(u), { parse_mode: "Markdown", ...userDetailKeyboard(u) });
        } catch {
            ctx.reply(userDetailText(u), { parse_mode: "Markdown", ...userDetailKeyboard(u) });
        }
    });

    bot.action(/^bal_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const id = Number(ctx.match[1]);
        const u  = readUsers().map(safeUser).find(x => x.id === id);
        ctx.editMessageText(
            `💰 *Balance ma'lumoti*\n\n👤 ${u?.name}\n💰 Joriy balans: *${(u?.balance ?? 0).toLocaleString()} so'm*`,
            {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("💵 Balans qo'shish", `addbal_${id}`)],
                    [Markup.button.callback("⬅️ Orqaga", `user_${id}`)],
                ]),
            }
        );
    });

    bot.action(/^hist_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const id   = Number(ctx.match[1]);
        const u    = readUsers().map(safeUser).find(x => x.id === id);
        const text = u?.history?.length
            ? `📜 *${u.name} tarixi:*\n\n` + u.history.map((h, i) => `${i+1}. 🏷 ${h.lot ?? h.lotName ?? "?"} — ${(h.price ?? 0).toLocaleString()} so'm`).join("\n")
            : "📭 Tarix bo'sh.";
        ctx.editMessageText(text, {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", `user_${id}`)]]),
        });
    });

    bot.action(/^wins_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const id   = Number(ctx.match[1]);
        const u    = readUsers().map(safeUser).find(x => x.id === id);
        const text = u?.wins?.length
            ? `🏆 *${u.name} yutishlari:*\n\n` + u.wins.map((w, i) => `${i+1}. 🏷 ${w.lotName ?? "?"} — ${(w.price ?? 0).toLocaleString()} so'm`).join("\n")
            : "📭 Yutishlar yo'q.";
        ctx.editMessageText(text, {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Orqaga", `user_${id}`)]]),
        });
    });

    bot.action(/^addbal_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const id = Number(ctx.match[1]);
        const u  = readUsers().map(safeUser).find(x => x.id === id);
        temp[ctx.from.id] = { step: "addbalance", targetId: id };
        ctx.editMessageText(
            `💵 *${u?.name ?? id}* ga qo'shiladigan summani kiriting (so'mda):`,
            {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor qilish", `user_${id}`)]]),
            }
        );
    });

    bot.action(/^block_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const id  = Number(ctx.match[1]);
        const raw = read("users");
        const arr = Array.isArray(raw) ? raw : Object.values(raw);
        const u   = arr.find(x => x.id === id);
        if (!u) return;
        u.blocked = !u.blocked;
        write("users", arr);
        const safe = safeUser(u);
        ctx.editMessageText(
            userDetailText(safe),
            { parse_mode: "Markdown", ...userDetailKeyboard(safe) }
        );
    });

    // ── 📤 Skin chiqarish so'rovini rad etish ─────────────────────────────────
    bot.action(/^skin_reject_(\d+)_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const targetId = Number(ctx.match[1]);
        const lotId    = Number(ctx.match[2]);
        temp[ctx.from.id] = { step: "reject_comment", targetId, lotId };
        ctx.editMessageText(
            "❌ *Rad etish sababini yozing:*\n\n_(Bu izoh foydalanuvchiga yuboriladi, masalan: \"Trade link noto'g'ri, qayta kiriting\")_",
            { parse_mode: "Markdown", ...CANCEL_BTN }
        ).catch(() => ctx.reply(
            "❌ *Rad etish sababini yozing:*\n\n_(Bu izoh foydalanuvchiga yuboriladi, masalan: \"Trade link noto'g'ri, qayta kiriting\")_",
            { parse_mode: "Markdown", ...CANCEL_BTN }
        ));
    });

    // Market xaridi uchun skin_reject_'ning aynan bir xil nusxasi (Task 10
    // post-review fix) — targetId/lotId o'rniga targetId/purchaseId saqlaydi,
    // matn-handlerdagi "reject_comment_market" bosqichi buni yakunlaydi.
    bot.action(/^mkt_skin_reject_(\d+)_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const targetId = Number(ctx.match[1]);
        const purchaseId = Number(ctx.match[2]);
        temp[ctx.from.id] = { step: "reject_comment_market", targetId, purchaseId };
        ctx.editMessageText(
            "❌ *Rad etish sababini yozing:*\n\n_(Bu izoh foydalanuvchiga yuboriladi)_",
            { parse_mode: "Markdown", ...CANCEL_BTN }
        ).catch(() => ctx.reply(
            "❌ *Rad etish sababini yozing:*\n\n_(Bu izoh foydalanuvchiga yuboriladi)_",
            { parse_mode: "Markdown", ...CANCEL_BTN }
        ));
    });

    // ── 🆘 Qo'llab-quvvatlash — botdan javob yozish/yopish ────────────────────
    bot.action(/^support_reply_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const ticketId = Number(ctx.match[1]);
        const ticket   = supportManager.getById(ticketId);
        if (!ticket) return ctx.reply("❌ Murojaat topilmadi.");
        if (ticket.status === "closed") return ctx.reply("❌ Bu murojaat yopilgan.");
        temp[ctx.from.id] = { step: "support_reply", ticketId };
        ctx.reply(
            `💬 *Ticket #${ticketId}* (${ticket.userName || ticket.userId}) uchun javobingizni yozing:`,
            { parse_mode: "Markdown", ...CANCEL_BTN }
        );
    });

    bot.action(/^support_close_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const ticketId = Number(ctx.match[1]);
        const result = supportManager.closeTicket(ticketId);
        if (result.error) return ctx.reply("❌ Murojaat topilmadi.");
        ctx.reply(`✅ Ticket #${ticketId} yopildi.`);
    });

    // ── Confirm: auction yaratish ─────────────────────────────────────────────
    bot.action("confirm_yes", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const state = temp[ctx.from.id];
        if (!state || state.step !== "confirm") return;
        const auctions = read("auctions");
        auctions.push({
            id:             Date.now(),
            name:           state.name,
            price:          state.price,
            minBid:         state.minBid,
            image:          state.image || null,
            createdAt:      new Date().toISOString(),
            status:         "active",
            lastBidder:     null,
            lastBidderName: null,
            endTime:        state.endTime || null,
        });
        write("auctions", auctions);
        delete temp[ctx.from.id];
        ctx.editMessageText(
            `✅ *${state.name}* muvaffaqiyatli yaratildi!`,
            {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("📦 Auksionlar", "back_to_auctions")],
                    [Markup.button.callback("➕ Yana yaratish", "create_auction")],
                ]),
            }
        );
    });

    bot.action("confirm_no", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        delete temp[ctx.from.id];
        ctx.editMessageText("❌ Bekor qilindi.", Markup.inlineKeyboard([
            [Markup.button.callback("⬅️ Admin Panel", "open_admin")],
        ]));
    });

    bot.action("skip_image", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const state = temp[ctx.from.id];
        if (!state) return;
        state.image = null;
        state.step  = "endTime";
        ctx.editMessageText("⏰ *4/5* — Tugash vaqtini kiriting:\nFormat: `2026-06-20 23:00`", {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
                [Markup.button.callback("⏭ O'tkazib yuborish (cheksiz)", "skip_endtime")],
                [Markup.button.callback("❌ Bekor qilish", "cancel_create")],
            ]),
        });
    });

    bot.action("skip_endtime", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const state = temp[ctx.from.id];
        if (!state) return;
        state.endTime = null;
        state.step    = "confirm";
        ctx.editMessageText(
            `📦 *TASDIQLANG:*\n\n` +
            `🏷 Nom: *${state.name}*\n` +
            `💰 Boshlang'ich narx: *${state.price.toLocaleString()} so'm*\n` +
            `📈 Minimal bid: *${state.minBid.toLocaleString()} so'm*\n` +
            `🖼 Rasm: ${state.image ? "✅ Bor" : "❌ Yo'q"}\n` +
            `⏰ Tugash: Belgilanmagan (cheksiz)`,
            {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("✅ Yaratish", "confirm_yes"), Markup.button.callback("❌ Bekor", "confirm_no")],
                ]),
            }
        );
    });

    // ── Rasm yuborish ─────────────────────────────────────────────────────────
    bot.on("photo", async (ctx, next) => {
        if (!isAdmin(ctx)) return next();
        const state = temp[ctx.from.id];
        if (!state || state.step !== "image") return next();
        state.image = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        state.step  = "endTime";
        ctx.reply("✅ Rasm qabul qilindi!\n\n⏰ *4/5* — Tugash vaqtini kiriting:\nFormat: `2026-06-20 23:00`", {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
                [Markup.button.callback("⏭ O'tkazib yuborish (cheksiz)", "skip_endtime")],
                [Markup.button.callback("❌ Bekor qilish", "cancel_create")],
            ]),
        });
    });

    bot.on("document", async (ctx, next) => {
        if (!isAdmin(ctx)) return next();
        const state = temp[ctx.from.id];
        if (!state || state.step !== "image") return next();
        const mime = ctx.message.document.mime_type || "";
        if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
            return ctx.reply("⚠️ Faqat JPG, PNG, WEBP rasm yuboring.", CANCEL_BTN);
        }
        state.image = ctx.message.document.file_id;
        state.step  = "endTime";
        ctx.reply("✅ Rasm qabul qilindi!\n\n⏰ *4/5* — Tugash vaqtini kiriting:\nFormat: `2026-06-20 23:00`", {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
                [Markup.button.callback("⏭ O'tkazib yuborish (cheksiz)", "skip_endtime")],
                [Markup.button.callback("❌ Bekor qilish", "cancel_create")],
            ]),
        });
    });

    // ── TEXT handler ──────────────────────────────────────────────────────────
    bot.on("text", async (ctx, next) => {
        if (!isAdmin(ctx)) return next();
        if (ctx.message.text.startsWith("/")) return next();
        const knownBtns = Object.values(ADMIN_BTNS);
        if (knownBtns.includes(ctx.message.text)) return next();

        const adminId   = ctx.from.id;
        const editState = editTemp[adminId];
        const state     = temp[adminId];

        // ── EDIT flow ─────────────────────────────────────────────────────────
        if (editState) {
            const auctions = read("auctions");
            const a = auctions.find(x => x.id === editState.id);
            if (!a) { delete editTemp[adminId]; return ctx.reply("❌ Auction topilmadi."); }
            if (editState.step === "name") {
                a.name = ctx.message.text.trim();
                editState.step = "price";
                write("auctions", auctions);
                return ctx.reply("💰 Yangi narx (faqat raqam):", CANCEL_BTN);
            }
            if (editState.step === "price") {
                const price = Number(ctx.message.text.replace(/\s/g, ""));
                if (isNaN(price) || price <= 0) return ctx.reply("⚠️ Faqat musbat raqam:", CANCEL_BTN);
                a.price = price;
                write("auctions", auctions);
                delete editTemp[adminId];
                return ctx.reply(
                    `✅ *${a.name}* yangilandi!\n💰 ${a.price.toLocaleString()} so'm`,
                    {
                        parse_mode: "Markdown",
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback("📦 Auksionni ko'rish", `auction_${a.id}`)],
                            [Markup.button.callback("⬅️ Auksionlarga", "back_to_auctions")],
                        ]),
                    }
                );
            }
            return;
        }

        // ── BROADCAST flow ────────────────────────────────────────────────────
        if (state?.step === "broadcast") {
            state.broadcastText = ctx.message.text;
            const raw   = read("users");
            const users = Array.isArray(raw) ? raw : Object.values(raw);
            const count = users.filter(u => !u.blocked && u.lang).length;
            state.step  = "broadcast_confirm";
            return ctx.reply(
                `📢 *Xabar ko'rinishi:*\n\n${ctx.message.text}\n\n` +
                `👥 Yuboriladi: *${count}* ta usergа\n\nTasdiqlaysizmi?`,
                {
                    parse_mode: "Markdown",
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback("✅ Ha, yuborish", "confirm_broadcast")],
                        [Markup.button.callback("❌ Bekor", "cancel_broadcast")],
                    ]),
                }
            );
        }

        // ── SEARCH flow ───────────────────────────────────────────────────────
        if (state?.step === "search_user") {
            delete temp[adminId];
            const query = ctx.message.text.trim().toLowerCase();
            const raw   = read("users");
            const users = Array.isArray(raw) ? raw : Object.values(raw);
            const found = users.filter(u =>
                String(u.id).includes(query) ||
                (u.name || "").toLowerCase().includes(query) ||
                (u.username || "").toLowerCase().includes(query)
            ).slice(0, 5);

            if (!found.length) return ctx.reply(`🔍 *"${query}"* bo'yicha hech kim topilmadi.`, { parse_mode: "Markdown" });

            const buttons = found.map(u => [
                Markup.button.callback(
                    `${u.blocked ? "⛔" : "✅"} ${u.name} (${u.id})`,
                    `user_${u.id}`
                ),
            ]);
            return ctx.reply(
                `🔍 *Natijalar (${found.length} ta):*`,
                { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) }
            );
        }

        // ── SKIN CHIQARISHNI RAD ETISH — izoh ─────────────────────────────────
        if (state?.step === "reject_comment") {
            const comment  = ctx.message.text.trim();
            const targetId = state.targetId;
            const lotId    = state.lotId;
            delete temp[adminId];

            const raw  = read("users");
            const arr  = Array.isArray(raw) ? raw : Object.values(raw);
            const user = arr.find(u => u.id === targetId);
            const win  = user?.wins?.find(w => w.lotId === lotId);
            if (!user || !win) return ctx.reply("❌ Item yoki user topilmadi.");

            win.status        = "rejected";
            win.rejectComment = comment;
            win.rejectedAt    = new Date().toISOString();
            write("users", arr);

            ctx.reply(`❌ *Rad etildi!*\n\n👤 ${user.name}\n🏷 ${win.lotName}\n💬 ${comment}`, { parse_mode: "Markdown" });

            notifyUser(
                user,
                `❌ *Skin chiqarish so'rovingiz rad etildi.*\n\n🏷 *${win.lotName}*\n💬 Sabab: ${comment}\n\nIltimos, Trade Link'ni tekshirib qayta urinib ko'ring.`,
                bot.telegram.sendMessage.bind(bot.telegram),
                process.env.WEBAPP_URL
                    ? { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.webApp("🎒 Inventarga o'tish", `${process.env.WEBAPP_URL}/?page=inventory`)]]) }
                    : { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🎒 Inventar", "my_inventory")]]) }
            );
            return;
        }

        // ── MARKET SKIN CHIQARISHNI RAD ETISH — izoh (Task 10 post-review fix) ─
        if (state?.step === "reject_comment_market") {
            const comment = ctx.message.text.trim();
            const targetId = state.targetId;
            const purchaseId = state.purchaseId;
            delete temp[adminId];

            const raw = read("users");
            const arr = Array.isArray(raw) ? raw : Object.values(raw);
            const user = arr.find(u => u.id === targetId);
            const purchase = user?.marketPurchases?.find(p => p.lotId === purchaseId);
            if (!user || !purchase) return ctx.reply("❌ Item yoki user topilmadi.");

            purchase.status = "rejected";
            purchase.rejectComment = comment;
            purchase.rejectedAt = new Date().toISOString();
            write("users", arr);

            ctx.reply(`❌ *Rad etildi!*\n\n👤 ${user.name}\n🏷 ${purchase.lotName}\n💬 ${comment}`, { parse_mode: "Markdown" });

            notifyUser(
                user,
                `❌ *Market xaridi chiqarish so'rovingiz rad etildi.*\n\n🏷 *${purchase.lotName}*\n💬 Sabab: ${comment}\n\nIltimos, Trade Link'ni tekshirib qayta urinib ko'ring.`,
                bot.telegram.sendMessage.bind(bot.telegram),
                { parse_mode: "Markdown" }
            );
            return;
        }

        // ── QO'LLAB-QUVVATLASH — botdan javob yozish ──────────────────────────
        if (state?.step === "support_reply") {
            const text     = ctx.message.text.trim();
            const ticketId = state.ticketId;
            delete temp[adminId];

            const ticket = supportManager.getById(ticketId);
            if (!ticket) return ctx.reply("❌ Murojaat topilmadi.");
            const result = supportManager.addMessage(ticketId, "admin", ctx.from.first_name || "Admin", text);
            if (result.error) return ctx.reply(result.error === "closed" ? "❌ Bu murojaat allaqachon yopilgan." : "❌ Xatolik yuz berdi.");

            ctx.reply(`✅ Javob yuborildi (Ticket #${ticketId}).`);
            notifyUser(ticket.userId,
                `🆘 *Yordam (Ticket #${ticketId})* — ${ctx.from.first_name || "Admin"}:*\n${text}`,
                bot.telegram.sendMessage.bind(bot.telegram), { parse_mode: "Markdown" }
            );
            return;
        }

        // ── CREATE / ADDBALANCE flow ──────────────────────────────────────────
        if (!state) return;

        if (state.step === "name") {
            state.name = ctx.message.text.trim();
            if (!state.name) return ctx.reply("⚠️ Nom bo'sh bo'lmasligi kerak.", CANCEL_BTN);
            state.step = "price";
            return ctx.reply("💰 *2/5* — Boshlang'ich narxni kiriting (so'mda):", { parse_mode: "Markdown", ...CANCEL_BTN });
        }
        if (state.step === "price") {
            const price = Number(ctx.message.text.replace(/\s/g, ""));
            if (isNaN(price) || price <= 0) return ctx.reply("⚠️ Faqat musbat raqam:", CANCEL_BTN);
            state.price = price;
            state.step  = "minBid";
            return ctx.reply("📈 *3/5* — Minimal bid miqdorini kiriting (so'mda):", { parse_mode: "Markdown", ...CANCEL_BTN });
        }
        if (state.step === "minBid") {
            const minBid = Number(ctx.message.text.replace(/\s/g, ""));
            if (isNaN(minBid) || minBid <= 0) return ctx.reply("⚠️ Faqat musbat raqam:", CANCEL_BTN);
            state.minBid = minBid;
            state.step   = "image";
            return ctx.reply("🖼 *3/5* — Rasm yuboring yoki o'tkazib yuboring:", {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("⏭ O'tkazib yuborish", "skip_image")],
                    [Markup.button.callback("❌ Bekor qilish", "cancel_create")],
                ]),
            });
        }
        if (state.step === "endTime") {
            const parsed = new Date(ctx.message.text);
            if (isNaN(parsed.getTime())) {
                return ctx.reply("⚠️ Format noto'g'ri!\n\nTo'g'ri format: `2026-06-20 23:00`", {
                    parse_mode: "Markdown",
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback("⏭ O'tkazib yuborish (cheksiz)", "skip_endtime")],
                        [Markup.button.callback("❌ Bekor qilish", "cancel_create")],
                    ]),
                });
            }
            state.endTime = parsed.toISOString();
            state.step    = "confirm";
            return ctx.reply(
                `📦 *TASDIQLANG:*\n\n` +
                `🏷 Nom: *${state.name}*\n` +
                `💰 Boshlang'ich narx: *${state.price.toLocaleString()} so'm*\n` +
                `📈 Minimal bid: *${state.minBid.toLocaleString()} so'm*\n` +
                `🖼 Rasm: ${state.image ? "✅ Bor" : "❌ Yo'q"}\n` +
                `⏰ Tugash: *${ctx.message.text}*`,
                {
                    parse_mode: "Markdown",
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback("✅ Yaratish", "confirm_yes"), Markup.button.callback("❌ Bekor", "confirm_no")],
                    ]),
                }
            );
        }
        if (state.step === "addbalance") {
            const amount   = Number(ctx.message.text.replace(/\s/g, ""));
            if (isNaN(amount) || amount <= 0) return ctx.reply("⚠️ Faqat musbat raqam:", CANCEL_BTN);
            const targetId = state.targetId;
            const raw = read("users");
            const arr = Array.isArray(raw) ? raw : Object.values(raw);
            const u   = arr.find(x => x.id === targetId);
            if (!u) { delete temp[adminId]; return ctx.reply("❌ User topilmadi."); }
            u.balance = (u.balance ?? 0) + amount;
            write("users", arr);
            delete temp[adminId];
            notifyUser(
                u,
                `💰 Balansingizga *${amount.toLocaleString()} so'm* qo'shildi!\n💳 Joriy balans: *${u.balance.toLocaleString()} so'm*`,
                bot.telegram.sendMessage.bind(bot.telegram),
                { parse_mode: "Markdown" }
            );
            return ctx.reply(
                `✅ *${u.name ?? targetId}* ga *${amount.toLocaleString()} so'm* qo'shildi!\n💳 Yangi balans: *${u.balance.toLocaleString()} so'm*`,
                {
                    parse_mode: "Markdown",
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback("👤 Userga qaytish", `user_${targetId}`)],
                        [Markup.button.callback("⬅️ Foydalanuvchilarga", "back_to_users")],
                    ]),
                }
            );
        }
    });

    // ── 📢 Broadcast ─────────────────────────────────────────────────────────
    bot.command("broadcast", (ctx) => {
        if (!isAdmin(ctx)) return;
        temp[ctx.from.id] = { step: "broadcast" };
        ctx.reply(
            "📢 *Barcha foydalanuvchilarga xabar yuborish*\n\nXabar matnini yozing:",
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor", "cancel_broadcast")]]) }
        );
    });

    bot.action("cancel_broadcast", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        delete temp[ctx.from.id];
        ctx.editMessageText("❌ Broadcast bekor qilindi.");
    });

    bot.action("confirm_broadcast", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const state = temp[ctx.from.id];
        if (!state?.broadcastText) return;

        const raw      = read("users");
        const users    = Array.isArray(raw) ? raw : Object.values(raw);
        const filtered = users.filter(u => !u.blocked && u.lang);

        ctx.editMessageText(`📢 Yuborilmoqda... (${filtered.length} ta user)`);

        let sent = 0, failed = 0, siteOnly = 0;
        for (const u of filtered) {
            // Telegramsiz (Steam orqali mustaqil kirgan) foydalanuvchilarga DM
            // yuborib bo'lmaydi — ular uchun faqat saytdagi bildirishnoma qoladi.
            if (!u.telegramId) {
                pushNotification(u.id, state.broadcastText);
                siteOnly++;
                continue;
            }
            try {
                await bot.telegram.sendMessage(u.id, state.broadcastText, { parse_mode: "Markdown" });
                sent++;
            } catch { failed++; }
            await new Promise(r => setTimeout(r, 50)); // Telegram limit
        }
        delete temp[ctx.from.id];
        ctx.reply(`✅ *Broadcast yakunlandi!*\n\n✅ Yuborildi: ${sent} ta\n🌐 Saytda (Steam-only): ${siteOnly} ta\n❌ Xato: ${failed} ta`, { parse_mode: "Markdown" });
    });

    // ── 🔍 User qidirish ──────────────────────────────────────────────────────
    bot.command("search", (ctx) => {
        if (!isAdmin(ctx)) return;
        temp[ctx.from.id] = { step: "search_user" };
        ctx.reply("🔍 User ID yoki ism kiriting:");
    });

    // ── 📈 Kunlik hisobot ─────────────────────────────────────────────────────
    bot.command("report", async (ctx) => {
        if (!isAdmin(ctx)) return;
        const users    = readUsers();
        const auctions = read("auctions");
        const bids     = read("bids") || [];
        const promos   = read("promos") || [];

        const today    = new Date();
        today.setHours(0,0,0,0);

        const todayUsers = users.filter(u => u.joined && new Date(u.joined) >= today).length;
        const todayBids  = bids.filter(b => b.date && new Date(b.date) >= today).length;
        const todayBidVol = bids.filter(b => b.date && new Date(b.date) >= today)
            .reduce((sum, b) => sum + (b.amount || 0), 0);
        const active   = auctions.filter(a => a.status === "active").length;
        const finished = auctions.filter(a => a.status === "finished").length;
        const blocked  = users.filter(u => u.blocked).length;
        const withTL   = users.filter(u => u.tradeLink).length;
        const activeP  = promos.filter(p => p.active).length;

        ctx.reply(
            `📈 *Kunlik hisobot*\n📅 ${new Date().toLocaleDateString("uz-UZ")}\n\n` +
            `👥 Jami userlar: *${users.length}*\n` +
            `🆕 Bugun qo'shildi: *${todayUsers}*\n` +
            `⛔ Bloklangan: *${blocked}*\n` +
            `🔗 Trade Link bor: *${withTL}*\n\n` +
            `📦 Jami auksionlar: *${auctions.length}*\n` +
            `🟢 Aktiv: *${active}* | 🔴 Tugagan: *${finished}*\n\n` +
            `💸 Bugun bidlar: *${todayBids}* ta\n` +
            `💰 Bugun hajm: *${todayBidVol.toLocaleString()} so'm*\n\n` +
            `🎟 Aktiv promo kodlar: *${activeP}*`,
            {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("🎟 Promo boshqarish", "manage_promos")],
                ]),
            }
        );
    });

    // TEXT da broadcast va search handle
    // (mavjud text handler ichiga qo'shiladi)
};


// ── Promo kodlar (adminHandler ga qo'shimcha) ─────────────────────────────────
// Bu qatorlarni module.exports ichiga qo'shish kerak emas,
// chunki alohida faylga chiqaramiz