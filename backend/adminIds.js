// Bot/sayt adminlari: ADMIN_ID (asosiy) + ADMIN_IDS (vergul bilan qo'shimchalar,
// masalan "585108093,123456"). Asosiy admin doim ro'yxatda birinchi turadi.
function adminIds() {
    const ids = [process.env.ADMIN_ID, ...(process.env.ADMIN_IDS || "").split(",")]
        .map(s => Number(String(s ?? "").trim()))
        .filter(n => Number.isFinite(n) && n > 0);
    return [...new Set(ids)];
}

function isAdminId(id) {
    return adminIds().includes(Number(id));
}

// Bir xil xabarni barcha adminlarga yuboradi: `send(chatId)` har biri uchun
// chaqiriladi, bittasidagi xato boshqalariga to'sqinlik qilmaydi.
function toAdmins(send) {
    return Promise.all(adminIds().map(id =>
        Promise.resolve().then(() => send(id)).catch(err => console.log("ADMIN XABAR XATO:", id, err?.message))
    ));
}

module.exports = { adminIds, isAdminId, toAdmins };
