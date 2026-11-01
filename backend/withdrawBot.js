// Pul yechish so'rovlari ALOHIDA Telegram botga (WITHDRAW_BOT_TOKEN) keladi.
// Token yo'q bo'lsa — asosiy botga (BOT_TOKEN), avvalgidek.
// Tugmalar (wd_approve_/wd_reject_) shu bot jarayonida ishlaydi (bot/withdrawBot.js).
// Pul yechish so'rovlarini FAQAT shu admin(lar) ko'radi va tasdiqlaydi/rad etadi.
// WITHDRAW_ADMIN_IDS (vergul bilan) bo'lmasa — 585108093 (egasi talabi, 2026-11-01).
const DEFAULT_WITHDRAW_ADMINS = "585108093";
function withdrawAdminIds() {
    return [...new Set((process.env.WITHDRAW_ADMIN_IDS || DEFAULT_WITHDRAW_ADMINS).split(",")
        .map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0))];
}
function isWithdrawAdmin(id) {
    return withdrawAdminIds().includes(Number(id));
}
function toWithdrawAdmins(send) {
    return Promise.all(withdrawAdminIds().map(id =>
        Promise.resolve().then(() => send(id)).catch(err => console.log("PUL YECHISH XABAR XATO:", id, err?.message))
    ));
}

function withdrawBotToken() {
    return process.env.WITHDRAW_BOT_TOKEN || process.env.BOT_TOKEN;
}

// Pul yechish adminiga Markdown xabar + Tasdiqlash/Rad etish tugmalari.
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
    return toWithdrawAdmins((id) => sendToAdmin(id, text, withdrawKeyboard(request.id), fetchImpl));
}

module.exports = { notifyWithdrawRequest, withdrawRequestText, withdrawKeyboard, withdrawBotToken, withdrawAdminIds, isWithdrawAdmin };
