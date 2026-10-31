const test = require("node:test");
const assert = require("node:assert/strict");
const { realClientIp, isCloudflareIp } = require("../backend/clientIp");

test("isCloudflareIp: Cloudflare diapazonlari", () => {
    assert.equal(isCloudflareIp("104.16.1.1"), true);
    assert.equal(isCloudflareIp("::ffff:172.64.5.5"), true);
    assert.equal(isCloudflareIp("2606:4700::1"), true);
    assert.equal(isCloudflareIp("94.158.62.180"), false);
    assert.equal(isCloudflareIp(""), false);
});

test("realClientIp: Cloudflare'dan kelsa — CF-Connecting-IP", () => {
    assert.equal(realClientIp("162.158.1.1", "94.158.62.180"), "94.158.62.180");
});

test("realClientIp: Cloudflare'siz kelsa — sarlavha e'tiborsiz (soxtalashtirib bo'lmaydi)", () => {
    assert.equal(realClientIp("185.213.154.1", "94.158.62.180"), "185.213.154.1");
});

test("realClientIp: sarlavha yo'q yoki IP emas", () => {
    assert.equal(realClientIp("162.158.1.1", ""), "162.158.1.1");
    assert.equal(realClientIp("162.158.1.1", "not-an-ip"), "162.158.1.1");
});
