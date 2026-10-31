const test = require("node:test");
const assert = require("node:assert/strict");
const { botStatus, checkBotHealth, buildDailyReport, maybeSendDailyReport, tashkentNow } = require("../backend/opsAlerts");

// Soxta ombor: flipDocField — haqiqiy db kabi atomar bayroq.
function fakeDeps(now, docs = {}) {
    const sent = [];
    return {
        sent, docs,
        now: () => now,
        readDoc: async (id) => docs[id] ?? null,
        flipDocField: async (id, field, value, extra = {}) => {
            const d = docs[id] || (docs[id] = {});
            if (d[field] === value) return false;
            Object.assign(d, { [field]: value }, extra);
            return true;
        },
        notifyAdmins: async (text) => { sent.push(text); },
    };
}

test("botStatus: 2 daqiqadan eski signal — o'chgan", () => {
    assert.equal(botStatus({ at: 1000 }, 1000 + 60_000).down, false);
    assert.equal(botStatus({ at: 1000 }, 1000 + 121_000).down, true);
    assert.equal(botStatus(null, 5000).down, true);
});

test("checkBotHealth: o'chganda bir marta xabar, yonganda bir marta xabar", async () => {
    const T = 10_000_000;
    const d = fakeDeps(T, { tradeBotHeartbeat: { at: T - 5 * 60_000 } });
    await checkBotHealth(d);
    await checkBotHealth(d);
    assert.equal(d.sent.length, 1);
    assert.match(d.sent[0], /Bot ishlamayapti/);

    d.docs.tradeBotHeartbeat = { at: T };
    await checkBotHealth(d);
    await checkBotHealth(d);
    assert.equal(d.sent.length, 2);
    assert.match(d.sent[1], /qayta ishlayapti/);
});

test("checkBotHealth: bot doim ishlasa — xabar yo'q", async () => {
    const T = 10_000_000;
    const d = fakeDeps(T, { tradeBotHeartbeat: { at: T - 10_000 } });
    await checkBotHealth(d);
    assert.equal(d.sent.length, 0);
});

test("tashkentNow: UTC+5", () => {
    assert.deepEqual(tashkentNow(Date.parse("2026-10-31T16:30:00Z")), { day: "2026-10-31", hour: 21 });
    assert.deepEqual(tashkentNow(Date.parse("2026-10-31T19:30:00Z")), { day: "2026-11-01", hour: 0 });
});

test("buildDailyReport: bugungi raqamlar", () => {
    const day = "2026-10-31";
    const at = "2026-10-31T10:00:00Z";
    const text = buildDailyReport({
        day,
        requests: [
            { status: "credited", createdAt: at, resolvedAt: at, totalSom: 100000, items: [{}] },
            { status: "rejected", createdAt: at, resolvedAt: at, totalSom: 50000, items: [{}] },
            { status: "awaiting_admin", createdAt: "2026-10-30T10:00:00Z", totalSom: 30000, items: [{}, {}] },
        ],
        withdrawals: [
            { status: "approved", requestedAt: at, resolvedAt: at, amount: 70000 },
            { status: "pending", requestedAt: "2026-10-29T10:00:00Z", amount: 20000 },
        ],
        profit: 12000, profitMissing: 0, owedTotal: 500000, botDown: false,
    });
    assert.match(text, /Yangi sotuv so'rovlari: 2 ta skin/);
    assert.match(text, /Olindi \("Oldim"\): 1 ta skin — 100 000 so'm/);
    assert.match(text, /Hozir kutilmoqda: 2 ta skin/);
    assert.match(text, /To'langan: 1 ta — 70 000 so'm/);
    assert.match(text, /To'lanmagan so'rovlar: 1 ta — 20 000 so'm/);
    assert.match(text, /foyda \(Lis\): 12 000 so'm/);
});

test("maybeSendDailyReport: 21:00 dan oldin yubormaydi, keyin kuniga bir marta", async () => {
    const data = { requests: [], withdrawals: [], profit: null, profitMissing: 0, owedTotal: 0 };
    const before = fakeDeps(Date.parse("2026-10-31T15:00:00Z"));
    before.loadReportData = async () => data;
    assert.equal(await maybeSendDailyReport(before), false);

    const after = fakeDeps(Date.parse("2026-10-31T16:10:00Z"));
    after.loadReportData = async () => data;
    assert.equal(await maybeSendDailyReport(after), true);
    assert.equal(await maybeSendDailyReport(after), false);
    assert.equal(after.sent.length, 1);
});
