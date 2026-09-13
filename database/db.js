const mongoose = require("mongoose");

const StoreSchema = new mongoose.Schema(
  { _id: String, data: mongoose.Schema.Types.Mixed },
  { versionKey: false }
);
const Store = mongoose.models.Store || mongoose.model("Store", StoreSchema);

// In-memory cache — read()/write() stay synchronous (like the old fs version),
// MongoDB is just the persistence layer behind them.
const cache = {};
let connectPromise = null;

async function connect() {
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI .env faylda topilmadi!");

    await mongoose.connect(uri);
    console.log("✅ MongoDB ulandi");

    const docs = await Store.find({}).lean();
    for (const doc of docs) cache[doc._id] = doc.data;
    console.log("✅ Ma'lumotlar keshga yuklandi:", Object.keys(cache).join(", ") || "(bo'sh)");

    // Websaytdan Steam orqali (Telegramsiz) kiruvchi foydalanuvchilar qo'shilishi
    // bilan `telegramId` maydoni paydo bo'ldi — undan oldin yaratilgan barcha
    // foydalanuvchilar Telegram orqali kelgan, shu sabab bir martalik backfill.
    const users = cache.users;
    if (Array.isArray(users) && users.length) {
      let changed = false;
      for (const u of users) {
        if (u.telegramId === undefined) { u.telegramId = u.id; changed = true; }
      }
      if (changed) {
        await Store.updateOne({ _id: "users" }, { $set: { data: users } }, { upsert: true });
        console.log("✅ telegramId backfill bajarildi");
      }
    }
  })().catch((err) => {
    connectPromise = null; // keyingi chaqiruvda qayta urinib ko'rish uchun
    throw err;
  });

  return connectPromise;
}

function read(file) {
  if (!(file in cache)) cache[file] = [];
  return cache[file];
}

function write(file, data) {
  cache[file] = data;
  Store.updateOne({ _id: file }, { $set: { data } }, { upsert: true }).catch((err) => {
    console.log("MONGODB WRITE ERROR:", err.message);
  });
}

// Serverless muhitda (Vercel) har bir "sovuq" instance o'z keshini alohida
// yuklaydi — shu instance ochilgandan keyin boshqa jarayon (masalan, botning
// o'zi) yozgan yangi ma'lumot bu yerda ko'rinmay qolishi mumkin. Shu sabab
// muhim qidiruvlar (masalan, user topilmasa) uchun Mongo'dan qayta o'qiymiz.
async function refresh(file) {
  const doc = await Store.findOne({ _id: file }).lean();
  cache[file] = doc ? doc.data : [];
  return cache[file];
}

// ── Tranzaksiyalar (bid/trade-confirm kabi bir nechta hujjatni bir vaqtda
// o'zgartiradigan, pul bilan bog'liq amallar uchun) ─────────────────────────
// Muammo: yuqoridagi read()/write() "butun massivni o'qi → xotirada
// o'zgartir → butun massivni qayta yoz" naqshiga asoslangan. Vercel'da bir
// nechta serverless nusxa (yoki sayt+bot) bir xil hujjatga BIR VAQTDA
// yozsa, ulardan biri ikkinchisining o'zgarishini "ko'rmay", uni bosib
// yuborishi mumkin (masalan ikkita bid deyarli bir vaqtda kelsa, bittasi
// yo'qolib qolishi). MongoDB tranzaksiyasi (Atlas — replica set, shu sabab
// tranzaksiyani qo'llab-quvvatlaydi) buni hal qiladi: ikkita parallel
// tranzaksiya bir hujjatga tegsa, MongoDB'ning o'zi to'qnashuvni aniqlab,
// bittasini avtomatik qayta urinadi (session.withTransaction'ning o'ziga
// xos xususiyati).
//
// MUHIM: `fn(session)` bir necha marta chaqirilishi mumkin (to'qnashuvda
// qayta urinish tufayli) — shu sabab u ICHIDA hech qanday tashqi holatga
// (masalan shu fayldagi `cache`) tegilmasin, faqat `readTx`/`writeTx`
// orqali Mongo bilan ishlasin. `fn` natijasida qaytargan `cacheUpdates`
// ({file: data, ...}) FAQAT muvaffaqiyatli commit'dan KEYIN, shu yerda
// bir marta xotiradagi keshga qo'llaniladi.
async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    if (result && result.cacheUpdates) {
      for (const [file, data] of Object.entries(result.cacheUpdates)) cache[file] = data;
    }
    return result;
  } finally {
    await session.endSession();
  }
}

// Tranzaksiya ICHIDA bitta faylning ENG YANGI holatini o'qiydi (xotiradagi
// umumiy keshdan emas — boshqa jarayon/nusxa hali yangilamagan bo'lishi
// mumkin bo'lgan eski ma'lumotga asoslanib qaror qabul qilmaslik uchun).
async function readTx(session, file) {
  const doc = await Store.findOne({ _id: file }).session(session);
  return doc ? doc.data : [];
}

// Tranzaksiya ICHIDA yozish (hali commit qilinmagan, faqat shu tranzaksiya
// muvaffaqiyatli tugasa kuchga kiradi).
function writeTx(session, file, data) {
  return Store.updateOne({ _id: file }, { $set: { data } }, { session, upsert: true });
}

module.exports = { read, write, connect, refresh, withTransaction, readTx, writeTx };
