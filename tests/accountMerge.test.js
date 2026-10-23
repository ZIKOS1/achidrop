const test = require("node:test");
const assert = require("node:assert/strict");

const { mergeAccountData } = require("../backend/accountMerge");

const STEAM = 2001883205091, TG = 165734785;

function sample() {
    return {
        users: [
            { id: STEAM, telegramId: null, name: "( SERVER )", balance: 2528808, steamId64: "765", tradeLink: "https://t/1",
              referrals: [6968773928], favorites: [1], wins: [], history: [], auctions: [], joined: "2026-10-23T07:31:27.462Z",
              balanceHistory: [{ amount: 292605, date: "2026-10-23T07:44:43.833Z" }, { amount: 2235203, date: "2026-10-23T08:01:46.033Z" }] },
            { id: TG, telegramId: TG, name: "cs_shot_bot", balance: 500, steamId64: "765", tradeLink: null,
              referrals: [], favorites: [1, 2], wins: [], history: [], auctions: [], joined: "2026-10-23T08:01:24.103Z",
              balanceHistory: [{ amount: 500, date: "2026-10-23T07:50:00.000Z" }] },
            { id: 6968773928, telegramId: 6968773928, balance: 1000, referrals: [STEAM] },
        ],
        tradeBalances: [
            { userId: STEAM, entries: [{ id: "a", amount: 292605 }, { id: "b", amount: 2235203 }] },
            { userId: TG, entries: [{ id: "c", amount: 500 }] },
        ],
        instantSellRequests: [{ id: 1, userId: STEAM }, { id: 2, userId: 999 }],
        notifications: [{ id: "n", userId: STEAM }],
        promos: [{ code: "X", usedBy: [STEAM, 5] }],
        trades: [{ id: 7, sellerId: STEAM, buyerId: 5 }],
    };
}

test("mergeAccountData: balans, tarix, ledger va havolalar Telegram akkauntiga o'tadi", () => {
    const d = sample();
    const r = mergeAccountData(d, STEAM, TG);
    assert.ok(!r.error);

    assert.equal(d.users.length, 2);
    assert.equal(d.users.find(u => u.id === STEAM), undefined);
    const tg = d.users.find(u => u.id === TG);
    assert.equal(tg.balance, 2528808 + 500);
    assert.deepEqual(tg.balanceHistory.map(h => h.amount), [292605, 500, 2235203]); // sana bo'yicha
    assert.equal(tg.telegramId, TG);
    assert.equal(tg.name, "cs_shot_bot");
    assert.equal(tg.tradeLink, "https://t/1"); // bo'sh maydon to'ldirildi
    assert.deepEqual(tg.referrals, [6968773928]);
    assert.deepEqual(tg.favorites, [1, 2]);
    assert.equal(tg.joined, "2026-10-23T07:31:27.462Z");
    assert.deepEqual(d.users.find(u => u.id === 6968773928).referrals, [TG]);

    assert.equal(d.tradeBalances.length, 1);
    assert.deepEqual(d.tradeBalances[0].entries.map(e => e.id), ["c", "a", "b"]);
    assert.equal(d.instantSellRequests[0].userId, TG);
    assert.equal(d.instantSellRequests[1].userId, 999);
    assert.equal(d.notifications[0].userId, TG);
    assert.deepEqual(d.promos[0].usedBy, [TG, 5]);
    assert.equal(d.trades[0].sellerId, TG);
    assert.deepEqual(r.changed.sort(), ["instantSellRequests", "notifications", "promos", "tradeBalances", "trades", "users"]);
});

test("mergeAccountData: Telegram akkauntida ledger bo'lmasa, Steam ledgeri unga o'tkaziladi", () => {
    const d = sample();
    d.tradeBalances = [{ userId: STEAM, entries: [{ id: "a", amount: 1 }] }];
    mergeAccountData(d, STEAM, TG);
    assert.deepEqual(d.tradeBalances, [{ userId: TG, entries: [{ id: "a", amount: 1 }] }]);
});

test("mergeAccountData: user topilmasa yoki o'zi bilan — xato, hech narsa o'zgarmaydi", () => {
    const d = sample();
    assert.equal(mergeAccountData(d, 123, TG).error, "user_not_found");
    assert.equal(mergeAccountData(d, TG, TG).error, "same_user");
    assert.equal(d.users.length, 3);
});
