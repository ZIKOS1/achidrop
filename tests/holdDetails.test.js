const test = require("node:test");
const assert = require("node:assert/strict");
const { holdDetails } = require("../backend/balanceManager");

const NOW = Date.parse("2026-11-01T12:00:00.000Z");
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();

test("holdDetails: muzlatilgan/yechsa bo'ladigan/so'ralgan, ochilish sanasi, chiqarilganlar yo'q", () => {
    const entries = [
        { id: "a", amount: 100, source: "instant_sell", tradeId: 1, receivedAt: iso(NOW - 2 * DAY), holdMs: 8.5 * DAY, withdrawalStatus: null },
        { id: "b", amount: 50, source: "trade", tradeId: 2, receivedAt: iso(NOW - 10 * DAY), withdrawalStatus: null },
        { id: "c", amount: 30, source: "instant_sell", tradeId: 3, receivedAt: iso(NOW - 20 * DAY), withdrawalStatus: "pending" },
        { id: "d", amount: 999, source: "instant_sell", tradeId: 4, receivedAt: iso(NOW - 30 * DAY), withdrawalStatus: "withdrawn" },
    ];
    const h = holdDetails(entries, 1000, NOW);
    assert.equal(h.frozen, 100);
    assert.equal(h.available, 50);
    assert.equal(h.pending, 30);
    assert.equal(h.nextUnlockAt, iso(NOW - 2 * DAY + 8.5 * DAY));
    assert.deepEqual(h.items.map(i => [i.id, i.state]), [["c", "pending"], ["b", "available"], ["a", "frozen"]]);
    const a = h.items.find(i => i.id === "a");
    assert.equal(a.unlockAt, iso(NOW + 6.5 * DAY));
    assert.equal(a.refId, 1);
});

test("holdDetails: umumiy summa balansdan oshmaydi; bo'sh ledger", () => {
    const entries = [{ id: "a", amount: 100, receivedAt: iso(NOW), withdrawalStatus: null }];
    assert.equal(holdDetails(entries, 40, NOW).frozen, 40);
    const empty = holdDetails([], 0, NOW);
    assert.deepEqual([empty.frozen, empty.available, empty.pending, empty.nextUnlockAt, empty.items.length], [0, 0, 0, null, 0]);
});
