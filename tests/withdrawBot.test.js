const test = require("node:test");
const assert = require("node:assert/strict");

function load(env) {
    const keys = ["WITHDRAW_BOT_TOKEN", "BOT_TOKEN", "ADMIN_ID", "ADMIN_IDS"];
    const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, env);
    delete require.cache[require.resolve("../backend/withdrawBot")];
    delete require.cache[require.resolve("../backend/adminIds")];
    const mod = require("../backend/withdrawBot");
    return { mod, restore: () => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } } };
}

function fakeFetch(calls) {
    return async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return { status: 200, json: async () => ({ ok: true }) }; };
}

const request = { id: 77, userId: 5, amount: 150000, cardNumber: "8600123412341234" };

test("WITHDRAW_BOT_TOKEN bor → so'rov alohida botdan har adminga, tugmalar bilan", async () => {
    const { mod, restore } = load({ WITHDRAW_BOT_TOKEN: "WD", BOT_TOKEN: "MAIN", ADMIN_ID: "1", ADMIN_IDS: "2" });
    try {
        const calls = [];
        await mod.notifyWithdrawRequest({ id: 5, name: "a_b" }, request, fakeFetch(calls));
        assert.equal(calls.length, 2);
        assert.ok(calls.every(c => c.url === "https://api.telegram.org/botWD/sendMessage"));
        assert.deepEqual(calls.map(c => String(c.body.chat_id)).sort(), ["1", "2"]);
        const b = calls[0].body;
        assert.match(b.text, /Pul chiqarish so'rovi/);
        assert.match(b.text, /a\\_b/);
        assert.match(b.text, /8600123412341234/);
        assert.equal(b.parse_mode, "Markdown");
        assert.deepEqual(b.reply_markup.inline_keyboard[0].map(x => x.callback_data), ["wd_approve_77", "wd_reject_77"]);
    } finally { restore(); }
});

test("WITHDRAW_BOT_TOKEN yo'q → asosiy botga (avvalgidek)", async () => {
    const { mod, restore } = load({ BOT_TOKEN: "MAIN", ADMIN_ID: "1" });
    try {
        const calls = [];
        await mod.notifyWithdrawRequest({ id: 5, name: "x" }, request, fakeFetch(calls));
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, "https://api.telegram.org/botMAIN/sendMessage");
    } finally { restore(); }
});
