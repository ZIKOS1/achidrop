// Promo kodni (istalgan turda) userId'ga nisbatan tekshiradi — `perUserLimit`
// (default 1, ya'ni eski "bir kishi — bir marta" xatti-harakati saqlanadi;
// admin uni oshirishi yoki 0/bo'sh qoldirib cheksiz qilishi mumkin). `usedBy`
// endi userId'larni TAKRORLAB saqlaydi (har safar ishlatganda push qilinadi) —
// shu orqali "shu userda nechta marta ishlatilgan" ni sanash mumkin.
function checkPromoForUser(p, userId) {
    if (!p.active) return { error: "exhausted" };
    if (p.maxUse && (p.usedCount ?? 0) >= p.maxUse) return { error: "exhausted" };
    // `??` — 0 (admin "cheksiz" tanlagan) 1 ga aylanib qolmasligi uchun.
    const limit = p.perUserLimit ?? 1;
    if (limit > 0) {
        const usedByThisUser = (p.usedBy || []).filter(id => id === userId).length;
        if (usedByThisUser >= limit) return { error: "already_used" };
    }
    return { ok: true };
}

// Kod bir marta ishlatildi deb belgilanadi (global limit to'lsa — o'chadi).
function markPromoUsed(p, userId) {
    p.usedCount = (p.usedCount ?? 0) + 1;
    if (!Array.isArray(p.usedBy)) p.usedBy = [];
    p.usedBy.push(userId);
    if (p.maxUse && p.usedCount >= p.maxUse) p.active = false;
}

module.exports = { checkPromoForUser, markPromoUsed };
