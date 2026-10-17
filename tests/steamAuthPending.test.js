const test = require("node:test");
const assert = require("node:assert/strict");

const auth = require("../backend/auth-steam");

// Mongo o'rnidagi soxta ombor — Vercel'ning turli nusxalari va VPS'dagi bot
// hammasi shu bitta omborni ko'radi.
function fakeStore(nowRef) {
    const docs = new Map();
    return {
        docs,
        now: () => nowRef.t,
        readDoc: async (id) => (docs.has(id) ? structuredClone(docs.get(id)) : null),
        writeDoc: async (id, data) => { docs.set(id, structuredClone(data)); },
        takeDoc: async (id) => { const d = docs.get(id) ?? null; docs.delete(id); return d; },
        removeDoc: async (id) => { docs.delete(id); },
        listIds: async (prefix) => [...docs.keys()].filter(k => k.startsWith(prefix)),
    };
}

test("steam auth: ketma-ket yaratilgan kodlar bir-birini o'chirmaydi", async () => {
    const store = fakeStore({ t: 1_000_000 });
    const a = await auth.createPendingAuth(null, "website", store);
    const b = await auth.createPendingAuth(5, "bidder", store);
    assert.deepEqual(await auth.peekPendingAuth(a, store), { tgId: null, purpose: "website", expiresAt: 1_000_000 + 600_000 });
    assert.equal((await auth.consumePendingAuth(a, store)).purpose, "website");
    assert.equal((await auth.consumePendingAuth(b, store)).tgId, 5);
});

test("steam auth: kod bir marta ishlatiladi", async () => {
    const store = fakeStore({ t: 1_000_000 });
    const a = await auth.createPendingAuth(null, "website", store);
    assert.ok(await auth.consumePendingAuth(a, store));
    assert.equal(await auth.consumePendingAuth(a, store), null);
});

test("steam auth: muddati o'tgan kod qabul qilinmaydi va keyingi yaratishda tozalanadi", async () => {
    const clock = { t: 1_000_000 };
    const store = fakeStore(clock);
    const old = await auth.createPendingAuth(null, "website", store);
    clock.t += 11 * 60_000;
    assert.equal(await auth.peekPendingAuth(old, store), null);
    assert.equal(await auth.consumePendingAuth(old, store), null);
    const old2 = await auth.createPendingAuth(null, "website", store);
    clock.t += 11 * 60_000;
    await auth.createPendingAuth(null, "website", store);
    assert.equal(store.docs.has(`steamAuth_${old2}`), false);
});

test("steam auth: noto'g'ri yoki bo'sh kod", async () => {
    const store = fakeStore({ t: 1_000_000 });
    assert.equal(await auth.peekPendingAuth("", store), null);
    assert.equal(await auth.consumePendingAuth("yoq", store), null);
    assert.equal(await auth.consumePendingAuth("../users", store), null);
});
