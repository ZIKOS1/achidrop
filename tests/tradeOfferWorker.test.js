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

function fakeSteam({ ready = true, sendFails = 0, state = "Active", stateThrows = false, createdDespiteError = false, cancelFails = false } = {}) {
    const s = { sent: [], canceled: [], sendFails, state, created: [] };
    Object.assign(s, {
        ready: () => ready,
        async send(o) {
            if (s.sendFails-- > 0) {
                // Steam ba'zan offerni yaratib, baribir xato (timeout/5xx) qaytaradi.
                if (createdDespiteError) s.created.push({ id: "7777", message: o.message });
                throw new Error("Steam xato 26");
            }
            s.sent.push(o); s.created.push({ id: "9001", message: o.message }); return "9001";
        },
        async findSentOffer(message) { return s.created.find((c) => c.message === message)?.id || null; },
        async getState() { if (stateThrows) throw new Error("sessiya yo'q"); return s.state; },
        async cancel(id) { s.canceled.push(id); if (stateThrows || cancelFails) throw new Error("sessiya yo'q"); },
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

test("getState xato (eski akkaunt): 30 daqiqa — hech narsa; 61 daqiqa — unknown, rad ETILMAYDI, admin ogohlantiriladi", async () => {
    const a = setup(group("sent", { offerId: "9001", sentAt }), { stateThrows: true }, T0 + 30 * MIN);
    await a.w.pollSent();
    assert.equal(a.store.requests[0].tradeOffer.state, "sent");
    const b = setup(group("sent", { offerId: "9001", sentAt }), { stateThrows: true }, T0 + 61 * MIN);
    await b.w.pollSent();
    await b.w.pollSent();
    assert.deepEqual(b.steam.canceled, ["9001"]);
    assert.equal(b.store.requests[0].tradeOffer.state, "unknown");
    assert.equal(b.store.requests[0].status, "awaiting_admin");
    assert.equal(b.store.rejected.length, 0);
    assert.equal(b.admin.length, 1, "admin bir marta ogohlantiriladi");
});

test("1 soat: cancel muvaffaqiyatsiz (user o'sha zahoti qabul qilgan) → qayta o'qiladi, Accepted → accepted", async () => {
    const b = setup(group("sent", { offerId: "9001", sentAt }), { state: "Active", cancelFails: true }, T0 + 61 * MIN);
    const origCancel = b.steam.cancel;
    b.steam.cancel = async (id) => { b.steam.state = "Accepted"; return origCancel(id); };
    await b.w.pollSent();
    assert.equal(b.store.requests[0].tradeOffer.state, "accepted");
    assert.equal(b.store.rejected.length, 0);
});

test("send xato, lekin Steam offerni yaratgan → ikkinchi offer YUBORILMAYDI, mavjudi olinadi", async () => {
    const { w, store, steam } = setup(group("queued"), { sendFails: 1, createdDespiteError: true });
    await w.sendQueued();
    assert.equal(steam.sent.length, 0, "qayta send chaqirilmagan");
    assert.equal(store.requests[0].tradeOffer.state, "sent");
    assert.equal(store.requests[0].tradeOffer.offerId, "7777");
});

test("admin guruhning BIR qismini rad etdi → offer bekor, qolgani failed (qo'lda oqim)", async () => {
    const reqs = group("sent", { offerId: "9001", sentAt });
    reqs[1].status = "rejected";
    const { w, store, steam } = setup(reqs, { state: "Active" }, T0 + 5 * MIN);
    await w.pollSent();
    assert.deepEqual(steam.canceled, ["9001"]);
    assert.equal(store.requests[0].tradeOffer.state, "failed");
    assert.equal(store.requests[0].status, "awaiting_admin");
});

test("user qabul qilgan, admin bir skinni allaqachon 'Oldim' qilgan → accepted (bekor emas)", async () => {
    const reqs = group("sent", { offerId: "9001", sentAt });
    reqs[0].status = "credited";
    const { w, store, steam, admin } = setup(reqs, { state: "Accepted" }, T0 + 5 * MIN);
    await w.pollSent();
    assert.equal(steam.canceled.length, 0);
    assert.equal(store.requests[1].tradeOffer.state, "accepted");
    assert.equal(admin.length, 1);
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

test("scheduleTradeOfferLoop: send/poll recoverStale TUGAGANDAN keyin boshlanadi; heartbeat yoziladi", async () => {
    const { scheduleTradeOfferLoop } = require("../bot/tradeOfferWorker");
    const registered = [];
    let releaseRecover;
    const order = [];
    const worker = {
        recoverStale: () => new Promise((r) => { releaseRecover = () => { order.push("recover"); r(); }; }),
        sendQueued: async () => order.push("send"),
        pollSent: async () => order.push("poll"),
    };
    const beats = [];
    const started = scheduleTradeOfferLoop({
        every: (ms, name, fn) => registered.push({ ms, name, fn }),
        syncAccount: async () => order.push("sync"),
        processLogin: async () => order.push("login"),
        heartbeat: async () => beats.push(1),
        worker,
    });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(registered.map((x) => x.name), ["login"], "recover tugamaguncha faqat login");
    releaseRecover();
    await started;
    assert.deepEqual(registered.map((x) => x.name), ["login", "send", "poll"]);
    await registered[1].fn();
    assert.deepEqual(order.slice(-2), ["sync", "send"]);
    assert.ok(beats.length >= 1, "send tsiklida heartbeat");
});

test("Accepted + notifyAccepted → umumiy xabar emas, guruh notifyAccepted'ga bir marta", async () => {
    const store = fakeStore(group("sent", { offerId: "9001", sentAt: new Date(T0).toISOString() }));
    const steam = fakeSteam({ state: "Accepted" });
    const admin = [], accepted = [];
    const w = createWorker({ now: () => T0 + 5 * MIN, steam, store, notifyAdmins: async (t) => admin.push(t), notifyUser: async () => {}, notifyAccepted: async (g) => accepted.push(g) });
    await w.pollSent();
    await w.pollSent();
    assert.equal(admin.length, 0);
    assert.equal(accepted.length, 1);
    assert.deepEqual(accepted[0].requests.map(r => r.id), [11, 12]);
});

test("sellAdminMessages: har skin alohida, nomi, narx, Lis avto, Oldim/Rad tugmalari", async () => {
    const lis = require("../backend/lisSkinsPrice");
    const orig = [lis.fetchLisPricesUsd, lis.getUsdToSomRate];
    lis.fetchLisPricesUsd = async () => new Map([["AK-47 | Redline (Field-Tested)", 10]]);
    lis.getUsdToSomRate = () => 12000;
    try {
        const { sellAdminMessages } = require("../backend/sellAdminNotify");
        const reqs = [
            { id: 11, userId: 5, totalSom: 100000, items: [{ marketHashName: "AK-47 | Redline (Field-Tested)", float: 0.2 }] },
            { id: 12, userId: 5, totalSom: 5000, items: [{ marketHashName: "P250 | Sand_Dune" }] },
        ];
        const m = await sellAdminMessages({ id: 5, name: "a_b", steamId64: "765" }, reqs, "NOTE");
        assert.equal(m.length, 2);
        assert.match(m[0].text, /SKIN SOTISH #11\*? \(1\/2\)/);
        assert.match(m[0].text, /AK-47 \| Redline/);
        assert.match(m[0].text, /100.?000 so'm/u);
        assert.match(m[0].text, /Lis avto ≈ \$9\.00 \(108/);
        assert.match(m[1].text, /Lis avto: narx yo'q/);
        assert.match(m[1].text, /Sand\\_Dune/);
        assert.match(m[0].text, /a\\_b/);
        assert.deepEqual(m[1].keyboard.inline_keyboard[0].map(b => b.callback_data), ["isell_ok_12", "isell_no_12"]);
    } finally { [lis.fetchLisPricesUsd, lis.getUsdToSomRate] = orig; }
});
