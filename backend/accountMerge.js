// Bitta Steam = bitta akkaunt. Muammo: user avval saytga Steam orqali kirsa
// (Telegramsiz "Steam akkaunt" yaratiladi, id = steamIdToUserId), keyin
// botda Telegram akkauntiga xuddi shu Steam'ni ulasa — ikkita akkaunt va
// ikkita balans bo'lib qolardi (pul saytdagisiga tushib, botda 0 ko'rinardi).
// Endi Steam ulanganda Telegramsiz dublikat Telegram akkauntiga qo'shiladi:
// balans, tarix, ledger (8 kunlik hold), so'rovlar, sessiyalar — hammasi.
//
// Pul bilan bog'liq — BITTA Mongo tranzaksiyasida (db.withTransaction).
const { withTransaction, readTx, writeTx, listIds, readDoc, writeDoc, refresh } = require("./database/db");

// userId saqlaydigan fayllar va maydonlar.
const REF_FIELDS = {
    instantSellRequests: ["userId"],
    notifications:       ["userId"],
    withdrawals:         ["userId"],
    bids:                ["userId"],
    trades:              ["sellerId", "buyerId", "priceProposedBy"],
    tradeFees:           ["sellerId"],
    auctions:            ["lastBidder"],
};
const FILES = ["users", "tradeBalances", "promos", ...Object.keys(REF_FIELDS)];

const asArray = (raw) => Array.isArray(raw) ? raw : (raw ? Object.values(raw) : []);
const uniq = (arr) => [...new Set(arr)];

// Sof funksiya (testlanadi): `data` ({file: massiv}) ichida fromId'ni toId'ga
// qo'shadi. O'zgargan fayllar nomlarini qaytaradi; xato bo'lsa { error }.
function mergeAccountData(data, fromId, toId) {
    const users = data.users;
    const from = users.find(u => u.id === fromId);
    const to = users.find(u => u.id === toId);
    if (!from || !to) return { error: "user_not_found" };
    if (fromId === toId) return { error: "same_user" };
    const changed = new Set(["users"]);

    to.balance = (to.balance ?? 0) + (from.balance ?? 0);
    to.balanceHistory = [...(to.balanceHistory || []), ...(from.balanceHistory || [])]
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (const k of ["wins", "history", "auctions"]) to[k] = [...(to[k] || []), ...(from[k] || [])];
    for (const k of ["favorites", "referrals"]) to[k] = uniq([...(to[k] || []), ...(from[k] || [])]);
    // Telegram akkauntida bo'sh qolgan maydonlar (trade link, Steam ma'lumotlari...) to'ldiriladi.
    for (const [k, v] of Object.entries(from)) {
        if (k === "id" || k === "telegramId") continue;
        if (to[k] == null && v != null) to[k] = v;
    }
    if (from.joined && (!to.joined || from.joined < to.joined)) to.joined = from.joined;
    users.splice(users.indexOf(from), 1);
    for (const u of users) {
        if (Array.isArray(u.referrals) && u.referrals.includes(fromId)) {
            u.referrals = uniq(u.referrals.map(id => id === fromId ? toId : id));
        }
    }

    const ledgers = data.tradeBalances || [];
    const fromLedger = ledgers.find(l => l.userId === fromId);
    if (fromLedger) {
        let toLedger = ledgers.find(l => l.userId === toId);
        if (!toLedger) { fromLedger.userId = toId; }
        else {
            toLedger.entries = [...(toLedger.entries || []), ...(fromLedger.entries || [])];
            ledgers.splice(ledgers.indexOf(fromLedger), 1);
        }
        changed.add("tradeBalances");
    }

    for (const p of data.promos || []) {
        if (Array.isArray(p.usedBy) && p.usedBy.includes(fromId)) {
            p.usedBy = p.usedBy.map(id => id === fromId ? toId : id);
            changed.add("promos");
        }
    }

    for (const [file, fields] of Object.entries(REF_FIELDS)) {
        for (const row of data[file] || []) {
            for (const f of fields) {
                if (row && row[f] === fromId) { row[f] = toId; changed.add(file); }
            }
        }
    }
    return { changed: [...changed] };
}

async function mergeAccounts(fromId, toId) {
    const result = await withTransaction(async (session) => {
        const data = {};
        for (const f of FILES) data[f] = asArray(await readTx(session, f));
        const r = mergeAccountData(data, fromId, toId);
        if (r.error) return r;
        const cacheUpdates = {};
        for (const f of r.changed) { await writeTx(session, f, data[f]); cacheUpdates[f] = data[f]; }
        return { ok: true, changed: r.changed, cacheUpdates };
    });
    if (result.error) return result;

    // Saytdagi ochiq sessiyalar endi birlashgan akkauntga qaraydi (qayta kirish shart emas).
    for (const id of await listIds("sess_")) {
        const s = await readDoc(id);
        if (s && s.userId === fromId) await writeDoc(id, { ...s, userId: toId });
    }
    const legacy = await refresh("sessions");
    if (legacy && !Array.isArray(legacy)) {
        let touched = false;
        for (const s of Object.values(legacy)) if (s && s.userId === fromId) { s.userId = toId; touched = true; }
        if (touched) await writeDoc("sessions", legacy);
    }
    return result;
}

// Telegram akkauntiga Steam ulanganda: shu Steam'li Telegramsiz akkauntlar unga qo'shiladi.
async function mergeSteamDuplicatesInto(toId, steamId64) {
    const users = asArray(await refresh("users"));
    const dups = users.filter(u => u.id !== toId && u.telegramId == null && u.steamId64 === steamId64);
    for (const d of dups) await mergeAccounts(d.id, toId);
    if (dups.length) await refresh("users");
    return dups.map(d => d.id);
}

module.exports = { mergeAccountData, mergeAccounts, mergeSteamDuplicatesInto };
