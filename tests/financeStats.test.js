const test = require("node:test");
const assert = require("node:assert");
const { buildFinance, dayKey } = require("../backend/financeStats");

const requests = [
    { id: "r1", userId: 1, status: "credited", resolvedAt: "2026-10-20T10:00:00Z", items: [
        { marketHashName: "AK-47 | Redline (Field-Tested)", priceSom: 100000 },
        { marketHashName: "Unknown", priceSom: 5000 },
    ] },
    { id: "r2", userId: 2, status: "awaiting_admin", items: [{ marketHashName: "AK-47 | Redline (Field-Tested)", priceSom: 1 }] },
    { id: "r3", userId: 2, status: "rejected", items: [{ marketHashName: "X", priceSom: 999 }] },
];

test("foyda = Lis × kurs × 0.9 − to'langan; Lis narxi yo'q skin foydaga qo'shilmaydi", () => {
    const lisUsd = new Map([["AK-47 | Redline (Field-Tested)", 10]]);
    const f = buildFinance({ requests, lisUsd, rate: 12000, holds: [], users: [] });
    assert.strictEqual(f.skins, 2);
    assert.strictEqual(f.requests, 1);
    assert.strictEqual(f.awaiting, 1);
    assert.strictEqual(f.paid, 105000);
    assert.strictEqual(f.lisTotal, 108000);
    assert.strictEqual(f.profit, 8000);
    assert.strictEqual(f.missingLis, 1);
    assert.strictEqual(f.marginPercent, 8);
    assert.strictEqual(f.daily.length, 1);
    assert.strictEqual(f.daily[0].profit, 8000);
});

test("to'lanishi kerak — barcha hold summalari, kattasidan boshlab", () => {
    const holds = [
        { userId: 1, frozen: 100, available: 0, pending: 0, nextUnlockAt: "2026-11-02T00:00:00Z" },
        { userId: 2, frozen: 50, available: 300, pending: 20, nextUnlockAt: "2026-11-01T00:00:00Z" },
    ];
    const f = buildFinance({ requests: [], lisUsd: new Map(), rate: 1, holds, users: [{ id: 2, name: "Ali" }] });
    assert.strictEqual(f.owed.total, 470);
    assert.strictEqual(f.owed.users, 2);
    assert.strictEqual(f.owed.list[0].name, "Ali");
    assert.strictEqual(f.owed.nextUnlockAt, "2026-11-01T00:00:00Z");
});

test("dayKey Toshkent vaqti bo'yicha", () => {
    assert.strictEqual(dayKey("2026-10-20T20:00:00Z"), "2026-10-21");
});
