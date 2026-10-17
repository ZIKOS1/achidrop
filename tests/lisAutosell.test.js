const test = require("node:test");
const assert = require("node:assert");
const { parseCookie, envValue, summarize, lisGet, ownerPricesSom } = require("../backend/lisAutosell");

test("parseCookie: qiymat ichidagi = saqlanadi", () => {
    const c = parseCookie("a=1; XSRF-TOKEN=ab%3D%3D; b=x=y");
    assert.deepStrictEqual(c, { a: "1", "XSRF-TOKEN": "ab%3D%3D", b: "x=y" });
});

test("envValue: qo'shtirnoqli va bo'sh qiymatlar", () => {
    const text = "LIS_COOKIE='a=1; b=$x'\nLIS_EMAIL=\nLIS_SESSION_ID=abc\n";
    assert.strictEqual(envValue(text, "LIS_COOKIE"), "a=1; b=$x");
    assert.strictEqual(envValue(text, "LIS_EMAIL"), null);
    assert.strictEqual(envValue(text, "LIS_SESSION_ID"), "abc");
    assert.strictEqual(envValue(text, "NOPE"), null);
});

test("summarize: jami faqat sotiladiganlar, narx bo'yicha saralangan", () => {
    const s = summarize([
        { asset_id: 1, name: "A", price: 0.5, icon_url: "hash1", disabled_reason: null },
        { asset_id: 2, name: "B", price: 2.15, item_float: "0.12", disabled_reason: null },
        { asset_id: 3, name: "C", price: 9, disabled_reason: "unavailable" },
    ], { min_offer_sum: 50, sum_remaining: 0 });
    assert.deepStrictEqual(s.items.map(i => i.assetId), ["3", "2", "1"]);
    assert.strictEqual(s.totalUsd, 2.65);
    assert.strictEqual(s.sellableCount, 2);
    assert.strictEqual(s.minOfferUsd, 50);
    assert.strictEqual(s.instantRemainingUsd, 0);
    assert.strictEqual(s.items[2].imageUrl, "https://community.akamai.steamstatic.com/economy/image/hash1");
    assert.strictEqual(s.items[1].float, 0.12);
});

test("summarize: bo'sh/noto'g'ri javob", () => {
    const s = summarize(undefined, null);
    assert.strictEqual(s.items.length, 0);
    assert.strictEqual(s.totalUsd, 0);
    assert.strictEqual(s.minOfferUsd, null);
});

test("lisGet: 419 → cookie_expired, XSRF header dekodlanadi", async () => {
    let seen;
    const fake = async (url, opts) => { seen = opts.headers; return { status: 419, ok: false, text: async () => "" }; };
    await assert.rejects(lisGet("/x", { cookie: "XSRF-TOKEN=ab%3D", sessionId: "s1" }, fake), e => e.code === "cookie_expired");
    assert.strictEqual(seen["X-XSRF-TOKEN"], "ab=");
    assert.strictEqual(seen["x-session-id"], "s1");
});

test("ownerPricesSom: faqat Lis egasi va yangi ma'lumot uchun", () => {
    const now = 1_000_000_000;
    const state = { steamId: "765", fetchedAt: now - 60_000, items: [
        { assetId: "1", priceUsd: 2.15 }, { assetId: "2", priceUsd: 0 },
    ] };
    const m = ownerPricesSom(state, "765", 12700, now);
    assert.strictEqual(m.get("1"), 27305);
    assert.strictEqual(m.has("2"), false);
    assert.strictEqual(ownerPricesSom(state, "999", 12700, now), null);
    assert.strictEqual(ownerPricesSom(state, null, 12700, now), null);
    assert.strictEqual(ownerPricesSom({ ...state, fetchedAt: now - 25 * 3600_000 }, "765", 12700, now), null);
    assert.strictEqual(ownerPricesSom(null, "765", 12700, now), null);
});

test("lisGet: Cloudflare sahifasi tushunarli xato beradi", async () => {
    const fake = async () => ({ status: 200, ok: true, text: async () => "<title>Just a moment...</title>" });
    await assert.rejects(lisGet("/x", { cookie: "" }, fake), /Cloudflare/);
});
