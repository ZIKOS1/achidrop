const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { seal, open } = require("../backend/secretBox");

const K = crypto.randomBytes(32);

test("seal/open: aylanma va har safar boshqa natija", () => {
    const a = seal("p@ss", K), b = seal("p@ss", K);
    assert.equal(open(a, K), "p@ss");
    assert.notEqual(a, b);
    assert.ok(!a.includes("p@ss"));
});

test("open: boshqa kalit bilan ochilmaydi", () => {
    assert.throws(() => open(seal("x", K), crypto.randomBytes(32)), /ochib bo'lmadi/);
});

test("open: buzilgan ma'lumot ochilmaydi", () => {
    const parts = seal("secret", K).split(".");
    parts[3] = Buffer.from("other").toString("base64url");
    assert.throws(() => open(parts.join("."), K), /ochib bo'lmadi/);
});

test("kalit sozlanmagan bo'lsa xato", () => {
    const old = process.env.TRADE_ACCOUNT_KEY;
    delete process.env.TRADE_ACCOUNT_KEY;
    try { assert.throws(() => seal("x"), /TRADE_ACCOUNT_KEY sozlanmagan/); }
    finally { if (old !== undefined) process.env.TRADE_ACCOUNT_KEY = old; }
});
