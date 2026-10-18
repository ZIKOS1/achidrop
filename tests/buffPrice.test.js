const test = require("node:test");
const assert = require("node:assert");
const { pickItem, fetchBuffItem, usdFromDoc, reqId } = require("../backend/buffPrice");
const { buffSellPriceSom } = require("../backend/lisSkinsPrice");

const body = { code: "OK", data: { items: [
    { market_hash_name: "Souvenir AK-47 | Redline (Field-Tested)", buy_max_price: "291", buy_num: 2, sell_min_price: "700" },
    { market_hash_name: "AK-47 | Redline (Field-Tested)", buy_max_price: "163", buy_num: 147, sell_min_price: "168" },
] } };

test("pickItem: faqat aynan shu nom, buy order 0 → null", () => {
    assert.deepStrictEqual(pickItem(body, "AK-47 | Redline (Field-Tested)"), { cny: 163, buyNum: 147, sellMinCny: 168 });
    assert.strictEqual(pickItem(body, "AK-47 | Redline (Minimal Wear)"), null);
    const zero = { data: { items: [{ market_hash_name: "X", buy_max_price: "0", buy_num: 0 }] } };
    assert.strictEqual(pickItem(zero, "X").cny, null);
    assert.strictEqual(pickItem(undefined, "X"), null);
});

test("fetchBuffItem: Login Required → cookie_expired, cookie header yuboriladi", async () => {
    let seen;
    const fake = async (url, opts) => { seen = { url, opts }; return { status: 200, text: async () => '{"code":"Login Required"}' }; };
    await assert.rejects(fetchBuffItem("A | B", "session=1", fake), e => e.code === "cookie_expired");
    assert.strictEqual(seen.opts.headers.Cookie, "session=1");
    assert.match(seen.url, /search=A\+%7C\+B/);
});

test("fetchBuffItem: System Error → xato (keyin qayta urinadi)", async () => {
    const fake = async () => ({ status: 200, text: async () => '{"code":"System Error"}' });
    await assert.rejects(fetchBuffItem("A", "c", fake), /System Error/);
});

test("usdFromDoc: yangi narx → usd, eski/yo'q → so'rovga", () => {
    const now = 1_000_000_000;
    const doc = { cnyPerUsd: 6.7, items: {
        fresh: { cny: 67, ts: now - 60_000 },
        stale: { cny: 67, ts: now - 2 * 3600_000 },
        old: { cny: 67, ts: now - 25 * 3600_000 },
        noOrder: { cny: null, ts: now - 60_000 },
    } };
    const { usd, need } = usdFromDoc(doc, ["fresh", "stale", "old", "noOrder", "missing"], now);
    assert.deepStrictEqual([...usd], [["fresh", 10], ["stale", 10]]);
    assert.deepStrictEqual(need, ["stale", "old", "missing"]);
    assert.strictEqual(usdFromDoc(null, ["a"], now).usd.size, 0);
});

test("reqId: barqaror va nomga bog'liq", () => {
    assert.strictEqual(reqId("A"), reqId("A"));
    assert.notStrictEqual(reqId("A"), reqId("B"));
    assert.match(reqId("A"), /^buffReq_[0-9a-f]{40}$/);
});

test("buffSellPriceSom: SELL_PRICE_RATIO yo'q, faqat marja", () => {
    const tiers = [{ maxUsd: 10, percent: 20 }, { maxUsd: null, percent: 10 }];
    assert.strictEqual(buffSellPriceSom(1, 12700, tiers), 10160);
    assert.strictEqual(buffSellPriceSom(100, 12700, tiers), 1143000);
    assert.strictEqual(buffSellPriceSom(0, 12700, tiers), null);
});
