// Bir martalik: refresh() tekshiradigan hujjatlarga `v` belgisini qo'yadi
// (db.js `knownV` izohiga qarang). Faqat `v`si yo'q hujjatlarga, `data`ga tegmaydi.
require("dotenv").config();
const mongoose = require("mongoose");

const FILES = ["users", "auctions", "settings", "notifications", "trades", "tradeBalances", "tradeFees", "supportTickets"];

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const stores = mongoose.connection.db.collection("stores");
    for (const id of FILES) {
        const r = await stores.updateOne({ _id: id, v: { $exists: false } }, { $set: { v: new mongoose.Types.ObjectId().toHexString() } });
        console.log(`${id}: ${r.modifiedCount ? "belgi qo'yildi" : "allaqachon bor"}`);
    }
    await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
