// Adminlarga avtomatik xabarlar (Vercel tomonida — VPS bot o'chsa ham ishlaydi):
//  1) Bot (VPS) o'chib qolsa — "Bot ishlamayapti!", qayta yonsa — "Bot qayta ishlayapti".
//     Bot har 10 s `tradeBotHeartbeat`ga vaqt yozadi; 2 daqiqadan eski bo'lsa — o'chgan.
//  2) Kunlik hisobot — Toshkent vaqti bilan 21:00 dan keyin, kuniga bir marta.
// Ikkalasi ham db.flipDocField orqali atomar — bir nechta Vercel nusxasi bo'lsa ham
// xabar bir marta ketadi. Ishga tushirish: /api so'rovlari (har nusxada 1 daqiqada
// bir marta) va Vercel Cron (/api/cron/ops).
const { dayKey } = require("./financeStats");

const BOT_DOWN_AFTER_MS = 2 * 60 * 1000;
const REPORT_HOUR = 21; // Toshkent
const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;
const HEALTH_DOC = "opsBotHealth";
const REPORT_DOC = "opsDailyReport";

const fmt = (n) => Math.round(n || 0).toLocaleString("ru-RU").replace(/\s/g, " ") + " so'm";
const mins = (ms) => Math.max(1, Math.round(ms / 60000));

// Sof: heartbeat bo'yicha bot holati. at — oxirgi signal vaqti (yo'q bo'lsa null).
function botStatus(heartbeat, now) {
    const at = heartbeat?.at || null;
    return { down: !at || now - at > BOT_DOWN_AFTER_MS, at };
}

async function checkBotHealth(deps) {
    const now = deps.now();
    const { down, at } = botStatus(await deps.readDoc("tradeBotHeartbeat"), now);
    if (down) {
        if (await deps.flipDocField(HEALTH_DOC, "down", true, { since: at || now })) {
            const ago = at ? `${mins(now - at)} daqiqa oldin` : "hech qachon";
            await deps.notifyAdmins(`🚨 *Bot ishlamayapti!*\n\nVPS'dagi bot ${ago} oxirgi marta signal bergan.\nTrade offerlar yuborilmayapti, sotuvlar qo'lda oqimga o'tadi.\n\nVPS'da tekshiring: \`pm2 status\` → \`pm2 restart auction-bot\``);
        }
    } else {
        const prev = await deps.readDoc(HEALTH_DOC);
        if (prev?.down && await deps.flipDocField(HEALTH_DOC, "down", false)) {
            const was = prev.since ? ` (${mins(now - prev.since)} daqiqa o'chiq edi)` : "";
            await deps.notifyAdmins(`✅ *Bot qayta ishlayapti*${was}. Trade offerlar yana avtomatik yuboriladi.`);
        }
    }
}

function tashkentNow(now) {
    const d = new Date(now + TZ_OFFSET_MS);
    return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

// Sof: kunlik hisobot matni. day — "YYYY-MM-DD" (Toshkent).
function buildDailyReport({ day, requests, withdrawals, profit, profitMissing, owedTotal, botDown }) {
    const today = (iso) => dayKey(iso) === day;
    const items = (rs) => rs.reduce((n, r) => n + (r.items?.length || 0), 0);
    const sum = (rs, k) => rs.reduce((n, r) => n + (r[k] || 0), 0);

    const created = requests.filter(r => today(r.createdAt));
    const credited = requests.filter(r => r.status === "credited" && today(r.resolvedAt));
    const rejected = requests.filter(r => r.status === "rejected" && today(r.resolvedAt));
    const awaiting = requests.filter(r => r.status === "awaiting_admin");
    const wdNew = withdrawals.filter(w => today(w.requestedAt));
    const wdPaid = withdrawals.filter(w => w.status === "approved" && today(w.resolvedAt));
    const wdPending = withdrawals.filter(w => w.status === "pending");

    const lines = [
        `📊 *Kunlik hisobot — ${day}*`,
        "",
        `🛒 Yangi sotuv so'rovlari: ${items(created)} ta skin (${fmt(sum(created, "totalSom"))})`,
        `✅ Olindi ("Oldim"): ${items(credited)} ta skin — ${fmt(sum(credited, "totalSom"))}`,
        `❌ Rad etildi: ${items(rejected)} ta skin`,
        `⏳ Hozir kutilmoqda: ${items(awaiting)} ta skin`,
        "",
        `💰 Taxminiy foyda (Lis): ${profit == null ? "—" : fmt(profit)}${profitMissing ? ` (${profitMissing} ta skin narxi topilmadi)` : ""}`,
        "",
        `💸 Pul yechish so'rovlari: ${wdNew.length} ta — ${fmt(sum(wdNew, "amount"))}`,
        `🏦 To'langan: ${wdPaid.length} ta — ${fmt(sum(wdPaid, "amount"))}`,
        `🕓 To'lanmagan so'rovlar: ${wdPending.length} ta — ${fmt(sum(wdPending, "amount"))}`,
        `📌 Jami to'lanishi kerak (hold bilan): ${fmt(owedTotal)}`,
        "",
        botDown ? "🚨 Bot: ishlamayapti!" : "🤖 Bot: ishlayapti",
    ];
    return lines.join("\n");
}

async function maybeSendDailyReport(deps) {
    const now = deps.now();
    const { day, hour } = tashkentNow(now);
    if (hour < REPORT_HOUR) return false;
    if (!await deps.flipDocField(REPORT_DOC, "lastDay", day)) return false;
    const data = await deps.loadReportData(day);
    await deps.notifyAdmins(buildDailyReport({ day, ...data, botDown: botStatus(await deps.readDoc("tradeBotHeartbeat"), now).down }));
    return true;
}

module.exports = { botStatus, checkBotHealth, buildDailyReport, maybeSendDailyReport, tashkentNow, BOT_DOWN_AFTER_MS };
