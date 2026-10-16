// Skin sotish inventar so'rovlarini bajaradigan alohida kichik jarayon (VPS'da,
// pm2 ostida 24/7). index.js ham xuddi shu ishni qiladi, lekin bot
// foydalanuvchining kompyuterida — kompyuter o'chsa inventar ochilmay qolardi.
// VPS IP'sini Steam bloklamaydi (Vercel'nikini bloklaydi), shu sabab so'rovlar
// shu yerda bajariladi. Ikkalasi bir vaqtda ishlasa ham zarari yo'q: kim birinchi
// olsa o'sha javob yozadi (inventoryBridge.js).
//
// Faqat mongoose.connect — db.connect() butun bazani keshga yuklaydi va
// backfill yozadi, bu yerga kerak emas (readDoc/writeDoc keshsiz ishlaydi).
require("dotenv").config();
const mongoose = require("mongoose");
const inventoryBridge = require("./inventoryBridge");
const { fetchCommunityInventory } = require("./steam");

async function main() {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI .env faylda topilmadi!");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Inventar worker ishga tushdi");

    let running = false;
    setInterval(async () => {
        if (running) return;
        running = true;
        try {
            await inventoryBridge.processPendingRequests({
                ...inventoryBridge.mongoDeps(),
                fetchInventory: (sid, force) => fetchCommunityInventory(sid, force),
            });
        } catch (err) {
            console.log("INVENTAR SO'ROV XATO:", err.message);
        } finally {
            running = false;
        }
    }, 1_500);
}

main().catch((err) => {
    console.error("WORKER XATO:", err.message);
    process.exit(1); // pm2 qayta ishga tushiradi
});
