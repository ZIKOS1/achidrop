const test = require("node:test");
const assert = require("node:assert/strict");

const lis = require("../backend/lisSkinsPrice");
const bm = require("../backend/balanceManager");
const ism = require("../backend/instantSellManager");

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

// Soxta Lis API: haqiqiy API kabi so'ralgan nomlarning qatorlarini narx
// bo'yicha o'sish tartibida, BITTA sahifada (200 qator) qaytaradi.
function fakeLis(rowsByName) {
    const urls = [];
    const fetch = async (url) => {
        urls.push(url);
        const names = new URL(url).searchParams.getAll("names[]");
        const rows = names.flatMap(n => rowsByName[n] || [])
            .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0))
            .slice(0, 200);
        return { ok: true, json: async () => ({ data: rows, meta: { next_cursor: rows.length === 200 ? "x" : null } }) };
    };
    return { urls, fetch };
}

test("fetchLisPricesUsd: har nom alohida so'raladi, eng arzon narx, noto'g'ri narx e'tiborsiz", async () => {
    process.env.LIS_SKINS_API_KEY = "test";
    lis._clearCache();
    const orig = global.fetch;
    const fake = fakeLis({
        A: [{ name: "A", price: 5.5 }, { name: "A", price: 4.2 }],
        B: [{ name: "B", price: "abc" }],
        C: [{ name: "C", price: 0 }],
    });
    global.fetch = fake.fetch;
    try {
        const m = await lis.fetchLisPricesUsd(["A", "B", "C", "A"]);
        assert.equal(fake.urls.length, 3);
        assert.equal(m.get("A"), 4.2);
        assert.equal(m.get("B"), null);
        assert.equal(m.get("C"), null);
        // Kesh: ikkinchi chaqiruv A uchun so'rov yubormaydi
        await lis.fetchLisPricesUsd(["A"]);
        assert.equal(fake.urls.length, 3);
    } finally { global.fetch = orig; delete process.env.LIS_SKINS_API_KEY; lis._clearCache(); }
});

test("fetchLisPricesUsd: arzon skin minglab e'lon bilan sahifani to'ldirsa ham qimmat skin narxi topiladi", async () => {
    process.env.LIS_SKINS_API_KEY = "test";
    lis._clearCache();
    const orig = global.fetch;
    const caseRows = Array.from({ length: 5000 }, (_, i) => ({ name: "Fracture Case", price: 0.37 + i / 10000 }));
    const fake = fakeLis({
        "Fracture Case": caseRows,
        "AWP | Asiimov (Field-Tested)": [{ name: "AWP | Asiimov (Field-Tested)", price: 97.96 }],
    });
    global.fetch = fake.fetch;
    try {
        const m = await lis.fetchLisPricesUsd(["Fracture Case", "AWP | Asiimov (Field-Tested)"]);
        assert.equal(m.get("Fracture Case"), 0.37);
        assert.equal(m.get("AWP | Asiimov (Field-Tested)"), 97.96);
    } finally { global.fetch = orig; delete process.env.LIS_SKINS_API_KEY; lis._clearCache(); }
});

test("fetchLisPricesUsd: bitta nom uchun API xatosi boshqalarini buzmaydi", async () => {
    process.env.LIS_SKINS_API_KEY = "test";
    lis._clearCache();
    const orig = global.fetch;
    const fake = fakeLis({ A: [{ name: "A", price: 2 }] });
    global.fetch = async (url) => {
        if (new URL(url).searchParams.getAll("names[]").includes("BAD")) return { ok: false, status: 500 };
        return fake.fetch(url);
    };
    try {
        const m = await lis.fetchLisPricesUsd(["A", "BAD"]);
        assert.equal(m.get("A"), 2);
        assert.equal(m.get("BAD"), null);
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

    const many = Array.from({ length: ism.MAX_OPEN_REQUESTS_PER_USER }, (_, i) => ({ id: i + 1, userId: 5, status: "awaiting_admin", items: [{ assetId: String(i) }] }));
    assert.equal(ism.validateNewRequest(many, 5, ["999"]).error, "too_many_open");
});

test("validateNewRequest: bir sotuvning har-skin so'rovlari (bitta groupId) bitta ochiq sotuv hisoblanadi", () => {
    const group = Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, groupId: 100, userId: 7, status: "awaiting_admin", items: [{ assetId: "g" + i }] }));
    assert.deepEqual(ism.validateNewRequest(group, 7, ["new"]), { ok: true });
    assert.deepEqual(ism.validateNewRequest(group, 7, ["g3"]), { error: "already_requested", assetIds: ["g3"] });
});

test("createSellRequest: $0.15 dan arzon skin jami $10 dan kam sotuvda rad etiladi", async () => {
    const buff = require("../backend/buffPrice");
    const orig = global.fetch;
    process.env.LIS_SKINS_API_KEY = "test";
    global.fetch = async (url) => {
        if (String(url) !== buff.FEED_URL) throw new Error("kutilmagan so'rov: " + url);
        const feed = { "Cheap": { highest_order: { price: 0.1 } }, "Mid": { highest_order: { price: 2 } } };
        for (let i = 0; i < 1000; i++) feed[`filler ${i}`] = { highest_order: { price: 1 } };
        return { ok: true, json: async () => feed };
    };
    try {
        const r = await ism.createSellRequest(1, [
            { assetId: "1", marketHashName: "Cheap" },
            { assetId: "2", marketHashName: "Mid" },
        ]);
        assert.deepEqual(r, { error: "too_cheap", assetIds: ["1"] });
    } finally { global.fetch = orig; delete process.env.LIS_SKINS_API_KEY; }
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

test("marginPercentForUsd: narx pog'onasiga qarab marja tanlanadi (chegara pog'onaga kiradi)", () => {
    const tiers = [{ maxUsd: 10, percent: 20 }, { maxUsd: 50, percent: 15 }, { maxUsd: null, percent: 10 }];
    assert.equal(lis.marginPercentForUsd(0.37, tiers), 20);
    assert.equal(lis.marginPercentForUsd(10, tiers), 20);
    assert.equal(lis.marginPercentForUsd(10.01, tiers), 15);
    assert.equal(lis.marginPercentForUsd(50, tiers), 15);
    assert.equal(lis.marginPercentForUsd(160, tiers), 10);
});

test("normalizeMarginTiers: to'g'ri pog'onalar qabul qilinadi, noto'g'rilari rad etiladi", () => {
    assert.deepEqual(
        lis.normalizeMarginTiers([{ maxUsd: "10", percent: "20" }, { maxUsd: "", percent: "10" }]),
        [{ maxUsd: 10, percent: 20 }, { maxUsd: null, percent: 10 }]
    );
    // oxirgisi cheksiz bo'lishi shart
    assert.equal(lis.normalizeMarginTiers([{ maxUsd: 10, percent: 20 }]), null);
    // o'sish tartibida bo'lishi shart
    assert.equal(lis.normalizeMarginTiers([{ maxUsd: 50, percent: 20 }, { maxUsd: 10, percent: 15 }, { maxUsd: null, percent: 10 }]), null);
    // foiz 0–99
    assert.equal(lis.normalizeMarginTiers([{ maxUsd: null, percent: 100 }]), null);
    assert.equal(lis.normalizeMarginTiers([{ maxUsd: null, percent: -1 }]), null);
    assert.equal(lis.normalizeMarginTiers([]), null);
    // o'rtadagi pog'ona cheksiz bo'lolmaydi
    assert.equal(lis.normalizeMarginTiers([{ maxUsd: null, percent: 20 }, { maxUsd: null, percent: 10 }]), null);
});

test("getMarginTiers: sozlanmagan bo'lsa eski bitta marja hamma narxga qo'llanadi", () => {
    assert.deepEqual(lis.marginTiersFromSettings({}), [{ maxUsd: null, percent: 12 }]);
    assert.deepEqual(lis.marginTiersFromSettings({ instantSellMarginPercent: 8 }), [{ maxUsd: null, percent: 8 }]);
    const tiers = [{ maxUsd: 10, percent: 20 }, { maxUsd: null, percent: 10 }];
    assert.deepEqual(lis.marginTiersFromSettings({ instantSellMarginPercent: 8, instantSellMarginTiers: tiers }), tiers);
    // buzilgan saqlangan qiymat — eski marjaga qaytadi
    assert.deepEqual(lis.marginTiersFromSettings({ instantSellMarginPercent: 8, instantSellMarginTiers: [{ maxUsd: 5, percent: 1 }] }), [{ maxUsd: null, percent: 8 }]);
});

test("instantSellPriceSomTiered: Lis narxi × 0.89 × kurs, keyin pog'onali marja", () => {
    assert.equal(lis.SELL_PRICE_RATIO, 0.89);
    // marja 0%: aynan Lis × 0.89 × kurs ($104.03 → so'm)
    assert.equal(lis.instantSellPriceSomTiered(104.03, 12700, [{ maxUsd: null, percent: 0 }]), Math.floor(104.03 * 0.89 * 12700));
    const tiers = [{ maxUsd: 10, percent: 20 }, { maxUsd: null, percent: 10 }];
    assert.equal(lis.instantSellPriceSomTiered(5, 12700, tiers), Math.floor(5 * 0.89 * 12700 * 0.8));
    assert.equal(lis.instantSellPriceSomTiered(100, 12700, tiers), Math.floor(100 * 0.89 * 12700 * 0.9));
    assert.equal(lis.instantSellPriceSomTiered(null, 12700, tiers), null);
});

test("publicStats: faqat tasdiqlangan (credited) so'rovlar; so'nggi sotuvlarda user ma'lumoti yo'q", () => {
    const reqs = [
        { id: 1, userId: 7, status: "credited", resolvedAt: "2026-10-15T10:00:00Z", totalSom: 30000,
          items: [{ marketHashName: "AK-47 | Redline (Field-Tested)", name: "AK-47 | Redline", imageUrl: "a.png", priceSom: 20000, assetId: "x1", float: 0.2 },
                  { marketHashName: "Revolution Case", name: "Revolution Case", imageUrl: "b.png", priceSom: 10000, assetId: "x2" }] },
        { id: 2, userId: 8, status: "awaiting_admin", totalSom: 99999, items: [{ marketHashName: "X", priceSom: 99999 }] },
        { id: 3, userId: 9, status: "rejected", totalSom: 5, items: [{ marketHashName: "Y", priceSom: 5 }] },
        { id: 4, userId: 7, status: "credited", resolvedAt: "2026-10-16T10:00:00Z", totalSom: 5000,
          items: [{ marketHashName: "Glock-18 | Wraiths (Field-Tested)", name: "Glock-18 | Wraiths", imageUrl: "c.png", priceSom: 5000, assetId: "x3" }] },
    ];
    const s = ism.publicStats(reqs);
    assert.equal(s.deals, 2);
    assert.equal(s.skins, 3);
    assert.equal(s.paidSom, 35000);
    assert.equal(s.recent[0].name, "Glock-18 | Wraiths"); // eng yangisi birinchi
    assert.deepEqual(Object.keys(s.recent[0]).sort(), ["at", "imageUrl", "name", "priceSom"]);
    assert.equal(s.recent.length, 3);
});

test("capHoldToBalance: admin balansni ayirsa, yechish summasi joriy balansdan oshmaydi", () => {
    const s = { frozen: 300, available: 1000, pending: 200, nextUnlockAt: "2026-11-01T00:00:00.000Z" };
    assert.deepEqual(bm.capHoldToBalance(s, 0), { frozen: 0, available: 0, pending: 0, nextUnlockAt: null });
    assert.deepEqual(bm.capHoldToBalance(s, 700), { frozen: 0, available: 500, pending: 200, nextUnlockAt: null });
    assert.deepEqual(bm.capHoldToBalance(s, 1300), { frozen: 100, available: 1000, pending: 200, nextUnlockAt: s.nextUnlockAt });
    assert.deepEqual(bm.capHoldToBalance(s, 5000), s);
});
