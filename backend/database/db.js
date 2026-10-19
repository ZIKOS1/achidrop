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
    // inv_/invReq_ (inventoryBridge), steamAuth_ (auth-steam), sess_/admsess_ (tokenStore), lisAuto_ (lisAutosell) — keshga kerak emas.
    for (const doc of docs) if (!/^(inv(Req)?|steamAuth|sess|admsess|lisAuto)_/.test(doc._id)) setCache(doc._id, doc.data);
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

// ── "users" — butun massivni emas, faqat O'ZGARGAN maydonlarni yozish ─────
// Muammo: sayt (Vercel nusxalari) va bot (VPS) har biri o'z keshidagi BUTUN
// users massivini yozardi. Kesh bir necha soniya eski bo'lsa, masalan
// trade-link saqlash boshqa jarayon tranzaksiyada o'zgartirgan balansni
// eski qiymatga qaytarib qo'yardi (pul yechish tasdiqlangach balans tiklanishi).
// Endi har massiv oxirgi sinxron holati (base) bilan solishtiriladi va faqat
// farq yoziladi: balance — $inc (farq), balanceHistory — $push (yangi
// yozuvlar), qolgan maydonlar — $set/$unset, yangi user — $push, o'chgan — $pull.
const DIFF_FILES = new Set(["users"]);
const baseOf = new WeakMap(); // massiv -> oxirgi sinxron nusxasi
const fileBase = {};          // file -> oxirgi sinxron nusxasi (kuzatilmagan massiv uchun)

function setCache(file, data) {
  cache[file] = data;
  if (DIFF_FILES.has(file) && Array.isArray(data)) {
    const snap = structuredClone(data);
    baseOf.set(data, snap);
    fileBase[file] = snap;
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Sof funksiya (testlanadi): base → data farqidan Mongo bulkWrite amallari.
function diffArrayOps(file, base, data) {
  const ops = [];
  const baseById = new Map(base.map(u => [u.id, u]));
  const dataIds = new Set();
  for (const u of data) {
    dataIds.add(u.id);
    const b = baseById.get(u.id);
    if (!b) {
      ops.push({ updateOne: { filter: { _id: file, "data.id": { $ne: u.id } }, update: { $push: { data: u } } } });
      continue;
    }
    const $set = {}, $unset = {}, $inc = {}, $push = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(u)])) {
      if (same(u[k], b[k])) continue;
      const path = `data.$.${k}`;
      if (u[k] === undefined) { $unset[path] = ""; continue; }
      if (k === "balance" && Number.isFinite(u[k]) && Number.isFinite(b[k])) { $inc[path] = u[k] - b[k]; continue; }
      if (k === "balanceHistory" && Array.isArray(u[k]) && Array.isArray(b[k]) &&
          u[k].length > b[k].length && same(u[k].slice(0, b[k].length), b[k])) {
        $push[path] = { $each: u[k].slice(b[k].length) };
        continue;
      }
      $set[path] = u[k];
    }
    const update = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;
    if (Object.keys($inc).length) update.$inc = $inc;
    if (Object.keys($push).length) update.$push = $push;
    if (Object.keys(update).length) ops.push({ updateOne: { filter: { _id: file, "data.id": u.id }, update } });
  }
  for (const b of base) {
    if (!dataIds.has(b.id)) ops.push({ updateOne: { filter: { _id: file }, update: { $pull: { data: { id: b.id } } } } });
  }
  return ops;
}

function write(file, data) {
  const base = DIFF_FILES.has(file) && Array.isArray(data) ? (baseOf.get(data) || fileBase[file]) : null;
  if (base) {
    const ops = diffArrayOps(file, base, data);
    setCache(file, data);
    if (!ops.length) return;
    Store.bulkWrite(ops, { ordered: true }).catch((err) => {
      console.log("MONGODB WRITE ERROR:", err.message);
    });
    return;
  }
  setCache(file, data);
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
  setCache(file, doc ? doc.data : []);
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
      for (const [file, data] of Object.entries(result.cacheUpdates)) setCache(file, data);
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

// ── Keshsiz, to'g'ridan-to'g'ri bitta hujjat bilan ishlash ──────────────────
// Jarayonlar o'rtasida qisqa xabar almashish uchun (inventoryBridge.js: sayt
// so'rov qoldiradi, bot javob yozadi). Keshga tegilmaydi — har chaqiruv
// Mongo'dagi eng yangi holatni ko'radi.
async function readDoc(id) {
  const doc = await Store.findOne({ _id: id }).lean();
  return doc ? doc.data : null;
}
async function writeDoc(id, data) {
  await Store.updateOne({ _id: id }, { $set: { data } }, { upsert: true });
}
async function removeDoc(id) {
  await Store.deleteOne({ _id: id });
}
// O'qish va o'chirish bitta atomik amal — bir martalik kodlar uchun (auth-steam.js).
async function takeDoc(id) {
  const doc = await Store.findOneAndDelete({ _id: id }).lean();
  return doc ? doc.data : null;
}
async function listIds(prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const docs = await Store.find({ _id: { $regex: `^${escaped}` } }, { _id: 1 }).lean();
  return docs.map(d => d._id);
}

module.exports = { read, write, connect, refresh, withTransaction, readTx, writeTx, readDoc, writeDoc, removeDoc, takeDoc, listIds, diffArrayOps };
