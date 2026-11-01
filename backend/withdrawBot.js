// Pul yechish so'rovlari ALOHIDA Telegram botga (WITHDRAW_BOT_TOKEN) keladi.
// Token yo'q bo'lsa — asosiy botga (BOT_TOKEN), avvalgidek.
// Tugmalar (wd_approve_/wd_reject_) shu bot jarayonida ishlaydi (bot/withdrawBot.js).
const { toAdmins } = require("./adminIds");

function withdrawBotToken() {
    return process.env.WITHDRAW_BOT_TOKEN || process.env.BOT_TOKEN;
}

// Barcha adminlarga Markdown xabar + Tasdiqlash/Rad etish tugmalari.
function withdrawRequestText({ name, userId, amount, cardNumber }) {
    const esc = (t) => String(t).replace(/([_*`\[])/g, "\\$1");
    return `💸 *Pul chiqarish so'rovi!*\n\n👤 ${esc(name ?? userId)}\n🪪 \`${userId}\`\n💰 *${amount.toLocaleString()} so'm*\n💳 \`${cardNumber}\``;
}

function withdrawKeyboard(requestId) {
    return { inline_keyboard: [[
        { text: "✅ Tasdiqlash", callback_data: `wd_approve_${requestId}` },
        { text: "❌ Rad etish",  callback_data: `wd_reject_${requestId}` },
    ]] };
}

async function sendToAdmin(chatId, text, replyMarkup, fetchImpl = fetch) {
    const res = await fetchImpl(`https://api.telegram.org/bot${withdrawBotToken()}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", reply_markup: replyMarkup }),
    });
    const body = await res.json().catch(() => ({}));
    if (!body.ok) throw new Error(body.description || `HTTP ${res.status}`);
}

// request — balanceManager.requestWithdrawal natijasidagi so'rov; user — {name, id}.
function notifyWithdrawRequest(user, request, fetchImpl) {
    const text = withdrawRequestText({ name: user?.name, userId: request.userId ?? user?.id, amount: request.amount, cardNumber: request.cardNumber });
    return toAdmins((id) => sendToAdmin(id, text, withdrawKeyboard(request.id), fetchImpl));
}

module.exports = { notifyWithdrawRequest, withdrawRequestText, withdrawKeyboard, withdrawBotToken };
