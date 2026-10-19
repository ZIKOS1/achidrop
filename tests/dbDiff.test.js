const test = require("node:test");
const assert = require("node:assert/strict");

const { diffArrayOps } = require("../backend/database/db");

test("db diff: faqat o'zgargan maydon, balans $inc, tarix $push", () => {
    const base = [{ id: 1, balance: 1000, balanceHistory: [{ a: 1 }], tradeLink: null }, { id: 2, balance: 5 }];
    const data = structuredClone(base);
    data[0].balance = 1100;
    data[0].balanceHistory.push({ a: 2 });
    data[0].tradeLink = "x";
    const ops = diffArrayOps("users", base, data);
    assert.equal(ops.length, 1); // 2-userga tegilmaydi
    assert.deepEqual(ops[0].updateOne.filter, { _id: "users", "data.id": 1 });
    assert.deepEqual(ops[0].updateOne.update, {
        $set: { "data.$.tradeLink": "x" },
        $inc: { "data.$.balance": 100 },
        $push: { "data.$.balanceHistory": { $each: [{ a: 2 }] } },
    });
});

test("db diff: yangi user $push (takrorlanmasin), o'chgan $pull, o'zgarishsiz — amal yo'q", () => {
    const base = [{ id: 1, n: "a" }, { id: 2, n: "b" }];
    assert.deepEqual(diffArrayOps("users", base, structuredClone(base)), []);
    const ops = diffArrayOps("users", base, [{ id: 1, n: "a" }, { id: 3, n: "c" }]);
    assert.deepEqual(ops, [
        { updateOne: { filter: { _id: "users", "data.id": { $ne: 3 } }, update: { $push: { data: { id: 3, n: "c" } } } } },
        { updateOne: { filter: { _id: "users" }, update: { $pull: { data: { id: 2 } } } } },
    ]);
});
