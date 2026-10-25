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
