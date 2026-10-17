const { Markup } = require("telegraf");
const { read, write } = require("../../backend/database/db");

// Global state — adminHandler ham ko'rishi uchun export qilamiz
const pendingPromo = {};
module.exports.pendingPromo = pendingPromo;

module.exports = (bot) => {
    const isAdmin = (ctx) => ctx.from.id === Number(process.env.ADMIN_ID);

    // /promo komandasi
    bot.command("promo", (ctx) => {
        if (!isAdmin(ctx)) return;
        showPromoPanel(ctx, false);
    });

    function showPromoPanel(ctx, edit = false) {
        const promos = read("promos") || [];
        const active = promos.filter(p => p.active);
        const text   =
            `🎟 *Promo Kodlar*\n\n` +
            `Jami: *${promos.length}* ta | Aktiv: *${active.length}* ta\n\n` +
            `Har bir kod o'z bonus foiziga ega (yaratishda belgilanadi).`;
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback("➕ Yangi promo kod", "create_promo")],
            [Markup.button.callback("📋 Barcha kodlar",   "list_promos")],
        ]);
        if (edit) return ctx.editMessageText(text, { parse_mode: "Markdown", ...keyboard }).catch(() => {});
        return ctx.reply(text, { parse_mode: "Markdown", ...keyboard });
    }

    // Promo ro'yxati
    bot.action("list_promos", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        const promos = read("promos") || [];
        if (!promos.length) {
            return ctx.editMessageText(
                "📭 Hozircha promo kod yo'q.",
                Markup.inlineKeyboard([
                    [Markup.button.callback("➕ Yaratish", "create_promo")],
                ])
            ).catch(() => {});
        }
        let text = `🎟 *Barcha promo kodlar:*\n\n`;
        promos.forEach((p, i) => {
            text +=
                `${i + 1}. \`${p.code}\` — ${p.active ? "✅ Aktiv" : "❌ Nofaol"}\n` +
                `   👥 Ishlatilgan: ${(p.usedBy || []).length} marta\n` +
                `   🔢 Limit: ${p.maxUse ? p.maxUse + " ta" : "Cheksiz"}\n\n`;
        });
        const buttons = promos.map(p => [
            Markup.button.callback(
                `${p.active ? "✅" : "❌"} ${p.code} — 🗑 O'chirish`,
                `delete_promo_${p.code}`
            ),
        ]);
        buttons.push([Markup.button.callback("➕ Yangi yaratish", "create_promo")]);
        ctx.editMessageText(text, { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) }).catch(() => {});
    });

    // Promo yaratish boshlash
    bot.action("create_promo", async (ctx) => {
        await ctx.answerCbQuery();
        if (!isAdmin(ctx)) return;
        pendingPromo[ctx.from.id] = { step: "code" };
        ctx.editMessageText(
            `🎟 *Yangi promo kod — 1/2*\n\n` +
            `Promo kod kiriting:\n` +
            `_(Masalan: \`SUMMER25\`, \`VIP100\`)_\n\n` +
            `⚠️ Faqat lotin harflar va raqamlar`,
            {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor qilish", "cancel_promo")]]),
            }
        ).catch(() => {});
    });

    bot.action("cancel_promo", async (ctx) => {
        await ctx.answerCbQuery();
        delete pendingPromo[ctx.from.id];
        ctx.editMessageText(
            "❌ Bekor qilindi.",
            Markup.inlineKeyboard([[Markup.button.callback("🎟 Promo panelga", "manage_promos")]])
        ).catch(() => {});
    });

    // Promo o'chirish
    bot.action(/^delete_promo_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery(`🗑 O'chirildi!`, true);
        if (!isAdmin(ctx)) return;
        const code   = ctx.match[1];
        const promos = (read("promos") || []).filter(p => p.code !== code);
        write("promos", promos);

        if (!promos.length) {
            return ctx.editMessageText(
                "📭 Hozircha promo kod yo'q.",
                Markup.inlineKeyboard([[Markup.button.callback("➕ Yaratish", "create_promo")]])
            ).catch(() => {});
        }
        let text = `🎟 *Barcha promo kodlar:*\n\n`;
        promos.forEach((p, i) => {
            text += `${i + 1}. \`${p.code}\` — ${p.active ? "✅" : "❌"} | ${(p.usedBy || []).length} marta\n`;
        });
        const buttons = promos.map(p => [
            Markup.button.callback(`${p.active ? "✅" : "❌"} ${p.code} — 🗑 O'chirish`, `delete_promo_${p.code}`),
        ]);
        buttons.push([Markup.button.callback("➕ Yangi yaratish", "create_promo")]);
        ctx.editMessageText(text, { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) }).catch(() => {});
    });

    // ── TEXT handler — promo code va maxUse kiritish ──────────────────────────
    bot.on("text", async (ctx, next) => {
        if (!isAdmin(ctx)) return next();
        if (ctx.message.text.startsWith("/")) return next();

        const state = pendingPromo[ctx.from.id];
        if (!state) return next(); // promo state yo'q — keyingi handlerlarga o't

        // ── 1. Kod kiritish ───────────────────────────────────────────────────
        if (state.step === "code") {
            const code = ctx.message.text.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (!code || code.length < 3) {
                return ctx.reply(
                    "⚠️ Kamida 3 ta belgi bo'lishi kerak (A-Z, 0-9):",
                    Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor qilish", "cancel_promo")]])
                );
            }
            // Telegram callback_data 64 baytdan oshmasligi kerak (approve_topup_<uid>_<amount>_<bonus>_<code>) —
            // shu sabab promo kod uzunligi cheklanadi.
            if (code.length > 15) {
                return ctx.reply(
                    "⚠️ Ko'pi bilan 15 ta belgi bo'lishi kerak (A-Z, 0-9):",
                    Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor qilish", "cancel_promo")]])
                );
            }
            const existing = (read("promos") || []).find(p => p.code === code);
            if (existing) {
                return ctx.reply(
                    `⚠️ \`${code}\` kodi allaqachon mavjud! Boshqa kod kiriting:`,
                    { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor qilish", "cancel_promo")]]) }
                );
            }
            state.code = code;
            state.step = "bonus";
            return ctx.reply(
                `✅ Kod: \`${code}\`\n\n` +
                `🎟 *Yangi promo kod — 2/4*\n\n` +
                `💰 Bonus foizini kiriting (masalan \`15\`):`,
                {
                    parse_mode: "Markdown",
                    ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor qilish", "cancel_promo")]]),
                }
            );
        }

        // ── 2. Bonus foizi kiritish ────────────────────────────────────────────
        // Botdan yaratilgan promolar doim "balance" turida (depozit bonusi) —
        // "obmen" (trade) turidagi promolar hozircha faqat websayt admin
        // panelidan yaratiladi (AdminPromos.jsx), chunki u yerda maxUse'ning
        // ma'nosi butunlay boshqacha ("nechta obmen tekin bo'ladi").
        if (state.step === "bonus") {
            const bonus = Number(ctx.message.text.trim());
            if (isNaN(bonus) || bonus <= 0 || bonus > 100) {
                return ctx.reply(
                    "⚠️ 1 dan 100 gacha bo'lgan raqam kiriting:",
                    Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor qilish", "cancel_promo")]])
                );
            }
            state.bonus = bonus;
            state.step = "maxUse";
            return ctx.reply(
                `✅ Bonus: \`${bonus}%\`\n\n` +
                `🎟 *Yangi promo kod — 3/4*\n\n` +
                `🔢 Maksimal foydalanish sonini kiriting:\n` +
                `_(Cheksiz bo'lsa \`0\` kiriting)_`,
                {
                    parse_mode: "Markdown",
                    ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor qilish", "cancel_promo")]]),
                }
            );
        }

        // ── 3. Limit kiritish ─────────────────────────────────────────────────
        if (state.step === "maxUse") {
            const maxUse = Number(ctx.message.text.trim());
            if (isNaN(maxUse) || maxUse < 0) {
                return ctx.reply(
                    "⚠️ Faqat musbat raqam yoki 0 kiriting:",
                    Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor qilish", "cancel_promo")]])
                );
            }
            state.maxUse = maxUse;
            state.step = "perUserLimit";
            return ctx.reply(
                `✅ Limit: \`${maxUse || "Cheksiz"}\`\n\n` +
                `🎟 *Yangi promo kod — 4/4*\n\n` +
                `👤 Bitta odam shu kodni necha marta ishlata olishini kiriting:\n` +
                `_(Bir marta — \`1\`, cheksiz bo'lsa \`0\`)_`,
                {
                    parse_mode: "Markdown",
                    ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor qilish", "cancel_promo")]]),
                }
            );
        }

        // ── 4. Bir kishi uchun limit kiritish ────────────────────────────────
        if (state.step === "perUserLimit") {
            const perUserLimit = Number(ctx.message.text.trim());
            if (isNaN(perUserLimit) || perUserLimit < 0) {
                return ctx.reply(
                    "⚠️ Faqat musbat raqam yoki 0 kiriting:",
                    Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor qilish", "cancel_promo")]])
                );
            }

            const newPromo = {
                code:      state.code,
                type:      "balance",
                bonus:     state.bonus,
                perUserLimit,
                active:    true,
                maxUse:    state.maxUse || null,
                usedBy:    [],
                usedCount: 0,
                createdAt: new Date().toISOString(),
            };
            const promos = read("promos") || [];
            promos.push(newPromo);
            write("promos", promos);
            delete pendingPromo[ctx.from.id];

            return ctx.reply(
                `✅ *Promo kod yaratildi!*\n\n` +
                `🎟 Kod: \`${newPromo.code}\`\n` +
                `💰 Bonus: *${newPromo.bonus}%*\n` +
                `🔢 Limit: ${newPromo.maxUse ? newPromo.maxUse + " ta" : "Cheksiz"}\n` +
                `👤 Bir kishi: ${perUserLimit ? perUserLimit + " marta" : "Cheksiz"}\n\n` +
                `Foydalanuvchilar "💰 Balance" bo'limida ishlatishi mumkin.`,
                {
                    parse_mode: "Markdown",
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback("📋 Barcha kodlar", "list_promos")],
                        [Markup.button.callback("➕ Yana yaratish", "create_promo")],
                    ]),
                }
            );
        }

        return next();
    });
};