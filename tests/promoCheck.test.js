const test = require("node:test");
const assert = require("node:assert");
const { checkPromoForUser, markPromoUsed } = require("../backend/promoCheck");

const base = (over = {}) => ({ code: "X", active: true, maxUse: null, usedBy: [], usedCount: 0, ...over });

test("checkPromoForUser: perUserLimit 0 — bir kishi cheksiz marta ishlata oladi", () => {
    const p = base({ perUserLimit: 0 });
    for (let i = 0; i < 5; i++) {
        assert.deepStrictEqual(checkPromoForUser(p, 7), { ok: true });
        markPromoUsed(p, 7);
    }
});

test("checkPromoForUser: perUserLimit yo'q (eski kodlar) — bir kishi bir marta", () => {
    const p = base();
    assert.deepStrictEqual(checkPromoForUser(p, 7), { ok: true });
    markPromoUsed(p, 7);
    assert.deepStrictEqual(checkPromoForUser(p, 7), { error: "already_used" });
    assert.deepStrictEqual(checkPromoForUser(p, 8), { ok: true });
});

test("checkPromoForUser: perUserLimit 2 — ikkinchi marta mumkin, uchinchisi yo'q", () => {
    const p = base({ perUserLimit: 2 });
    markPromoUsed(p, 7);
    assert.deepStrictEqual(checkPromoForUser(p, 7), { ok: true });
    markPromoUsed(p, 7);
    assert.deepStrictEqual(checkPromoForUser(p, 7), { error: "already_used" });
});

test("checkPromoForUser: maxUse to'lsa — exhausted", () => {
    const p = base({ perUserLimit: 0, maxUse: 1 });
    markPromoUsed(p, 7);
    assert.deepStrictEqual(checkPromoForUser(p, 8), { error: "exhausted" });
});
