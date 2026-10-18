const test = require("node:test");
const assert = require("node:assert");
const { usdFromFeed, getBuffPricesUsd, _clearCache } = require("../backend/buffPrice");
const { buffSellPriceSom } = require("../backend/lisSkinsPrice");

const feed = {
    "AK-47 | Redline (Field-Tested)": { starting_at: { price: 25.04 }, highest_order: { price: 24.481 } },
    "No Order": { starting_at: { price: 3 }, highest_order: { price: 0 } },
    "Broken": { starting_at: { price: 3 } },
};
for (let i = 0; i < 1000; i++) feed[`filler ${i}`] = { highest_order: { price: 1 } };

test("usdFromFeed: faqat buy order > 0 bo'lgan nomlar", () => {
    const usd = usdFromFeed(feed, ["AK-47 | Redline (Field-Tested)", "No Order", "Broken", "Missing"]);
    assert.deepStrictEqual([...usd], [["AK-47 | Redline (Field-Tested)", 24.48]]);
    assert.strictEqual(usdFromFeed(null, ["a"]).size, 0);
});

test("getBuffPricesUsd: feed bir marta yuklanadi va keshlanadi", async () => {
    _clearCache();
    let calls = 0;
    const fake = async () => { calls++; return { ok: true, json: async () => feed }; };
    const a = await getBuffPricesUsd(["AK-47 | Redline (Field-Tested)", null], fake);
    const b = await getBuffPricesUsd(["AK-47 | Redline (Field-Tested)"], fake);
    assert.strictEqual(a.get("AK-47 | Redline (Field-Tested)"), 24.48);
    assert.strictEqual(b.size, 1);
    assert.strictEqual(calls, 1);
});

test("getBuffPricesUsd: feed yuklanmasa bo'sh Map (Lis formulasiga qaytadi)", async () => {
    _clearCache();
    const fake = async () => ({ ok: false, status: 503 });
    const usd = await getBuffPricesUsd(["AK-47 | Redline (Field-Tested)"], fake);
    assert.strictEqual(usd.size, 0);
});

test("buffSellPriceSom: SELL_PRICE_RATIO yo'q, faqat marja", () => {
    const tiers = [{ maxUsd: 10, percent: 20 }, { maxUsd: null, percent: 10 }];
    assert.strictEqual(buffSellPriceSom(1, 12700, tiers), 10160);
    assert.strictEqual(buffSellPriceSom(100, 12700, tiers), 1143000);
    assert.strictEqual(buffSellPriceSom(0, 12700, tiers), null);
});

test("getInstantSellPricesSom: BUFF buy order yo'q nomga narx yo'q (Lis'ga qaytmaydi)", async () => {
    const lis = require("../backend/lisSkinsPrice");
    const buff = require("../backend/buffPrice");
    _clearCache();
    const orig = global.fetch;
    const urls = [];
    global.fetch = async (url) => {
        urls.push(String(url));
        if (String(url) === buff.FEED_URL) return { ok: true, json: async () => feed };
        throw new Error("Lis so'ralmasligi kerak");
    };
    process.env.LIS_SKINS_API_KEY = "test";
    try {
        const m = await lis.getInstantSellPricesSom(["AK-47 | Redline (Field-Tested)", "No Order", "Missing"]);
        assert.ok(m.get("AK-47 | Redline (Field-Tested)") > 0);
        assert.strictEqual(m.has("No Order"), false);
        assert.strictEqual(m.has("Missing"), false);
        assert.deepStrictEqual(urls, [buff.FEED_URL]);
    } finally { global.fetch = orig; delete process.env.LIS_SKINS_API_KEY; _clearCache(); }
});
