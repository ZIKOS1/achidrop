// Obmen ichidagi xabarlashuv — real-time transport (WebSocket/Socket.io)
// loyihada mavjud emas, shu sabab "chat" shunchaki har xabarni ikkinchi
// tomonga botning o'zi orqali (Telegram DM) darhol yetkazish orqali ishlaydi;
// bu yerda faqat tarixni trade obyektiga yozib borish mantiqi bor.
const { read, write } = require("./database/db");

function getTrades() {
    const raw = read("trades");
    return Array.isArray(raw) ? raw : [];
}

function addChatMessage(tradeId, fromUserId, text) {
    const trades = getTrades();
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return { error: "not_found" };
    // Faqat shu obmenning sotuvchisi/xaridori yozishi mumkin — aks holda
    // istalgan foydalanuvchi boshqalarning obmeniga xabar yozib, botning
    // ishonchli bildirishnoma kanali orqali begona odamlarga yetkazib
    // yuborishi mumkin edi (spam/fishing).
    if (fromUserId !== trade.sellerId && fromUserId !== trade.buyerId) return { error: "forbidden" };

    if (!Array.isArray(trade.chatLog)) trade.chatLog = [];
    const message = { from: fromUserId, text, timestamp: new Date().toISOString() };
    trade.chatLog.push(message);
    trade.lastActivityAt = new Date().toISOString();
    write("trades", trades);
    return { trade, message };
}

module.exports = { addChatMessage };
