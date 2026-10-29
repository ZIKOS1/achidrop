// Avtomatik trade offer — sayt tomonidagi ko'rinish qoidalari.
// Bot (VPS) har tsiklda `tradeBotHeartbeat` hujjatiga vaqt yozadi; sayt bot
// tirikligini shundan biladi. Bot o'chiq paytda navbatda qolib ketgan offer
// userga "failed" bo'lib ko'rinadi — eski qo'lda oqim (trade link) chiqadi.
const HEARTBEAT_ID = "tradeBotHeartbeat";
const BOT_ALIVE_MS = 60 * 1000;
const STUCK_MS = 10 * 60 * 1000; // bot/tradeOfferWorker.js QUEUED_MAX_MS bilan bir xil

function isBotAlive(heartbeat, now = Date.now()) {
    return !!heartbeat?.at && now - heartbeat.at < BOT_ALIVE_MS;
}

// tradeUrl (userning trade tokeni) javobga chiqmaydi.
function viewTradeOffer(tradeOffer, createdAt, now = Date.now()) {
    if (!tradeOffer) return null;
    const { tradeUrl, ...view } = tradeOffer;
    if ((view.state === "queued" || view.state === "sending") && now - Date.parse(createdAt) > STUCK_MS) {
        return { ...view, state: "failed", error: "Bot javob bermadi" };
    }
    return view;
}

module.exports = { HEARTBEAT_ID, isBotAlive, viewTradeOffer };
