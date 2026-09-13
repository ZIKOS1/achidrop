// Bot tarafida (Node, React'siz) skin turi/wear aniqlash va sahifalash uchun
// yordamchi funksiyalar. Mantiq miniapp/src/utils.js'dagi bilan bir xil —
// ikki tomon alohida deploy bo'lgani (Vite build vs Node process) uchun
// umumiy modulga chiqarib bo'lmaydi, shu sabab shu yerga ko'chirilgan.

const fs = require("fs");
const path = require("path");

// Steam relay bizga stikerlar haqida faqat xom `stickerId` (+ wear) beradi —
// haqiqiy rasm URL'i emas (GC sxemasi shuni saqlaydi, lekin relay uni hech
// qachon chiqarmagan). Shu sabab ByMykel/CSGO-API'ning ochiq stickers.json
// datasetidan (def_index -> {name, image}) bir martalik yuklab olingan,
// loyihaga saqlangan lean lookup jadvali orqali hal qilinadi — relay kodini
// o'zgartirish (va shu bilan SSH kirish) shart emas.
let _stickerMap = null;
function getStickerMap() {
    if (_stickerMap) return _stickerMap;
    try {
        _stickerMap = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "stickerImages.json"), "utf8"));
    } catch {
        _stickerMap = {};
    }
    return _stickerMap;
}

// `stickers` — [{stickerId, wear}] xom ro'yxatini {stickerId, wear, name, icon}
// ga to'ldiradi (topilmasa icon/name null bo'lib qoladi, UI "Пусто"/bo'sh
// ikonka ko'rsatadi — xato tashlanmaydi).
function enrichStickers(stickers) {
    if (!Array.isArray(stickers)) return [];
    const map = getStickerMap();
    return stickers.map(s => {
        const entry = map[String(s.stickerId)];
        return { ...s, name: entry?.name ?? null, icon: entry?.image ?? null };
    });
}

const CATEGORY_KEYWORDS = [
    { key: "pichoq",   label: "Pichoq",       words: ["knife", "karambit", "bayonet", "butterfly", "shadow daggers", "talon", "flip", "gut", "huntsman", "falchion", "bowie", "kukri", "navaja", "stiletto", "ursus", "paracord", "survival", "classic knife", "nomad", "skeleton", "m9"] },
    { key: "qolqop",   label: "Qo'lqop",      words: ["gloves", "wraps", "hand wraps", "moto", "specialist", "sport gloves", "driver", "hydra"] },
    { key: "pistolet", label: "Pistolet",     words: ["glock", "usp", "p250", "desert eagle", "deagle", "five-seven", "tec-9", "cz75", "p2000", "dual berettas", "r8", "revolver"] },
    { key: "smg",      label: "SMG",          words: ["mp9", "mac-10", "mp7", "mp5", "ump-45", "ump45", "p90", "pp-bizon", "bizon"] },
    { key: "miltiq",   label: "Miltiq",       words: ["ak-47", "m4a4", "m4a1", "sg 553", "aug", "galil", "famas"] },
    { key: "snayper",  label: "Snayper",      words: ["awp", "ssg 08", "ssg08", "scar-20", "g3sg1"] },
    { key: "ogir",     label: "Og'ir qurol",  words: ["nova", "xm1014", "sawed-off", "mag-7", "m249", "negev"] },
];

function guessCategory(name) {
    const n = (name || "").toLowerCase();
    for (const cat of CATEGORY_KEYWORDS) {
        if (cat.words.some((w) => n.includes(w))) return cat.key;
    }
    return "boshqa";
}

const CATEGORIES = [
    { key: "all", label: "Hammasi" },
    ...CATEGORY_KEYWORDS.map(({ key, label }) => ({ key, label })),
    { key: "boshqa", label: "Boshqa" },
];

function wearCode(float) {
    if (float == null) return null;
    if (float < 0.07) return "FN";
    if (float < 0.15) return "MW";
    if (float < 0.38) return "FT";
    if (float < 0.45) return "WW";
    return "BS";
}

function wearName(float) {
    if (float == null) return null;
    if (float < 0.07) return "Factory New";
    if (float < 0.15) return "Minimal Wear";
    if (float < 0.38) return "Field-Tested";
    if (float < 0.45) return "Well-Worn";
    return "Battle-Scarred";
}

const WEAR_TIERS = [
    { code: "all", label: "Hammasi" },
    { code: "FN",  label: "Factory New" },
    { code: "MW",  label: "Minimal Wear" },
    { code: "FT",  label: "Field-Tested" },
    { code: "WW",  label: "Well-Worn" },
    { code: "BS",  label: "Battle-Scarred" },
];

function paginate(items, page, pageSize) {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const start = safePage * pageSize;
    return {
        pageItems: items.slice(start, start + pageSize),
        page: safePage,
        totalPages,
        total: items.length,
    };
}

module.exports = {
    CATEGORY_KEYWORDS, CATEGORIES, guessCategory,
    wearCode, wearName, WEAR_TIERS,
    paginate, enrichStickers,
};
