// Alohida "pul yechish" boti (WITHDRAW_BOT_TOKEN). Barcha pul yechish so'rovlari
// adminlarga shu botdan keladi (backend/withdrawBot.js); "Tasdiqlash/Rad etish"
// tugmalari shu yerda ishlaydi, foydalanuvchiga javob esa ASOSIY bot orqali ketadi.
// Token yo'q bo'lsa — hech narsa qilinmaydi (so'rovlar asosiy botga keladi).
const { Telegraf } = require("telegraf");
const { isWithdrawAdmin } = require("../backend/withdrawBot");
const { registerWithdrawActions } = require("./handlers/adminHandler");

function startWithdrawBot(mainBot) {
    const token = process.env.WITHDRAW_BOT_TOKEN;
    if (!token) return null;
    if (token === process.env.BOT_TOKEN) {
        console.log("⚠️ WITHDRAW_BOT_TOKEN asosiy bot tokeni bilan bir xil — alohida bot ishga tushirilmadi.");
        return null;
    }
    const wb = new Telegraf(token);
    wb.catch((err, ctx) => console.error(`❌ Pul yechish boti xatosi [${ctx.updateType}]:`, err.message || err));

    wb.start((ctx) => ctx.reply(isWithdrawAdmin(ctx.from?.id)
        ? "💸 Pul yechish so'rovlari shu botga keladi. Har bir so'rovda \"Tasdiqlash\" yoki \"Rad etish\"ni bosing."
        : "Bu bot faqat pul yechish admini uchun."));

    registerWithdrawActions(wb, mainBot.telegram.sendMessage.bind(mainBot.telegram));

    wb.launch().catch((err) => console.log("❌ Pul yechish boti ishga tushmadi:", err.message));
    console.log("✅ Pul yechish boti ishga tushdi!");
    process.once("SIGINT",  () => wb.stop("SIGINT"));
    process.once("SIGTERM", () => wb.stop("SIGTERM"));
    return wb;
}

module.exports = { startWithdrawBot };
