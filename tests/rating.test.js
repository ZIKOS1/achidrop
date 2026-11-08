const test = require("node:test");
const assert = require("node:assert");
const R = require("../backend/rating");

const T0 = Date.parse("2026-11-01T00:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

const instantSell = [
    { userId: 1, status: "credited", totalSom: 50000, resolvedAt: iso(T0 - 1000) },
    { userId: 1, status: "credited", totalSom: 20000, resolvedAt: iso(T0 + 1000) },
    { userId: 2, status: "credited", totalSom: 100000, resolvedAt: iso(T0 + 2000) },
    { userId: 2, status: "rejected", totalSom: 999999, resolvedAt: iso(T0 + 2000) },
    { userId: 3, status: "awaiting_admin", totalSom: 5000, resolvedAt: null },
];
const trades = [
    { sellerId: 3, status: "completed", agreedPrice: 30000, completedAt: iso(T0 + 3000) },
    { sellerId: 3, status: "cancelled", agreedPrice: 30000, completedAt: null },
];

test("collectSales: faqat credited/completed sotuvlar, admin chiqarib tashlanadi", () => {
    const s = R.collectSales({ instantSell, trades, excludeUser: (id) => id === 2 });
    assert.deepStrictEqual(s.map(x => x.userId).sort(), [1, 1, 3]);
});

test("tally: XP = xpPerSale + har 1000 so'mga xpPer1000Som", () => {
    const sales = R.collectSales({ instantSell, trades });
    const m = R.tally(sales, { xpPerSale: 10, xpPer1000Som: 1, adjustments: {} });
    assert.strictEqual(m.get("1").xp, 10 + 50 + 10 + 20);
    assert.strictEqual(m.get("2").xp, 10 + 100);
    assert.strictEqual(m.get("3").xp, 10 + 30);
});

test("konkurs: startAt'dan oldingi sotuvlar sanalmaydi (hamma 0 dan boshlaydi)", () => {
    const sales = R.collectSales({ instantSell, trades });
    const m = R.tally(sales, { xpPerSale: 0, xpPer1000Som: 2, adjustments: {} }, { from: T0 });
    assert.strictEqual(m.get("1").xp, 40);
    assert.strictEqual(m.get("1").sales, 1);
    const empty = R.tally(sales, { xpPerSale: 5, xpPer1000Som: 1, adjustments: {} }, { from: T0 + 10000 });
    assert.strictEqual(empty.size, 0);
});

test("adjustments: admin qo'shgan/ayirgan XP, 0 dan pastga tushmaydi", () => {
    const sales = R.collectSales({ instantSell, trades });
    const m = R.tally(sales, { xpPerSale: 10, xpPer1000Som: 1, adjustments: { 3: -1000, 9: 25 } });
    assert.strictEqual(m.get("3").xp, 0);
    assert.strictEqual(m.get("9").xp, 25);
    const ranked = R.rank(m);
    assert.deepStrictEqual(ranked.map(r => r.userId), [2, 1, 9]);
    assert.deepStrictEqual(ranked.map(r => r.rank), [1, 2, 3]);
});

test("tierInfo: chegaralar bo'yicha daraja va keyingisigacha progress", () => {
    const m = [0, 100, 300, 600, 1000, 2000];
    assert.strictEqual(R.tierInfo(0, m).tier, "bronze");
    assert.strictEqual(R.tierInfo(99, m).tier, "bronze");
    assert.strictEqual(R.tierInfo(100, m).tier, "silver");
    const t = R.tierInfo(200, m);
    assert.strictEqual(t.tier, "silver");
    assert.strictEqual(t.nextTier, "gold");
    assert.strictEqual(t.progress, 0.5);
    const top = R.tierInfo(5000, m);
    assert.strictEqual(top.tier, "legend");
    assert.strictEqual(top.nextTierXp, null);
    assert.strictEqual(top.progress, 1);
});

test("normalizeTierMins: 6 ta, 0 dan, o'sish tartibida", () => {
    assert.deepStrictEqual(R.normalizeTierMins([0, 1, 2, 3, 4, 5]), [0, 1, 2, 3, 4, 5]);
    assert.strictEqual(R.normalizeTierMins([1, 2, 3, 4, 5, 6]), null);
    assert.strictEqual(R.normalizeTierMins([0, 5, 5, 6, 7, 8]), null);
    assert.strictEqual(R.normalizeTierMins([0, 1, 2]), null);
    assert.deepStrictEqual(R.normalizeConfig({}).general.tierMins, R.DEFAULT_TIER_MINS);
});

test("contestState / currentContest", () => {
    const now = T0;
    const a = { id: 1, startAt: iso(T0 - 5000), endAt: iso(T0 + 5000) };
    const b = { id: 2, startAt: iso(T0 + 9000), endAt: null };
    const c = { id: 3, startAt: iso(T0 - 9000), endAt: null, closedAt: iso(T0 - 6000) };
    assert.strictEqual(R.contestState(a, now), "active");
    assert.strictEqual(R.contestState(b, now), "upcoming");
    assert.strictEqual(R.contestState(c, now), "finished");
    assert.strictEqual(R.currentContest([a, b, c], now).id, 1);
    assert.strictEqual(R.currentContest([b, c], now).id, 2);
    assert.strictEqual(R.currentContest([c], now).id, 3);
    assert.deepStrictEqual(R.contestWindow(c), { from: T0 - 9000, to: T0 - 6000 });
});
