const test = require("node:test");
const assert = require("node:assert/strict");
const { isBotAlive, viewTradeOffer } = require("../backend/tradeOfferView");

const NOW = Date.parse("2026-10-29T12:00:00.000Z");
const ago = (ms) => new Date(NOW - ms).toISOString();

test("isBotAlive: 1 daqiqadan yangi heartbeat — tirik", () => {
    assert.equal(isBotAlive({ at: NOW - 30_000 }, NOW), true);
    assert.equal(isBotAlive({ at: NOW - 61_000 }, NOW), false);
    assert.equal(isBotAlive(null, NOW), false);
});

test("viewTradeOffer: trade havola (token) chiqmaydi", () => {
    const v = viewTradeOffer({ state: "sent", tradeUrl: "https://x/?token=a", offerId: "1" }, ago(60_000), NOW);
    assert.deepEqual(v, { state: "sent", offerId: "1" });
});

test("viewTradeOffer: 10 daqiqadan eski queued/sending — failed (bot o'chiq, qo'lda oqim)", () => {
    assert.equal(viewTradeOffer({ state: "queued" }, ago(9 * 60_000), NOW).state, "queued");
    const v = viewTradeOffer({ state: "queued" }, ago(11 * 60_000), NOW);
    assert.equal(v.state, "failed");
    assert.equal(v.error, "Bot javob bermadi");
    assert.equal(viewTradeOffer({ state: "sending" }, ago(11 * 60_000), NOW).state, "failed");
    assert.equal(viewTradeOffer({ state: "sent" }, ago(11 * 60_000), NOW).state, "sent");
});

test("viewTradeOffer: null → null", () => {
    assert.equal(viewTradeOffer(null, ago(0), NOW), null);
});
