// ── Reyting: umumiy (butun vaqt) va konkurs (admin ochgan davr) ─────────────
// XP saqlanmaydi — har so'rovda tasdiqlangan sotuvlardan HISOBLANADI:
//   • instant sell so'rovi status "credited" (resolvedAt, totalSom)
//   • P2P/market savdosi status "completed" — sotuvchiga (completedAt, agreedPrice)
// Shu sabab sotuv kodiga hech qanday "XP qo'sh" chaqiruvi kerak emas, va
// konkurs ochilganda hamma avtomatik 0 dan boshlaydi (faqat startAt'dan
// keyingi sotuvlar sanaladi). Admin qo'lda qo'shgan/ayirgan XP — `adjustments`.
//
// "rating" hujjati shakli:
// { general: { xpPerSale, xpPer1000Som, tierMins[6], adjustments: {userId: n} },
//   contests: [{ id, title, prize, startAt, endAt|null, closedAt|null,
//                xpPerSale, xpPer1000Som, adjustments, createdAt }] }

const DEFAULT_GENERAL = { xpPerSale: 10, xpPer1000Som: 1, adjustments: {} };

// Darajalar (Claude Design "Darajalar va ramkalar"): har biriga minimal XP.
// Admin faqat chegaralarni o'zgartiradi; nomlar/ranglar frontendda (key bo'yicha).
const TIER_KEYS = ["bronze", "silver", "gold", "platinum", "diamond", "legend"];
const DEFAULT_TIER_MINS = [0, 500, 2000, 6000, 15000, 50000];

// 6 ta, birinchisi 0, qat'iy o'sish tartibida — aks holda null.
function normalizeTierMins(v) {
    if (!Array.isArray(v) || v.length !== TIER_KEYS.length) return null;
    const n = v.map(Number);
    if (n.some(x => !Number.isFinite(x) || x < 0) || n[0] !== 0) return null;
    for (let i = 1; i < n.length; i++) if (n[i] <= n[i - 1]) return null;
    return n.map(Math.round);
}

function num(v, def) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

function normalizeConfig(raw) {
    const r = raw && !Array.isArray(raw) && typeof raw === "object" ? raw : {};
    const g = r.general || {};
    return {
        general: {
            xpPerSale: num(g.xpPerSale, DEFAULT_GENERAL.xpPerSale),
            xpPer1000Som: num(g.xpPer1000Som, DEFAULT_GENERAL.xpPer1000Som),
            tierMins: normalizeTierMins(g.tierMins) || DEFAULT_TIER_MINS.slice(),
            adjustments: g.adjustments && typeof g.adjustments === "object" ? g.adjustments : {},
        },
        contests: Array.isArray(r.contests) ? r.contests : [],
    };
}

// Barcha tasdiqlangan sotuvlar: [{ userId, amount, at(ms) }]
function collectSales({ instantSell = [], trades = [], excludeUser = () => false }) {
    const out = [];
    for (const r of instantSell) {
        if (!r || r.status !== "credited") continue;
        const at = Date.parse(r.resolvedAt || r.createdAt);
        const amount = num(r.totalSom, 0);
        if (!Number.isFinite(at) || excludeUser(r.userId)) continue;
        out.push({ userId: r.userId, amount, at });
    }
    for (const t of trades) {
        if (!t || t.status !== "completed" || t.sellerId == null) continue;
        const at = Date.parse(t.completedAt);
        const amount = num(t.agreedPrice, 0);
        if (!Number.isFinite(at) || excludeUser(t.sellerId)) continue;
        out.push({ userId: t.sellerId, amount, at });
    }
    return out;
}

function saleXp(amount, cfg) {
    return cfg.xpPerSale + Math.floor((Math.max(0, amount) / 1000) * cfg.xpPer1000Som);
}

// userId -> { xp, sales, volume }; [from, to) oralig'idagi sotuvlar (null — chegarasiz).
function tally(sales, cfg, { from = null, to = null } = {}) {
    const map = new Map();
    const get = (id) => {
        const key = String(id);
        if (!map.has(key)) map.set(key, { userId: id, xp: 0, sales: 0, volume: 0 });
        return map.get(key);
    };
    for (const s of sales) {
        if (from != null && s.at < from) continue;
        if (to != null && s.at >= to) continue;
        const row = get(s.userId);
        row.xp += saleXp(s.amount, cfg);
        row.sales += 1;
        row.volume += s.amount;
    }
    for (const [id, delta] of Object.entries(cfg.adjustments || {})) {
        const d = num(delta, 0);
        if (!d) continue;
        const row = map.get(String(id)) || get(Number.isNaN(Number(id)) ? id : Number(id));
        row.xp += d;
    }
    for (const row of map.values()) row.xp = Math.max(0, Math.round(row.xp));
    return map;
}

function rank(map) {
    return [...map.values()]
        .filter(r => r.xp > 0)
        .sort((a, b) => b.xp - a.xp || b.volume - a.volume || String(a.userId).localeCompare(String(b.userId)))
        .map((r, i) => ({ ...r, rank: i + 1 }));
}

// Daraja: XP qaysi chegaradan o'tgan bo'lsa — o'sha; progress keyingisigacha.
function tierInfo(xp, mins = DEFAULT_TIER_MINS) {
    let i = 0;
    while (i + 1 < mins.length && xp >= mins[i + 1]) i++;
    const next = i + 1 < mins.length ? mins[i + 1] : null;
    return {
        tier: TIER_KEYS[i], tierIndex: i,
        nextTier: next != null ? TIER_KEYS[i + 1] : null, nextTierXp: next,
        progress: next != null ? (xp - mins[i]) / (next - mins[i]) : 1,
    };
}

function contestState(c, now = Date.now()) {
    if (c.closedAt) return "finished";
    const start = Date.parse(c.startAt);
    const end = c.endAt ? Date.parse(c.endAt) : null;
    if (now < start) return "upcoming";
    if (end != null && now >= end) return "finished";
    return "active";
}

// Ko'rsatiladigan konkurs: avval faol, keyin yaqin kelayotgan, keyin oxirgi tugagan.
function currentContest(contests, now = Date.now()) {
    const sorted = [...contests].sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
    return sorted.find(c => contestState(c, now) === "active")
        || sorted.filter(c => contestState(c, now) === "upcoming").pop()
        || sorted.find(c => contestState(c, now) === "finished")
        || null;
}

function contestWindow(c) {
    const start = Date.parse(c.startAt);
    const ends = [c.endAt, c.closedAt].filter(Boolean).map(Date.parse);
    return { from: start, to: ends.length ? Math.min(...ends) : null };
}

function contestCfg(c) {
    return {
        xpPerSale: num(c.xpPerSale, DEFAULT_GENERAL.xpPerSale),
        xpPer1000Som: num(c.xpPer1000Som, DEFAULT_GENERAL.xpPer1000Som),
        adjustments: c.adjustments || {},
    };
}

module.exports = {
    DEFAULT_GENERAL, normalizeConfig, collectSales, saleXp, tally, rank,
    TIER_KEYS, DEFAULT_TIER_MINS, normalizeTierMins, tierInfo, contestState, currentContest, contestWindow, contestCfg,
};
