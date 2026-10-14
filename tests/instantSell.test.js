const test = require("node:test");
const assert = require("node:assert/strict");

const lis = require("../lisSkinsPrice");
const bm = require("../balanceManager");
const ism = require("../instantSellManager");

test("instantSellPriceSom: Lis × kurs × (1 − marja), pastga yaxlitlanadi", () => {
    assert.equal(lis.instantSellPriceSom(10, 12700, 12), 111760);
    assert.equal(lis.instantSellPriceSom(1.01, 12700, 12), Math.floor(1.01 * 12700 * 0.88));
    assert.equal(lis.instantSellPriceSom(0, 12700, 12), null);
    assert.equal(lis.instantSellPriceSom(NaN, 12700, 12), null);
    assert.equal(lis.instantSellPriceSom(10, 12700, 100), null);
});

test("fetchLisPricesUsd: kalit yo'q bo'lsa so'rov yubormaydi, hammasi null", async () => {
    delete process.env.LIS_SKINS_API_KEY;
    let called = false;
    const orig = global.fetch;
    global.fetch = async () => { called = true; throw new Error("no"); };
    try {
        const m = await lis.fetchLisPricesUsd(["AK-47 | Redline (Field-Tested)"]);
        assert.equal(m.get("AK-47 | Redline (Field-Tested)"), null);
        assert.equal(called, false);
        assert.equal(lis.isLisConfigured(), false);
    } finally { global.fetch = orig; }
});

test("fetchLisPricesUsd: bitta so'rovda ko'p nom, eng arzon narx, noto'g'ri narx e'tiborsiz", async () => {
    process.env.LIS_SKINS_API_KEY = "test";
    lis._clearCache();
    const orig = global.fetch;
    const urls = [];
    global.fetch = async (url) => {
        urls.push(url);
        return { ok: true, json: async () => ({ data: [
            { name: "A", price: 5.5 }, { name: "A", price: 4.2 },
            { name: "B", price: "abc" }, { name: "C", price: 0 },
        ] }) };
    };
    try {
        const m = await lis.fetchLisPricesUsd(["A", "B", "C", "A"]);
        assert.equal(urls.length, 1);
        assert.equal(m.get("A"), 4.2);
        assert.equal(m.get("B"), null);
        assert.equal(m.get("C"), null);
        // Kesh: ikkinchi chaqiruv A uchun so'rov yubormaydi
        await lis.fetchLisPricesUsd(["A"]);
        assert.equal(urls.length, 1);
    } finally { global.fetch = orig; delete process.env.LIS_SKINS_API_KEY; lis._clearCache(); }
});

test("summarizeHoldEntries: Skin sotish puli 8 kun 12 soat ushlanadi, taymer vaqti beriladi", () => {
    const received = new Date("2026-10-01T00:00:00Z");
    const entries = [{ amount: 1000, receivedAt: received.toISOString(), holdMs: ism.SELL_HOLD_MS, withdrawalStatus: null }];
    const unlock = received.getTime() + (8 * 24 + 12) * 3600 * 1000;

    const before = bm.summarizeHoldEntries(entries, unlock - 1);
    assert.deepEqual(before, { frozen: 1000, available: 0, pending: 0, nextUnlockAt: new Date(unlock).toISOString() });

    const after = bm.summarizeHoldEntries(entries, unlock);
    assert.deepEqual(after, { frozen: 0, available: 1000, pending: 0, nextUnlockAt: null });
});

test("summarizeHoldEntries: holdMs yo'q eski yozuvlar 7 kun, eng yaqin ochilish tanlanadi", () => {
    const t0 = Date.parse("2026-10-01T00:00:00Z");
    const entries = [
        { amount: 500, receivedAt: new Date(t0).toISOString(), withdrawalStatus: null },
        { amount: 700, receivedAt: new Date(t0).toISOString(), holdMs: ism.SELL_HOLD_MS, withdrawalStatus: null },
        { amount: 900, receivedAt: new Date(t0).toISOString(), withdrawalStatus: "pending" },
        { amount: 100, receivedAt: new Date(t0).toISOString(), withdrawalStatus: "reversed" },
    ];
    const s = bm.summarizeHoldEntries(entries, t0 + 1000);
    assert.equal(s.frozen, 1200);
    assert.equal(s.pending, 900);
    assert.equal(s.nextUnlockAt, new Date(t0 + bm.HOLD_MS).toISOString());
});

test("validateNewRequest: bir skin ikki ochiq so'rovda bo'lmaydi, ochiq so'rovlar soni cheklangan", () => {
    const existing = [
        { userId: 1, status: "awaiting_admin", items: [{ assetId: "111" }] },
        { userId: 1, status: "credited", items: [{ assetId: "222" }] },
        { userId: 2, status: "awaiting_admin", items: [{ assetId: "333" }] },
    ];
    assert.deepEqual(ism.validateNewRequest(existing, 1, ["111", "444"]), { error: "already_requested", assetIds: ["111"] });
    assert.deepEqual(ism.validateNewRequest(existing, 1, ["222", "333"]), { ok: true });

    const many = Array.from({ length: ism.MAX_OPEN_REQUESTS_PER_USER }, (_, i) => ({ userId: 5, status: "awaiting_admin", items: [{ assetId: String(i) }] }));
    assert.equal(ism.validateNewRequest(many, 5, ["999"]).error, "too_many_open");
});

test("creditRequestInTx: balans + tarix + ledger (holdMs bilan) yoziladi", () => {
    const users = [{ id: 7, balance: 100 }];
    const ledgers = [];
    const now = new Date("2026-10-14T10:00:00Z");
    const request = { id: 42, userId: 7, totalSom: 50000, items: [{}, {}] };
    assert.equal(ism.creditRequestInTx(users, ledgers, request, now), true);
    assert.equal(users[0].balance, 50100);
    assert.equal(users[0].balanceHistory[0].amount, 50000);
    assert.equal(ledgers[0].entries[0].amount, 50000);
    assert.equal(ledgers[0].entries[0].holdMs, ism.SELL_HOLD_MS);
    assert.equal(ledgers[0].entries[0].source, "instant_sell");

    assert.equal(ism.creditRequestInTx([], [], request, now), false);
});
