// Skin sotish: adminga HAR SKIN uchun alohida Telegram xabari (o'zining
// "Oldim"/"Rad etish" tugmalari bilan). Sayt (user "yubordim" dedi) va bot
// (avtomatik trade qabul qilindi) bir xil formatdan foydalanadi.
// Taxminiy Lis avtosell: Lis'dagi eng arzon narx × LIS_AUTO_RATIO — admin
// "Oldim"dan oldin foyda bor-yo'qligini ko'rishi uchun (faqat ma'lumot).
// Lis xato bersa ham xabar baribir ketadi ("narx yo'q" bilan).
const lisSkinsPrice = require("./lisSkinsPrice");

const LIS_AUTO_RATIO = 0.9;

function mdEscape(text) {
    return String(text).replace(/([_*`\[])/g, "\\$1");
}

// → [{ text, keyboard }] (Markdown). note — xabar oxiridagi ko'rsatma.
async function sellAdminMessages(u, requests, note) {
    if (!requests.length) return [];
    let lisUsd = new Map();
    try { lisUsd = await lisSkinsPrice.fetchLisPricesUsd([...new Set(requests.map(r => r.items[0].marketHashName))]); }
    catch (err) { console.log("LIS AVTO NARX XATO:", err.message); }
    const rate = lisSkinsPrice.getUsdToSomRate();
    const autoText = (name) => {
        const usd = lisUsd.get(name);
        return Number.isFinite(usd) ? `Lis avto ≈ $${(usd * LIS_AUTO_RATIO).toFixed(2)} (${Math.round(usd * LIS_AUTO_RATIO * rate).toLocaleString()} so'm)` : "Lis avto: narx yo'q";
    };
    const who = `👤 ${mdEscape(u?.name ?? String(u?.id ?? requests[0].userId))}\n🪪 \`${u?.id ?? requests[0].userId}\`\n🎮 Steam: \`${u?.steamId64 ?? "?"}\``;
    return requests.map((r, i) => {
        const it = r.items[0];
        const line = `${it.marketHashName}${it.float != null ? ` (float ${it.float.toFixed(4)})` : ""}`;
        const part = requests.length > 1 ? ` (${i + 1}/${requests.length})` : "";
        return {
            text: `💸 *SKIN SOTISH #${r.id}*${part}\n\n${who}\n\n` +
                `🔫 ${mdEscape(line)}\n💰 *${r.totalSom.toLocaleString()} so'm*\n🤖 ${mdEscape(autoText(it.marketHashName))}\n\n${note}`,
            keyboard: { inline_keyboard: [[
                { text: "✅ Oldim", callback_data: `isell_ok_${r.id}` },
                { text: "❌ Rad etish", callback_data: `isell_no_${r.id}` },
            ]] },
        };
    });
}

module.exports = { sellAdminMessages, LIS_AUTO_RATIO, mdEscape };
