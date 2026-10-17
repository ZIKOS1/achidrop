const { Markup } = require("telegraf");
const { read, write } = require("../../backend/database/db");
const { createTelegramUser } = require("../../backend/userLifecycle");
const { attachCodeToPending } = require("../../backend/auth-telegram-login");
const { FEATURES } = require("../../backend/features");

function readUsers() {
    const data = read("users");
    if (Array.isArray(data)) return data;
    return Object.values(data);
}
function getUser(id) { return readUsers().find(u => u.id === id) || null; }
function saveUser(user) {
    const adminId = Number(process.env.ADMIN_ID);
    user.role = user.id === adminId ? "admin" : "user";
    const raw = read("users"), arr = Array.isArray(raw)?raw:Object.values(raw);
    const idx = arr.findIndex(u => u.id === user.id);
    if (idx !== -1) arr[idx] = user; else arr.push(user);
    write("users", arr);
}

const TEXTS = {
    uz: {
        welcome:     (name) => `👋 Assalomu alaykum, *${name}*!\nAsosiy menyuga xush kelibsiz.`,
        choose_lang: "🌐 Tilni tanlang:",
        blocked:     "⛔ Siz bloklangansiz. Admin bilan bog'laning.",
        auctions:    "🏷 Auksionlar",
        profile:     "👤 Profil",
        balance:     "💰 Balance",
        inventory:   "🎒 Inventar",
        obmen:       "🔄 Obmen",
        market:      "🛒 Market",
        sell:        "💸 Skin sotish",
    },
    ru: {
        welcome:     (name) => `👋 Привет, *${name}*!\nДобро пожаловать в главное меню.`,
        choose_lang: "🌐 Выберите язык:",
        blocked:     "⛔ Вы заблокированы. Свяжитесь с администратором.",
        auctions:    "🏷 Аукционы",
        profile:     "👤 Профиль",
        balance:     "💰 Баланс",
        inventory:   "🎒 Инвентарь",
        obmen:       "🔄 Обмен",
        market:      "🛒 Маркет",
        sell:        "💸 Продать скин",
    },
};

function T(user, key, ...args) {
    const lang = user?.lang || "uz";
    const val  = TEXTS[lang][key];
    return typeof val === "function" ? val(...args) : val;
}

function mainMenu(user) {
    const lang = user?.lang || "uz";
    const TX   = TEXTS[lang];
    // O'chirilgan bo'limlar (features.js) menyuda ko'rinmaydi.
    const extra = [
        ...(FEATURES.auctions ? [TX.auctions] : []),
        ...(FEATURES.trade ? [TX.obmen] : []),
        ...(FEATURES.market ? [TX.market] : []),
    ];
    if (FEATURES.inventory) extra.unshift(TX.inventory);
    const rows = [
        [TX.sell],
        [TX.balance, TX.profile],
    ];
    for (let i = 0; i < extra.length; i += 2) rows.push(extra.slice(i, i + 2));
    return Markup.keyboard(rows).resize();
}

module.exports = (bot) => {
    const isAdmin = (ctx) => ctx.from.id === Number(process.env.ADMIN_ID);

    bot.start(async (ctx) => {
        const from     = ctx.from;
        const payload  = ctx.startPayload; // ref_12345 yoki weblogin_<nonce>

        // Websaytdan "Telegram orqali kirish" bosilib shu botga o'tkazilgan
        // bo'lsa — oddiy onboarding'ni to'xtatib, darhol tasdiqlash kodini
        // yuboramiz (rasmiy Telegram Login Widget'ining kodi kelmay qolish
        // muammosini chetlab o'tish uchun qo'shilgan alohida login yo'li).
        if (payload && payload.startsWith("weblogin_")) {
            const nonce = payload.slice("weblogin_".length);
            const code  = await attachCodeToPending(nonce, from);
            if (!code) {
                await ctx.reply("⛔ Havola muddati tugagan. Saytga qaytib, \"Telegram orqali kirish\"ni qaytadan bosing.");
            } else {
                await ctx.reply(`🔐 Saytga kirish uchun tasdiqlash kodi:\n\n*${code}*\n\nBu kodni saytdagi maydonga kiriting. Kod 10 daqiqa amal qiladi.`, { parse_mode: "Markdown" });
            }
            return;
        }

        // Obmen taklif havolasi orqali kirilgan bo'lsa — foydalanuvchi (yangi
        // bo'lsa yaratib) mavjud bo'lishi bilan xaridor sifatida obmenga
        // qo'shiladi, til tanlash bosqichi bundan mustaqil (ref_ naqshiga o'xshab).
        if (payload && payload.startsWith("trade_")) {
            const tradeId = Number(payload.slice("trade_".length));
            const existingForTrade = getUser(from.id);
            if (!existingForTrade) createTelegramUser(from);
            if (tradeId) {
                setTimeout(() => {
                    try {
                        const tradeHandler = require("./tradeHandler");
                        if (tradeHandler.joinTradeFromDeepLink) tradeHandler.joinTradeFromDeepLink(bot, from.id, tradeId);
                    } catch {}
                }, existingForTrade ? 0 : 1000);
            }
        }

        const existing = getUser(from.id);

        if (existing && existing.lang) {
            if (existing.blocked) return ctx.reply(T(existing, "blocked"));
            await ctx.reply(T(existing, "welcome", existing.name), {
                parse_mode: "Markdown",
                ...mainMenu(existing),
            });
            if (isAdmin(ctx)) {
                await ctx.reply("👑 Admin sifatida kirdingiz:", Markup.inlineKeyboard([
                    [Markup.button.callback("🛠 Admin Panel", "open_admin")],
                ]));
            } else if (process.env.WEBAPP_URL) {
                await ctx.reply("🌐 Mini App orqali auksionlarni qulay ko'rish va bid qo'yish mumkin:", Markup.inlineKeyboard([
                    [Markup.button.webApp("🚀 Mini App ochish", process.env.WEBAPP_URL)],
                ]));
            }
            return;
        }

        if (!existing) {
            const newUser = createTelegramUser(from);
            console.log(`🆕 Yangi user: ${from.id} — ${newUser.name}`);

            // Referral tekshirish
            if (payload && payload.startsWith("ref_")) {
                const refId = Number(payload.replace("ref_", ""));
                if (refId && refId !== from.id) {
                    // clientHandler.js da handleRef bor
                    try {
                        const clientHandler = require("./clientHandler");
                        if (clientHandler.handleRef) {
                            setTimeout(() => clientHandler.handleRef(bot, from.id, refId), 1000);
                        }
                    } catch {}
                }
            }
        }

        ctx.reply(TEXTS.uz.choose_lang, Markup.inlineKeyboard([
            [
                Markup.button.callback("🇺🇿 O'zbekcha", "lang_uz"),
                Markup.button.callback("🇷🇺 Русский",   "lang_ru"),
            ],
        ]));
    });

    async function handleLang(ctx, lang) {
        await ctx.answerCbQuery();
        const from     = ctx.from;
        const existing = getUser(from.id);
        const adminId  = Number(process.env.ADMIN_ID);

        const user = {
            id:             from.id,
            telegramId:     existing?.telegramId ?? from.id,
            name:           from.first_name + (from.last_name ? " " + from.last_name : ""),
            username:       from.username || null,
            lang,
            role:           from.id === adminId ? "admin" : "user",
            balance:        existing?.balance        ?? 0,
            wins:           existing?.wins           ?? [],
            history:        existing?.history        ?? [],
            blocked:        existing?.blocked        ?? false,
            auctions:       existing?.auctions       ?? [],
            tradeLink:      existing?.tradeLink      ?? null,
            steamId64:      existing?.steamId64      ?? null,
            referrals:      existing?.referrals      ?? [],
            balanceHistory: existing?.balanceHistory ?? [],
            joined:         existing?.joined         ?? new Date().toISOString(),
        };
        saveUser(user);

        await ctx.reply(T(user, "welcome", user.name), {
            parse_mode: "Markdown",
            ...mainMenu(user),
        });

        if (user.role === "admin") {
            await ctx.reply("👑 Admin sifatida kirdingiz:", Markup.inlineKeyboard([
                [Markup.button.callback("🛠 Admin Panel", "open_admin")],
            ]));
        } else if (process.env.WEBAPP_URL) {
            await ctx.reply("🌐 Mini App:", Markup.inlineKeyboard([
                [Markup.button.webApp("🚀 Mini App ochish", process.env.WEBAPP_URL)],
            ]));
        }
    }

    bot.action("lang_uz", (ctx) => handleLang(ctx, "uz"));
    bot.action("lang_ru", (ctx) => handleLang(ctx, "ru"));
};