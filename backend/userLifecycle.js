const { read, write } = require("./database/db");
const { isAdminId } = require("./adminIds");

function getAllUsers() {
    const raw = read("users");
    return Array.isArray(raw) ? raw : Object.values(raw);
}

function upsertUser(user) {
    user.role = isAdminId(user.id) ? "admin" : (user.role || "user");
    const arr = getAllUsers();
    const idx = arr.findIndex(u => u.id === user.id);
    if (idx !== -1) arr[idx] = user; else arr.push(user);
    write("users", arr);
    return user;
}

function findUserById(id) {
    return getAllUsers().find(u => u.id === id) || null;
}
function findUserByTelegramId(tgId) {
    return getAllUsers().find(u => u.telegramId === tgId) || null;
}
function findUserBySteamId(steamId64) {
    return getAllUsers().find(u => u.steamId64 === steamId64) || null;
}

// steamId64 17 xonali (~7.6x10^16) — JavaScript Number xavfsiz butun son
// chegarasidan (2^53 ≈ 9x10^15) OSHIB KETADI, shu sabab uni to'g'ridan-to'g'ri
// Number()ga aylantirish ANIQLIKNI YO'QOTADI (boshqa raqamga aylanib qoladi!).
// Shaxsiy Steam akkauntlari doim bitta bazadan (76561197960265728) boshlanadi —
// shu bazani ayirib tashlasak, qolgan qism (accountId) hech qachon 2^32'dan
// oshmaydi va xavfsiz Number bo'ladi. Ustiga katta offset qo'shiladi — bu
// haqiqiy Telegram ID'lardan (hozircha ~10^10) ancha katta, shu sabab
// to'qnashuv bo'lmaydi, lekin 2^53'dan ham kichik bo'lib qoladi.
const STEAM_ID64_BASE = 76561197960265728n;
const STEAM_SYNTHETIC_OFFSET = 2_000_000_000_000; // 2 trln
function steamIdToUserId(steamId64) {
    const accountId = BigInt(steamId64) - STEAM_ID64_BASE;
    return STEAM_SYNTHETIC_OFFSET + Number(accountId);
}

// Telegram orqali (botga /start yoki websaytdagi Login Widget orqali) yangi foydalanuvchi.
function createTelegramUser(from, lang = null) {
    const user = {
        id:             from.id,
        telegramId:     from.id,
        name:           from.first_name + (from.last_name ? " " + from.last_name : ""),
        username:       from.username || null,
        lang,
        role:           "user",
        balance:        0,
        wins:           [],
        favorites:      [],
        history:        [],
        blocked:        false,
        auctions:       [],
        tradeLink:      null,
        steamId64:      null,
        referrals:      [],
        balanceHistory: [],
        joined:         new Date().toISOString(),
    };
    return upsertUser(user);
}

// Steam orqali (websaytdan, Telegramsiz) birinchi marta kirgan foydalanuvchi.
// `id` sifatida yuqoridagi steamIdToUserId() orqali hosil qilingan xavfsiz
// sintetik raqam ishlatiladi (haqiqiy Telegram ID'lar bilan to'qnashmaydi).
function createSteamUser(steamId64, displayName, avatar) {
    const user = {
        id:             steamIdToUserId(steamId64),
        telegramId:     null,
        name:           displayName || `Steam ${steamId64.slice(-6)}`,
        username:       null,
        lang:           "uz",
        role:           "user",
        balance:        0,
        wins:           [],
        favorites:      [],
        history:        [],
        blocked:        false,
        auctions:       [],
        tradeLink:      null,
        steamId64,
        steamUsername:  displayName || null,
        steamAvatar:    avatar || null,
        referrals:      [],
        balanceHistory: [],
        joined:         new Date().toISOString(),
    };
    return upsertUser(user);
}

module.exports = {
    getAllUsers, upsertUser,
    findUserById, findUserByTelegramId, findUserBySteamId,
    createTelegramUser, createSteamUser,
};
