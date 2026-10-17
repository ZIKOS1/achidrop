const test = require("node:test");
const assert = require("node:assert/strict");

const { createTokenStore } = require("../backend/tokenStore");

function fakeDeps(clock) {
    const docs = new Map();
    return {
        docs,
        now: () => clock.t,
        readDoc: async (id) => (docs.has(id) ? structuredClone(docs.get(id)) : null),
        writeDoc: async (id, data) => { docs.set(id, structuredClone(data)); },
        removeDoc: async (id) => { docs.delete(id); },
        listIds: async (prefix) => [...docs.keys()].filter(k => k.startsWith(prefix)),
        random: () => 1, // tasodifiy tozalash testda ishlamasin
    };
}

test("tokenStore: ketma-ket yaratilgan sessiyalar bir-birini o'chirmaydi", async () => {
    const clock = { t: 1_000_000 };
    const deps = fakeDeps(clock);
    const store = createTokenStore("sess_", 60_000, deps);
    const a = await store.create({ userId: 1 });
    const b = await store.create({ userId: 2 });
    assert.match(a, /^[a-f0-9]{64}$/);
    assert.equal((await store.get(a)).userId, 1);
    assert.equal((await store.get(b)).userId, 2);
});

test("tokenStore: muddati o'tgan sessiya qaytmaydi va o'chiriladi", async () => {
    const clock = { t: 1_000_000 };
    const deps = fakeDeps(clock);
    const store = createTokenStore("sess_", 60_000, deps);
    const a = await store.create({ userId: 1 });
    clock.t += 61_000;
    assert.equal(await store.get(a), null);
    assert.equal(deps.docs.size, 0);
});

test("tokenStore: destroy va noto'g'ri token", async () => {
    const deps = fakeDeps({ t: 1_000_000 });
    const store = createTokenStore("sess_", 60_000, deps);
    const a = await store.create({ userId: 1 });
    await store.destroy(a);
    assert.equal(await store.get(a), null);
    assert.equal(await store.get(""), null);
    assert.equal(await store.get("../users"), null);
    assert.equal(await store.get(null), null);
});

test("tokenStore: destroyWhere — masalan o'chirilgan admin akkauntining barcha sessiyalari", async () => {
    const deps = fakeDeps({ t: 1_000_000 });
    const store = createTokenStore("adm_", 60_000, deps);
    const a1 = await store.create({ accountId: "x" });
    const a2 = await store.create({ accountId: "x" });
    const b = await store.create({ accountId: "y" });
    await store.destroyWhere(s => s.accountId === "x");
    assert.equal(await store.get(a1), null);
    assert.equal(await store.get(a2), null);
    assert.equal((await store.get(b)).accountId, "y");
});
