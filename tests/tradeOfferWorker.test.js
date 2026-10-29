const test = require("node:test");
const assert = require("node:assert/strict");
const { createWorker } = require("../bot/tradeOfferWorker");

const T0 = Date.parse("2026-10-29T10:00:00.000Z");
const MIN = 60_000;
const TURL = "https://steamcommunity.com/tradeoffer/new/?partner=1&token=abcd";

// instantSellManager o'rnidagi xotiradagi soxta ombor (Task 3 bilan bir xil interfeys).
function fakeStore(requests) {
    const rejected = [];
    return {
        requests, rejected,
        refreshRequests: async () => {},
        getTradeOfferGroups(states) {
            const m = new Map();
            for (const r of requests) {
                if (!r.tradeOffer || !states.includes(r.tradeOffer.state)) continue;
                const g = m.get(r.groupId) || { groupId: r.groupId, userId: r.userId, tradeOffer: r.tradeOffer, requests: [] };
                g.requests.push(r); m.set(r.groupId, g);
            }
            return [...m.values()];
        },
        async setTradeOfferState(groupId, from, fields) {
            let n = 0;
            for (const r of requests) if (r.groupId === groupId && from.includes(r.tradeOffer?.state)) { r.tradeOffer = { ...r.tradeOffer, ...fields }; n++; }
            return n;
        },
        async rejectSellRequest(id, reason) {
            const r = requests.find(x => x.id === id);
            if (r.status !== "awaiting_admin") return { error: "wrong_state" };
            r.status = "rejected"; r.rejectReason = reason; rejected.push([id, reason]);
            return { request: r };
        },
    };
}

function group(state, extra = {}, status = "awaiting_admin") {
    const to = { state, tradeUrl: TURL, offerId: null, sentAt: null, error: null, ...extra };
    return [
        { id: 11, groupId: 11, userId: 5, items: [{ assetId: "a1" }], status, createdAt: new Date(T0).toISOString(), tradeOffer: { ...to } },
        { id: 12, groupId: 11, userId: 5, items: [{ assetId: "a2" }], status, createdAt: new Date(T0).toISOString(), tradeOffer: { ...to } },
    ];
}

function fakeSteam({ ready = true, sendFails = 0, state = "Active", stateThrows = false } = {}) {
    const s = { sent: [], canceled: [], sendFails, state };
    Object.assign(s, {
        ready: () => ready,
        async send(o) { if (s.sendFails-- > 0) throw new Error("Steam xato 26"); s.sent.push(o); return "9001"; },
        async getState() { if (stateThrows) throw new Error("sessiya yo'q"); return s.state; },
        async cancel(id) { s.canceled.push(id); if (stateThrows) throw new Error("sessiya yo'q"); },
    });
    return s;
}

function setup(reqs, steamOpts, now = T0) {
    const store = fakeStore(reqs);
    const steam = fakeSteam(steamOpts);
    const admin = [], user = [];
    const clock = { now };
    const w = createWorker({ now: () => clock.now, steam, store, notifyAdmins: async (t, rs) => admin.push([t, rs]), notifyUser: async (u, t) => user.push([u, t]) });
    return { w, store, steam, admin, user, clock };
}

test("sendQueued: bitta offer, izoh AchiDrop #<g>, barcha assetId, state sent", async () => {
    const { w, store, steam } = setup(group("queued"));
    await w.sendQueued();
    assert.deepEqual(steam.sent, [{ tradeUrl: TURL, assetIds: ["a1", "a2"], message: "AchiDrop #11" }]);
    for (const r of store.requests) {
        assert.equal(r.tradeOffer.state, "sent");
        assert.equal(r.tradeOffer.offerId, "9001");
        assert.equal(r.tradeOffer.sentAt, new Date(T0).toISOString());
    }
});

test("sendQueued ikki marta → offer bir marta", async () => {
    const { w, steam } = setup(group("queued"));
    await w.sendQueued();
    await w.sendQueued();
    assert.equal(steam.sent.length, 1);
});

test("send bir marta xato → qayta urinadi va yuboradi", async () => {
    const { w, store, steam } = setup(group("queued"), { sendFails: 1 });
    await w.sendQueued();
    assert.equal(steam.sent.length, 1);
    assert.equal(store.requests[0].tradeOffer.state, "sent");
});

test("send ikki marta xato → failed, xato saqlanadi, userga xabar", async () => {
    const { w, store, user } = setup(group("queued"), { sendFails: 2 });
    await w.sendQueued();
    assert.equal(store.requests[0].tradeOffer.state, "failed");
    assert.equal(store.requests[0].tradeOffer.error, "Steam xato 26");
    assert.equal(store.requests[0].status, "awaiting_admin");
    assert.equal(user.length, 1);
});

test("akkaunt tayyor emas → yubormaydi; 10 daqiqadan eski queued → failed", async () => {
    const a = setup(group("queued"), { ready: false }, T0 + 9 * MIN);
    await a.w.sendQueued();
    assert.equal(a.steam.sent.length, 0);
    assert.equal(a.store.requests[0].tradeOffer.state, "queued");
    const b = setup(group("queued"), { ready: false }, T0 + 11 * MIN);
    await b.w.sendQueued();
    assert.equal(b.steam.sent.length, 0);
    assert.equal(b.store.requests[0].tradeOffer.state, "failed");
});

test("recoverStale: sending → failed, adminga xabar", async () => {
    const { w, store, admin } = setup(group("sending"));
    await w.recoverStale();
    assert.equal(store.requests[0].tradeOffer.state, "failed");
    assert.equal(store.requests[0].tradeOffer.error, "Bot qayta ishga tushdi, offer holati noma'lum");
    assert.equal(admin.length, 1);
});

const sentAt = new Date(T0).toISOString();

test("pollSent Accepted → accepted, reject yo'q, admin xabari bir marta", async () => {
    const { w, store, admin } = setup(group("sent", { offerId: "9001", sentAt }), { state: "Accepted" }, T0 + 5 * MIN);
    await w.pollSent();
    await w.pollSent();
    assert.equal(store.requests[0].tradeOffer.state, "accepted");
    assert.equal(store.rejected.length, 0);
    assert.equal(admin.length, 1);
    assert.match(admin[0][0], /AchiDrop #11/);
    assert.equal(admin[0][1].length, 2);
});

test("pollSent Declined → hamma request rejected 'Trade rad etildi'", async () => {
    const { w, store, user } = setup(group("sent", { offerId: "9001", sentAt }), { state: "Declined" }, T0 + 5 * MIN);
    await w.pollSent();
    assert.deepEqual(store.rejected, [[11, "Trade rad etildi"], [12, "Trade rad etildi"]]);
    assert.equal(store.requests[0].tradeOffer.state, "declined");
    assert.equal(user.length, 2);
});

test("pollSent InvalidItems → 'Skin inventarda topilmadi'", async () => {
    const { w, store } = setup(group("sent", { offerId: "9001", sentAt }), { state: "InvalidItems" }, T0 + 5 * MIN);
    await w.pollSent();
    assert.deepEqual(store.rejected[0], [11, "Skin inventarda topilmadi"]);
    assert.equal(store.requests[0].tradeOffer.state, "invalid");
});

test("pollSent Active: 59 daqiqa — hech narsa; 61 daqiqa — cancel + rejected", async () => {
    const a = setup(group("sent", { offerId: "9001", sentAt }), { state: "Active" }, T0 + 59 * MIN);
    await a.w.pollSent();
    assert.equal(a.steam.canceled.length, 0);
    assert.equal(a.store.requests[0].tradeOffer.state, "sent");
    const b = setup(group("sent", { offerId: "9001", sentAt }), { state: "Active" }, T0 + 61 * MIN);
    await b.w.pollSent();
    assert.deepEqual(b.steam.canceled, ["9001"]);
    assert.deepEqual(b.store.rejected, [[11, "Trade 1 soat ichida qabul qilinmadi"], [12, "Trade 1 soat ichida qabul qilinmadi"]]);
    assert.equal(b.store.requests[0].tradeOffer.state, "expired");
});

test("admin allaqachon credited qilgan → cancel, state canceled, reject yo'q", async () => {
    const { w, store, steam } = setup(group("sent", { offerId: "9001", sentAt }, "credited"), { state: "Active" }, T0 + 5 * MIN);
    await w.pollSent();
    assert.deepEqual(steam.canceled, ["9001"]);
    assert.equal(store.requests[0].tradeOffer.state, "canceled");
    assert.equal(store.rejected.length, 0);
});

test("getState xato (eski akkaunt): 30 daqiqa — hech narsa; 61 daqiqa — cancel urinish + rejected", async () => {
    const a = setup(group("sent", { offerId: "9001", sentAt }), { stateThrows: true }, T0 + 30 * MIN);
    await a.w.pollSent();
    assert.equal(a.store.requests[0].tradeOffer.state, "sent");
    const b = setup(group("sent", { offerId: "9001", sentAt }), { stateThrows: true }, T0 + 61 * MIN);
    await b.w.pollSent();
    assert.deepEqual(b.steam.canceled, ["9001"]);
    assert.equal(b.store.requests[0].tradeOffer.state, "expired");
    assert.equal(b.store.rejected.length, 2);
});

test("InEscrow → escrow, adminga xabar (hold), keyin Accepted → accepted", async () => {
    const { w, store, steam, admin } = setup(group("sent", { offerId: "9001", sentAt }), { state: "InEscrow" }, T0 + 5 * MIN);
    await w.pollSent();
    assert.equal(store.requests[0].tradeOffer.state, "escrow");
    assert.match(admin[0][0], /hold/i);
    steam.state = "Accepted";
    await w.pollSent();
    assert.equal(store.requests[0].tradeOffer.state, "accepted");
    assert.equal(admin.length, 2);
});
