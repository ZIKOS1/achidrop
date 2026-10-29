const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

process.env.TRADE_ACCOUNT_KEY = crypto.randomBytes(32).toString("hex");
const bridge = require("../backend/tradeAccountBridge");
const { open } = require("../backend/secretBox");

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

// Sayt kutayotgan paytda bot o'z navbatini bajaradi (inventoryBridge testidagidek).
function siteDeps(store, login, clock = { now: 1_000_000 }) {
    return {
        ...store,
        now: () => clock.now,
        sleep: async (ms) => {
            clock.now += ms;
            if (login) await bridge.processLoginRequests({ ...store, now: () => clock.now, login });
        },
    };
}

const CREDS = { accountName: "achibot", password: "S3cret!", guardCode: "R7K2X" };
const okLogin = async () => ({ steamId64: "76561199000000001", refreshToken: "eyJ.refresh.tok", tokenExpiresAt: "2027-04-01T00:00:00.000Z" });

test("requestLogin → bot kiradi → akkaunt saqlanadi, parol hech qayerda yo'q", async () => {
    const store = fakeStore();
    const seen = [];
    const res = await bridge.requestLogin(CREDS, siteDeps(store, async (c) => { seen.push(c); return okLogin(); }));
    assert.equal(res.ok, true);
    assert.equal(res.account.accountName, "achibot");
    assert.equal(res.account.steamId64, "76561199000000001");
    assert.deepEqual(seen, [CREDS]);
    assert.deepEqual([...store.docs.keys()], ["tradeAccount"]);
    const acc = store.docs.get("tradeAccount");
    assert.equal(open(acc.refreshTokenSealed), "eyJ.refresh.tok");
    assert.ok(!JSON.stringify(acc).includes("S3cret!"));
    assert.ok(!("password" in acc) && !("passwordSealed" in acc));
    assert.equal(acc.lastError, null);
});

test("login xato → tushunarli xabar, akkaunt o'zgarmaydi", async () => {
    const store = fakeStore();
    await store.writeDoc("tradeAccount", { accountName: "old", steamId64: "1", refreshTokenSealed: "x", connectedAt: "a", tokenExpiresAt: null, lastError: null });
    const res = await bridge.requestLogin(CREDS, siteDeps(store, async () => { throw new Error("Login yoki parol noto'g'ri"); }));
    assert.deepEqual(res, { ok: false, error: "Login yoki parol noto'g'ri" });
    assert.equal(store.docs.get("tradeAccount").accountName, "old");
    assert.deepEqual([...store.docs.keys()], ["tradeAccount"]);
});

test("60 soniyadan eski so'rov tashlanadi", async () => {
    const store = fakeStore();
    await store.writeDoc("tradeLoginReq_x", { at: 0, accountName: "a", passwordSealed: "z", guardCode: "1" });
    let called = false;
    await bridge.processLoginRequests({ ...store, now: () => 61_000, login: async () => { called = true; } });
    assert.equal(called, false);
    assert.equal(store.docs.size, 0);
});

test("bot javob bermasa → timeout xabari, so'rov o'chiriladi", async () => {
    const store = fakeStore();
    const res = await bridge.requestLogin(CREDS, siteDeps(store, null));
    assert.deepEqual(res, { ok: false, error: "Bot javob bermadi. Bot serverda ishlayaptimi?" });
    assert.equal(store.docs.size, 0);
});

test("getAccount refresh token qaytarmaydi; disconnect", async () => {
    const store = fakeStore();
    await bridge.requestLogin(CREDS, siteDeps(store, okLogin));
    const acc = await bridge.getAccount(store);
    assert.deepEqual(Object.keys(acc).sort(), ["accountName", "connectedAt", "lastError", "steamId64", "tokenExpiresAt"]);
    const s = await bridge.loadSession(store);
    assert.equal(s.refreshToken, "eyJ.refresh.tok");
    await bridge.setLastError("Sessiya tugadi", store);
    assert.equal((await bridge.getAccount(store)).lastError, "Sessiya tugadi");
    await bridge.disconnect(store);
    assert.equal(await bridge.getAccount(store), null);
    assert.equal(await bridge.loadSession(store), null);
});

test("loginErrorText: EResult → o'zbekcha", () => {
    const { EResult } = require("steam-session");
    assert.equal(bridge.loginErrorText(EResult.InvalidPassword), "Login yoki parol noto'g'ri");
    assert.equal(bridge.loginErrorText(EResult.TwoFactorCodeMismatch), "Steam Guard kodi noto'g'ri yoki eskirgan");
    assert.equal(bridge.loginErrorText(EResult.RateLimitExceeded), "Steam juda ko'p urinish deb blokladi, 30 daqiqadan keyin urining");
    assert.equal(bridge.loginErrorText(EResult.Busy), "Steam'ga kirib bo'lmadi: Busy");
});
