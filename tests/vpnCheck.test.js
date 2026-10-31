const test = require("node:test");
const assert = require("node:assert/strict");
const { isVpnIp, _cache } = require("../backend/vpnCheck");

function deps(answer, calls = []) {
    return {
        now: () => 1000,
        fetch: async (url) => {
            calls.push(url);
            if (answer instanceof Error) throw answer;
            return { json: async () => answer };
        },
    };
}

test("isVpnIp: proxy=yes — VPN", async () => {
    _cache.clear();
    assert.equal(await isVpnIp("1.2.3.4", deps({ status: "ok", "1.2.3.4": { proxy: "yes" } })), true);
});

test("isVpnIp: proxy=no — oddiy IP", async () => {
    _cache.clear();
    assert.equal(await isVpnIp("5.6.7.8", deps({ status: "ok", "5.6.7.8": { proxy: "no" } })), false);
});

test("isVpnIp: natija keshlanadi", async () => {
    _cache.clear();
    const calls = [];
    const d = deps({ status: "ok", "1.2.3.4": { proxy: "yes" } }, calls);
    await isVpnIp("1.2.3.4", d);
    assert.equal(await isVpnIp("1.2.3.4", d), true);
    assert.equal(calls.length, 1);
});

test("isVpnIp: xizmat xatosi — bloklamaydi va keshlamaydi", async () => {
    _cache.clear();
    const calls = [];
    assert.equal(await isVpnIp("1.2.3.4", deps(new Error("timeout"), calls)), false);
    assert.equal(await isVpnIp("1.2.3.4", deps({ status: "denied", message: "limit" }, calls)), false);
    assert.equal(calls.length, 2);
    assert.equal(_cache.size, 0);
});

test("isVpnIp: lokal IP tekshirilmaydi", async () => {
    _cache.clear();
    const calls = [];
    assert.equal(await isVpnIp("127.0.0.1", deps({}, calls)), false);
    assert.equal(await isVpnIp("::ffff:192.168.1.5", deps({}, calls)), false);
    assert.equal(calls.length, 0);
});

test("isVpnIp: ::ffff: prefiksi olib tashlanadi", async () => {
    _cache.clear();
    assert.equal(await isVpnIp("::ffff:1.2.3.4", deps({ status: "ok", "1.2.3.4": { proxy: "yes" } })), true);
});
