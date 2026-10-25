// Skin sotish tranzaksiyalari haqiqiy MongoDB'da (xotiradagi replica set —
// tranzaksiya uchun kerak): faqat kerakli elementlar o'qiladi/yoziladi
// (readTxWhere/updateTx), pul bir marta tushadi, lokal kesh va diff bazasi
// to'g'ri yangilanadi (keyingi write("users") balansni qayta $inc qilmaydi).
const test = require("node:test");
const assert = require("node:assert/strict");
const { MongoMemoryReplSet } = require("mongodb-memory-server-core");

let rs, mongoose, db, ism, stores;
const UID = 111, OTHER = 222;

async function doc(id) { return (await stores.findOne({ _id: id }))?.data; }

test.before(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    process.env.MONGODB_URI = rs.getUri();
    process.env.LIS_SKINS_API_KEY = "test";
    global.fetch = async () => { throw new Error("tarmoq testda yo'q"); };
    mongoose = require("mongoose");
    db = require("../backend/database/db");
    ism = require("../backend/instantSellManager");
    await db.connect();
    stores = mongoose.connection.db.collection("stores");
    await stores.insertMany([
        { _id: "users", data: [
            { id: UID, name: "A", balance: 1000, balanceHistory: [] },
            { id: OTHER, name: "B", balance: 5 },
        ] },
        { _id: "tradeBalances", data: [{ userId: OTHER, entries: [] }] },
        { _id: "instantSellRequests", data: [
            { id: 1, groupId: 1, userId: OTHER, items: [{ assetId: "9" }], totalSom: 7, status: "credited" },
        ] },
    ]);
    for (const f of ["users", "tradeBalances", "instantSellRequests"]) await db.refresh(f);
});

test.after(async () => {
    await mongoose.disconnect();
    await rs.stop();
});

const item = (assetId) => ({ assetId, marketHashName: `Skin ${assetId}`, name: `Skin ${assetId}`, imageUrl: null, float: 0.1 });

test("create → markSent → approve: pul bir marta, ledger, kesh va diff bazasi", async () => {
    const price = new Map([["a1", 2_000_000], ["a2", 3_000_000]]);
    const c = await ism.createSellRequest(UID, [item("a1"), item("a2")], { priceByAsset: price });
    assert.equal(c.requests.length, 2);
    assert.equal(c.requests[0].groupId, c.requests[1].groupId);
    assert.notEqual(c.requests[0].id, c.requests[1].id);
    assert.equal((await doc("instantSellRequests")).length, 3);
    assert.equal(ism.getAllRequests().length, 3, "lokal keshga qo'shildi");

    // Bir skin ikki ochiq so'rovda bo'lmaydi
    const dup = await ism.createSellRequest(UID, [item("a1")], { priceByAsset: price });
    assert.equal(dup.error, "already_requested");

    const [r1, r2] = c.requests;
    const s = await ism.markSent(UID, [r1.id, r2.id]);
    assert.equal(s.requests.length, 2);
    assert.equal((await ism.markSent(UID, [r1.id])).requests.length, 0, "ikkinchi marta belgilanmaydi");
    assert.equal((await ism.markSent(OTHER, [r2.id])).requests.length, 0, "boshqa userniki emas");
    assert.ok((await doc("instantSellRequests")).find(r => r.id === r1.id).sentAt);

    const a = await ism.approveSellRequest(r1.id);
    assert.equal(a.request.status, "credited");
    assert.equal((await ism.approveSellRequest(r1.id)).error, "wrong_state", "ikki marta bosilsa pul qayta tushmaydi");

    const users = await doc("users");
    assert.equal(users.find(u => u.id === UID).balance, 1000 + 2_000_000);
    assert.equal(users.find(u => u.id === UID).balanceHistory.length, 1);
    assert.equal(users.find(u => u.id === OTHER).balance, 5, "boshqa userga tegilmadi");
    const ledger = (await doc("tradeBalances")).find(l => l.userId === UID);
    assert.equal(ledger.entries.length, 1);
    assert.equal(ledger.entries[0].amount, 2_000_000);
    assert.equal(ledger.entries[0].holdMs, ism.SELL_HOLD_MS);
    assert.equal((await doc("instantSellRequests")).find(r => r.id === r1.id).status, "credited");

    // Lokal kesh yangilangan
    const cachedUser = db.read("users").find(u => u.id === UID);
    assert.equal(cachedUser.balance, 1000 + 2_000_000);
    assert.equal(ism.getInstantSellRequest(r1.id).status, "credited");

    // Diff bazasi ham yangilangan: boshqa maydonni yozish balansni qayta qo'shmasligi kerak
    const arr = db.read("users");
    arr.find(u => u.id === UID).name = "A2";
    db.write("users", arr);
    await new Promise(r => setTimeout(r, 300));
    const after = (await doc("users")).find(u => u.id === UID);
    assert.equal(after.name, "A2");
    assert.equal(after.balance, 1000 + 2_000_000, "balans ikki marta qo'shilmadi");
});

test("reject: faqat awaiting_admin, pulga tegmaydi", async () => {
    const r2 = ism.getAllRequests().find(r => r.userId === UID && r.status === "awaiting_admin");
    const before = (await doc("users")).find(u => u.id === UID).balance;
    const r = await ism.rejectSellRequest(r2.id, "kelmadi");
    assert.equal(r.request.status, "rejected");
    assert.equal(r.request.rejectReason, "kelmadi");
    assert.equal((await ism.rejectSellRequest(r2.id, "x")).error, "wrong_state");
    assert.equal((await ism.approveSellRequest(r2.id)).error, "wrong_state");
    assert.equal((await doc("users")).find(u => u.id === UID).balance, before);
    assert.equal(ism.getInstantSellRequest(r2.id).status, "rejected");
    assert.equal((await ism.approveSellRequest(999)).error, "not_found");
});

test("approve: ledger'i bo'lmagan user uchun yangi ledger yaratiladi", async () => {
    await stores.updateOne({ _id: "instantSellRequests" }, { $push: { data: { id: 50, groupId: 50, userId: OTHER, items: [{ assetId: "z" }], totalSom: 10, status: "awaiting_admin" } } });
    await stores.updateOne({ _id: "tradeBalances" }, { $set: { data: [] } });
    const a = await ism.approveSellRequest(50);
    assert.equal(a.request.status, "credited");
    const l = (await doc("tradeBalances")).find(x => x.userId === OTHER);
    assert.equal(l.entries.length, 1);
    const u = (await doc("users")).find(x => x.id === OTHER);
    assert.equal(u.balance, 15);
    assert.equal(u.balanceHistory.length, 1, "balanceHistory yo'q edi — yaratildi");
});

test("refresh(): v o'zgarmasa qayta yuklamaydi, boshqa jarayon yozsa yuklaydi", async () => {
    await db.refresh("users");
    const ref = db.read("users");
    await db.refresh("users");
    assert.equal(db.read("users"), ref, "o'zgarmagan — o'sha massiv");
    await stores.updateOne({ _id: "users" }, { $set: { "data.0.name": "tashqi", v: "boshqa" } });
    await db.refresh("users");
    assert.equal(db.read("users")[0].name, "tashqi");
});

test("pul yechish: so'rov → tasdiq balansdan bir marta ayiradi; bekor qilish", async () => {
    const bm = require("../backend/balanceManager");
    const old = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    await stores.updateOne({ _id: "tradeBalances" }, { $set: { data: [{ userId: UID, entries: [
        { id: "e1", amount: 500, receivedAt: old, withdrawalStatus: null },
        { id: "e2", amount: 300, receivedAt: old, withdrawalStatus: null },
    ] }] } });
    await db.refresh("tradeBalances");
    await db.refresh("users");
    const start = (await doc("users")).find(u => u.id === UID).balance;

    const rev = await bm.reverseTradeCreditEntry(UID, "e2", "test");
    assert.equal(rev.deducted, 300);
    assert.equal((await doc("users")).find(u => u.id === UID).balance, start - 300);
    assert.equal((await bm.reverseTradeCreditEntry(UID, "e2", "test")).error, "already_reversed");

    const { request } = await bm.requestWithdrawal(UID, "8600000000000000");
    assert.equal(request.amount, 500);
    assert.equal((await bm.requestWithdrawal(UID, "8600000000000000")).error, "nothing_available", "ikkinchi so'rov yo'q");

    await bm.approveWithdrawal(request.id);
    assert.equal((await bm.approveWithdrawal(request.id)).error, "not_found", "ikki marta tasdiqlanmaydi");
    const u = (await doc("users")).find(x => x.id === UID);
    assert.equal(u.balance, start - 300 - 500);
    assert.equal(u.balanceHistory.at(-1).amount, -500);
    assert.equal(db.read("users").find(x => x.id === UID).balance, start - 800, "lokal kesh");

    // Diff bazasi: boshqa maydon yozilsa balans qayta ayirilmaydi
    const arr = db.read("users");
    arr.find(x => x.id === UID).name = "A3";
    db.write("users", arr);
    await new Promise(r => setTimeout(r, 300));
    assert.equal((await doc("users")).find(x => x.id === UID).balance, start - 800);
});

test("unlockFrozenEntries: eng uzoq kutiladiganidan ochadi, katta yozuvni bo'ladi", () => {
    const bm = require("../backend/balanceManager");
    const now = Date.parse("2026-10-25T00:00:00Z");
    const day = 24 * 3600 * 1000;
    const entries = [
        { id: "old", amount: 1000, receivedAt: new Date(now - 6 * day).toISOString(), withdrawalStatus: null },  // 1 kun qoldi
        { id: "new", amount: 3000, receivedAt: new Date(now - 1 * day).toISOString(), withdrawalStatus: null },  // 6 kun qoldi
        { id: "pend", amount: 500, receivedAt: new Date(now - 1 * day).toISOString(), withdrawalStatus: "pending" },
        { id: "ripe", amount: 700, receivedAt: new Date(now - 9 * day).toISOString(), withdrawalStatus: null },
    ];
    assert.equal(bm.unlockFrozenEntries(entries, 3500, "X", now), 3500);
    const s = bm.summarizeHoldEntries(entries, now);
    assert.equal(s.available, 700 + 3500);
    assert.equal(s.frozen, 500, "old'dan 500 qoldi");
    assert.equal(s.pending, 500);
    assert.equal(entries.find(e => e.id === "new").promoUnlock, "X");
    assert.equal(entries.reduce((n, e) => n + e.amount, 0), 1000 + 3000 + 500 + 700, "jami summa o'zgarmadi");
});

test("unlockWithPromo: muzlatilganni ochadi, limitlar, faqat withdraw turi", async () => {
    const bm = require("../backend/balanceManager");
    const recent = new Date(Date.now() - 3600 * 1000).toISOString();
    await stores.updateOne({ _id: "users" }, { $set: { "data.$[u].balance": 5_000_000 } }, { arrayFilters: [{ "u.id": UID }] });
    await stores.updateOne({ _id: "tradeBalances" }, { $set: { data: [{ userId: UID, entries: [
        { id: "f1", amount: 3_000_000, receivedAt: recent, withdrawalStatus: null },
    ] }] } });
    await stores.updateOne({ _id: "promos" }, { $set: { data: [
        { code: "WD2M", type: "withdraw", unlockSom: 2_000_000, active: true, maxUse: 2, perUserLimit: 1, usedBy: [], usedCount: 0 },
        { code: "BAL", type: "balance", bonus: 15, active: true, usedBy: [], usedCount: 0 },
    ] } }, { upsert: true });
    await db.refresh("tradeBalances");
    await db.refresh("users");

    assert.equal((await bm.unlockWithPromo(UID, "BAL")).error, "not_found", "boshqa turdagi kod ishlamaydi");
    assert.equal((await bm.unlockWithPromo(OTHER, "wd2m")).error, "nothing_frozen", "muzlatilgani yo'q");
    let p = (await doc("promos")).find(x => x.code === "WD2M");
    assert.equal(p.usedCount, 0, "muzlatilgani yo'q bo'lsa kod sarflanmaydi");

    const r = await bm.unlockWithPromo(UID, " wd2m ");
    assert.equal(r.unlocked, 2_000_000);
    const h = bm.getHoldSummary(UID);
    assert.equal(h.available, 2_000_000);
    assert.equal(h.frozen, 1_000_000);
    assert.equal((await bm.unlockWithPromo(UID, "WD2M")).error, "already_used");
    p = (await doc("promos")).find(x => x.code === "WD2M");
    assert.equal(p.usedCount, 1);

    const { request } = await bm.requestWithdrawal(UID, "8600000000000000");
    assert.equal(request.amount, 2_000_000, "ochilgan summa yechiladi");
});
