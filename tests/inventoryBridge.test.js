const test = require("node:test");
const assert = require("node:assert/strict");

const bridge = require("../inventoryBridge");

// Mongo o'rnidagi soxta ombor — sayt va bot alohida jarayonlar, lekin
// ikkalasi ham shu bitta "ombor" orqali gaplashadi.
function fakeStore() {
    const docs = new Map();
    return {
        docs,
        readDoc: async (id) => (docs.has(id) ? structuredClone(docs.get(id)) : null),
        writeDoc: async (id, data) => { docs.set(id, structuredClone(data)); },
        removeDoc: async (id) => { docs.delete(id); },
        listIds: async (prefix) => [...docs.keys()].filter(k => k.startsWith(prefix)),
    };
}

const ITEMS = [{ assetId: "1", marketHashName: "AK-47 | Redline (Field-Tested)" }];

test("bridge: sayt so'rov qoldiradi, bot inventarni oladi, sayt natijani qaytaradi", async () => {
    const store = fakeStore();
    let now = 1_000_000;
    const fetched = [];
    const deps = {
        ...store,
        now: () => now,
        sleep: async (ms) => {
            now += ms;
            // Bot shu "vaqt" ichida o'z navbatini bajaradi
            await bridge.processPendingRequests({ ...store, now: () => now, fetchInventory: async (sid, force) => { fetched.push([sid, force]); return ITEMS; } });
        },
    };
    const items = await bridge.requestInventory("765", { force: true }, deps);
    assert.deepEqual(items, ITEMS);
    assert.deepEqual(fetched, [["765", true]]);
    // So'rov hujjati bot tomonidan o'chirilgan
    assert.equal(store.docs.has("invReq_765"), false);
});

test("bridge: yangi (3 daqiqadan yosh) natija bo'lsa botni kutmaydi", async () => {
    const store = fakeStore();
    const now = 5_000_000;
    await store.writeDoc("inv_765", { items: ITEMS, fetchedAt: now - 60_000, error: null });
    let slept = false;
    const items = await bridge.requestInventory("765", {}, { ...store, now: () => now, sleep: async () => { slept = true; } });
    assert.deepEqual(items, ITEMS);
    assert.equal(slept, false);
    assert.equal(store.docs.has("invReq_765"), false);
});

test("bridge: botdagi Steam xatosi userga o'sha matn bilan chiqadi", async () => {
    const store = fakeStore();
    let now = 1_000_000;
    const deps = {
        ...store,
        now: () => now,
        sleep: async (ms) => {
            now += ms;
            await bridge.processPendingRequests({ ...store, now: () => now, fetchInventory: async () => { throw new Error("Steam inventaringiz yopiq (private)"); } });
        },
    };
    await assert.rejects(bridge.requestInventory("765", {}, deps), /yopiq \(private\)/);
});

test("bridge: bot ishlamasa vaqt tugaganda tushunarli xato", async () => {
    const store = fakeStore();
    let now = 1_000_000;
    const deps = { ...store, now: () => now, sleep: async (ms) => { now += ms; } };
    await assert.rejects(bridge.requestInventory("765", {}, deps), /keyinroq/);
});

test("bridge: bot ishlamasa, lekin avval olingan inventar bo'lsa — xato o'rniga o'sha qaytadi", async () => {
    const store = fakeStore();
    let now = 9_000_000;
    // 2 soat oldingi natija: "yangi" emas, lekin bot javob bermasa shu ko'rsatiladi
    await store.writeDoc("inv_765", { items: ITEMS, fetchedAt: now - 2 * 3600_000, error: null });
    const deps = { ...store, now: () => now, sleep: async (ms) => { now += ms; } };
    assert.deepEqual(await bridge.requestInventory("765", { force: true }, deps), ITEMS);
});

test("bridge: Steam xato bersa ham oxirgi yaxshi inventar yo'qolmaydi va ko'rsatiladi", async () => {
    const store = fakeStore();
    let now = 9_000_000;
    await store.writeDoc("inv_765", { items: ITEMS, fetchedAt: now - 2 * 3600_000, error: null });
    const deps = {
        ...store,
        now: () => now,
        sleep: async (ms) => {
            now += ms;
            await bridge.processPendingRequests({ ...store, now: () => now, fetchInventory: async () => { throw new Error("Steam hozir band, 1-2 daqiqadan keyin urinib ko'ring"); } });
        },
    };
    assert.deepEqual(await bridge.requestInventory("765", { force: true }, deps), ITEMS);
    // Ikkinchi marta ham (xato hujjati eski inventarni bosib ketmagan bo'lishi kerak)
    assert.deepEqual(await bridge.requestInventory("765", { force: true }, deps), ITEMS);
});

test("bridge: eski natija (so'rovdan oldingi) yangi so'rovga javob deb olinmaydi", async () => {
    const store = fakeStore();
    let now = 9_000_000;
    // 10 daqiqa oldingi eski natija — yangi so'rov uni qaytarmasligi kerak
    await store.writeDoc("inv_765", { items: [{ assetId: "old" }], fetchedAt: now - 600_000, error: null });
    const deps = {
        ...store,
        now: () => now,
        sleep: async (ms) => {
            now += ms;
            await bridge.processPendingRequests({ ...store, now: () => now, fetchInventory: async () => ITEMS });
        },
    };
    assert.deepEqual(await bridge.requestInventory("765", {}, deps), ITEMS);
});
