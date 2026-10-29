const test = require("node:test");
const assert = require("node:assert/strict");
const { parseTradeUrl, validateTradeUrlFor, tradeUrlOwner } = require("../backend/tradeUrl");

const SID = "76561199047158059";
const URL_OK = "https://steamcommunity.com/tradeoffer/new/?partner=1086892331&token=AbC-d_12";

test("parseTradeUrl: to'g'ri havola", () => {
    const p = parseTradeUrl(URL_OK);
    assert.equal(p.steamId64, SID);
    assert.equal(p.partner, "1086892331");
    assert.equal(p.token, "AbC-d_12");
    assert.equal(p.url, URL_OK);
});

test("parseTradeUrl: http va &amp; normallashadi", () => {
    assert.equal(parseTradeUrl("http://steamcommunity.com/tradeoffer/new/?partner=1086892331&amp;token=AbC-d_12").url, URL_OK);
    assert.equal(parseTradeUrl("  " + URL_OK + "  ").url, URL_OK);
});

test("parseTradeUrl: noto'g'ri havolalar null", () => {
    assert.equal(parseTradeUrl("https://steamcommunlty.com/tradeoffer/new/?partner=1086892331&token=AbC-d_12"), null);
    assert.equal(parseTradeUrl("https://steamcommunity.com/tradeoffer/new/?partner=1086892331"), null);
    assert.equal(parseTradeUrl("https://steamcommunity.com/tradeoffer/new/?partner=abc&token=AbC"), null);
    assert.equal(parseTradeUrl("https://steamcommunity.com/id/foo"), null);
    assert.equal(parseTradeUrl(""), null);
    assert.equal(parseTradeUrl(null), null);
});

test("validateTradeUrlFor: o'z akkaunti", () => {
    assert.deepEqual(validateTradeUrlFor(URL_OK, SID), { ok: true, url: URL_OK });
});

test("validateTradeUrlFor: boshqa Steam akkaunt", () => {
    assert.deepEqual(validateTradeUrlFor(URL_OK, "76561198000000000"),
        { ok: false, error: "Bu trade havola saytga ulangan Steam akkauntingizga tegishli emas" });
});

test("validateTradeUrlFor: format xato", () => {
    assert.deepEqual(validateTradeUrlFor("salom", SID), { ok: false, error: "Trade havola formati noto'g'ri" });
});

test("tradeUrlOwner: boshqa userda shu Steam akkaunt havolasi", () => {
    const users = [
        { id: 1, steamTradeUrl: URL_OK },
        { id: 2, steamTradeUrl: "https://steamcommunity.com/tradeoffer/new/?partner=1086892331&token=ZZZZ" },
        { id: 3, steamTradeUrl: "https://steamcommunity.com/tradeoffer/new/?partner=5&token=a" },
        { id: 4 },
    ];
    assert.equal(tradeUrlOwner(users, SID, 1), 2);   // token boshqa bo'lsa ham
    assert.equal(tradeUrlOwner(users, SID, 99), 1);
    assert.equal(tradeUrlOwner([{ id: 1, steamTradeUrl: URL_OK }], SID, 1), null);
    assert.equal(tradeUrlOwner(users, "76561198000000000", 1), null);
});
