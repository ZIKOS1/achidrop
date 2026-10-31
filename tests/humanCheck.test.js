const test = require("node:test");
const assert = require("node:assert/strict");

process.env.TURNSTILE_SITE_KEY = "site";
process.env.TURNSTILE_SECRET = "secret";
const { makePass, isValidPass, verifyToken, PASS_TTL_MS } = require("../backend/humanCheck");

test("makePass/isValidPass: yangi pass yaroqli", () => {
    assert.equal(isValidPass(makePass(1000), 2000), true);
});

test("isValidPass: muddati o'tgan pass", () => {
    assert.equal(isValidPass(makePass(1000), 1000 + PASS_TTL_MS + 1), false);
});

test("isValidPass: soxta imzo yoki muddat", () => {
    const [exp, sig] = makePass(1000).split(".");
    assert.equal(isValidPass(`${Number(exp) + 1}.${sig}`, 2000), false);
    assert.equal(isValidPass(`${exp}.AAAA`, 2000), false);
    assert.equal(isValidPass("garbage", 2000), false);
    assert.equal(isValidPass("", 2000), false);
});

test("verifyToken: siteverify javobi", async () => {
    const ok = { fetch: async () => ({ json: async () => ({ success: true }) }) };
    const bad = { fetch: async () => ({ json: async () => ({ success: false }) }) };
    const err = { fetch: async () => { throw new Error("net"); } };
    assert.equal(await verifyToken("t", "1.2.3.4", ok), true);
    assert.equal(await verifyToken("t", "1.2.3.4", bad), false);
    assert.equal(await verifyToken("t", "1.2.3.4", err), false);
    assert.equal(await verifyToken("", "1.2.3.4", ok), false);
});
