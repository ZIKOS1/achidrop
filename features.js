// Vaqtincha o'chirilgan bo'limlar. Kod O'CHIRILMAGAN — faqat yashirilgan va
// yangi amallar (bid, e'lon, xarid, obmen) bloklangan. Qayta yoqish uchun
// shu yerda `true` qiling VA miniapp/src/features.js'da ham xuddi shunday.
// (Allaqachon yutilgan/sotib olingan skinlarni Inventardan chiqarib olish
// har doim ishlaydi.)
const FEATURES = {
    auctions: false,
    market: false,
    trade: false, // Obmen
};

module.exports = { FEATURES };
