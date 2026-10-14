import { Banknote } from "lucide-react";
import { t } from "./i18n";
import { api } from "./api";

export function fmtMoney(amount) {
  return Math.round(amount || 0).toLocaleString("ru-RU").replace(/,/g, " ") + " " + t("common.somWithAmount");
}

export function fmtTime(ms) {
  const d = ms - Date.now();
  if (d <= 0) return "⏰ Tugadi";
  const h = Math.floor(d / 3600000), m = Math.floor((d % 3600000) / 60000), s = Math.floor((d % 60000) / 1000);
  if (h > 0) return `⏳ ${h}s ${m}d`;
  if (m > 0) return `⏳ ${m}d ${s}s`;
  return `⏳ ${s}s`;
}

// { label } qaytaradi — ikonkani chaqiruvchi komponent (Leaderboard.jsx)
// o'zi lucide-react'dan tanlaydi, bu yerda emoji saqlanmaydi.
export function badge(wins) {
  if (wins >= 10) return "Legendary";
  if (wins >= 5) return "VIP";
  if (wins >= 2) return "Pro";
  return "Rookie";
}

export function imgSrc(image) {
  if (!image) return null;
  return /^https?:\/\//.test(image) ? image : `/api/image/${image}`;
}

export function wearName(float) {
  if (float == null) return null;
  if (float < 0.07) return "Factory New";
  if (float < 0.15) return "Minimal Wear";
  if (float < 0.38) return "Field-Tested";
  if (float < 0.45) return "Well-Worn";
  return "Battle-Scarred";
}

export function wearCode(float) {
  if (float == null) return null;
  if (float < 0.07) return "FN";
  if (float < 0.15) return "MW";
  if (float < 0.38) return "FT";
  if (float < 0.45) return "WW";
  return "BS";
}

export function wearColor(float) {
  if (float == null) return null;
  if (float < 0.07) return "#1acfdf";
  if (float < 0.15) return "#37bb62";
  if (float < 0.38) return "#f2a618";
  if (float < 0.45) return "#f3680f";
  return "#ee343b";
}

// v0 dizaynidagi wearColors xaritasiga mos (skin-badges.tsx)
export function wearClasses(float) {
  if (float == null) return "text-muted-foreground border-border bg-secondary";
  if (float < 0.07) return "text-success border-success/40 bg-success/10";
  if (float < 0.15) return "text-accent border-accent/40 bg-accent/10";
  if (float < 0.38) return "text-warning border-warning/40 bg-warning/10";
  if (float < 0.45) return "text-primary border-primary/40 bg-primary/10";
  return "text-destructive border-destructive/40 bg-destructive/10";
}

// Valve'ning o'zi CS2/Steam inventar JSON'ida qaytaradigan haqiqiy "Rarity" tegi
// (masalan "Covert", "Classified") bo'yicha rasmiy ranglar. Bu qiymat auksionga
// Steam inventar pickeridan tanlanganda saqlanadi (server.js, steam-relay) —
// eski (Steam orqali qo'shilmagan) yozuvlarda bo'lmasligi mumkin.
export const RARITY_COLORS = {
  "Consumer Grade": "#B0C3D9",
  "Industrial Grade": "#5E98D9",
  "Mil-Spec": "#4B69FF",
  "Restricted": "#8847FF",
  "Classified": "#D32CE6",
  "Covert": "#EB4B4B",
  "Contraband": "#E4AE39",
};
const RARITY_COLOR_DEFAULT = "#B0C3D9";

export function rarityColor(rarity) {
  return RARITY_COLORS[rarity] || RARITY_COLOR_DEFAULT;
}

// Steam'ning market_hash_name konvensiyasi: "[StatTrak™ ][★ ]<Qurol> | <Skin> (<Wear>)".
// Kartada qurol turini (kichik kulrang matn) skin nomidan (oq, bold) alohida
// ko'rsatish uchun ikkiga ajratadi — hech qayerda umumiy shu split funksiyasi
// yo'q edi (SkinName faqat StatTrak prefiksini ajratadi, "|" bo'yicha bo'lmaydi).
export function parseSkinName(name) {
  if (!name) return { weapon: "", skin: "" };
  let n = name.replace(/^StatTrak™?\s*/, "");
  const star = n.startsWith("★");
  if (star) n = n.replace(/^★\s*/, "");
  const barIdx = n.indexOf("|");
  if (barIdx === -1) return { weapon: star ? `★ ${n}` : n, skin: "" };
  const weapon = n.slice(0, barIdx).trim();
  const skin = n.slice(barIdx + 1).trim().replace(/\s*\([^)]*\)\s*$/, "");
  return { weapon: star ? `★ ${weapon}` : weapon, skin };
}

// CS2'ning o'zidagi qurol toifalariga mos (Steam Market/CSFloat kabi bozorlar
// ham aynan shu bo'linishdan foydalanadi) — snayperlar va og'ir qurollar
// "Miltiq"dan alohida chiqarilgan, chunki kolleksionerlar uchun bular aniq
// farqli toifalar.
const CATEGORY_KEYWORDS = [
  { key: "pichoq", label: "Pichoq", words: ["knife", "karambit", "bayonet", "butterfly", "shadow daggers", "talon", "flip", "gut", "huntsman", "falchion", "bowie", "kukri", "navaja", "stiletto", "ursus", "paracord", "survival", "classic knife", "nomad", "skeleton", "m9"] },
  { key: "qolqop", label: "Qo'lqop", words: ["gloves", "wraps", "hand wraps", "moto", "specialist", "sport gloves", "driver", "hydra"] },
  { key: "pistolet", label: "Pistolet", words: ["glock", "usp", "p250", "desert eagle", "deagle", "five-seven", "tec-9", "cz75", "p2000", "dual berettas", "r8", "revolver"] },
  { key: "smg", label: "SMG", words: ["mp9", "mac-10", "mp7", "mp5", "ump-45", "ump45", "p90", "pp-bizon", "bizon"] },
  { key: "miltiq", label: "Miltiq", words: ["ak-47", "m4a4", "m4a1", "sg 553", "aug", "galil", "famas"] },
  { key: "snayper", label: "Snayper", words: ["awp", "ssg 08", "ssg08", "scar-20", "g3sg1"] },
  { key: "ogir", label: "Og'ir qurol", words: ["nova", "xm1014", "sawed-off", "mag-7", "m249", "negev"] },
];

export function guessCategory(name) {
  const n = (name || "").toLowerCase();
  for (const cat of CATEGORY_KEYWORDS) {
    if (cat.words.some((w) => n.includes(w))) return cat.key;
  }
  return "boshqa";
}

export const CATEGORIES = [
  { key: "all", label: "Hammasi" },
  ...CATEGORY_KEYWORDS.map(({ key, label }) => ({ key, label })),
];

// Auksion sahifasidagi kategoriya dropdown'lari uchun har bir toifaning
// TO'LIQ qurol ro'yxati (lis-skins.com uslubidagi filtr) — CATEGORY_KEYWORDS
// yuqorida faqat guessCategory() uchun kalit so'zlar, bu esa foydalanuvchiga
// checkbox qatorida ko'rsatiladigan aniq nomlar ro'yxati. Tanlangan nom
// keyin Auctions.jsx'da auksion nomiga substring sifatida solishtiriladi
// (guessCategory bilan bir xil yondashuv), shu sabab bu yerdagi nomlar
// Steam skin nomlarida qanday yozilsa, shundayligicha bo'lishi kerak.
export const CATEGORY_WEAPONS = {
  pichoq: ["Bayonet", "Bowie Knife", "Butterfly Knife", "Classic Knife", "Falchion Knife", "Flip Knife", "Gut Knife", "Huntsman", "Karambit", "Kukri", "M9 Bayonet", "Navaja", "Nomad", "Paracord", "Shadow Daggers", "Skeleton", "Stiletto", "Survival", "Talon", "Ursus"],
  qolqop: ["Sport Gloves", "Specialist Gloves", "Driver Gloves", "Hand Wraps", "Moto Gloves", "Broken Fang", "Hydra Gloves", "Bloodhound Gloves"],
  pistolet: ["CZ75-Auto", "Desert Eagle", "Dual Berettas", "Five-SeveN", "Glock-18", "P2000", "P250", "R8 Revolver", "Tec-9", "USP-S"],
  smg: ["MAC-10", "MP5-SD", "MP7", "MP9", "P90", "PP-Bizon", "UMP-45"],
  miltiq: ["AK-47", "M4A4", "M4A1-S", "AUG", "SG 553", "FAMAS", "Galil AR"],
  snayper: ["AWP", "SSG 08", "SCAR-20", "G3SG1"],
  ogir: ["MAG-7", "Nova", "Sawed-Off", "XM1014", "M249", "Negev"],
};

// CS2'ning o'zidagi rasmiy HUD equipment SVG iconlari (Juknum/counter-strike-icons
// repo'sidan qurol nomiga qarab moslab olingan, /public/assets/weapons/<slug>.svg).
// Rasm topilmasa CategoryFilterBar'da <img onError> orqali yashiriladi, faqat
// neytral fon qutisi qoladi (buzuq-rasm belgisi ko'rinmaydi).
export function weaponImagePath(name) {
  const slug = (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
  return `/assets/weapons/${slug}.svg`;
}

export function confirmTg(message) {
  return new Promise((resolve) => {
    const tg = window.Telegram?.WebApp;
    // Ba'zi muhitlarda (odatiy brauzer, eski Telegram versiyalari) showConfirm
    // "WebAppMethodUnsupported" deb sinxron xato tashlaydi — shu sabab try/catch
    // bilan o'raymiz, aks holda amal (bekor qilish, o'chirish va h.k.) sababsiz
    // hech narsa qilmay "osilib" qolar edi.
    try {
      if (tg?.showConfirm) return tg.showConfirm(message, (ok) => resolve(ok));
    } catch {}
    resolve(window.confirm(message));
  });
}

// tradeManager.js'dagi FEE_TIERS bilan bir xil bo'lishi shart — faqat
// oldindan foydalanuvchiga ko'rsatish uchun (haqiqiy hisoblash serverda,
// markReceived'da bajariladi, bu yerdagi natija shunchaki taxminiy ko'rsatkich).
const FEE_TIERS = [
  { max: 100000, fee: 3000 },
  { max: 500000, fee: 5000 },
  { max: 10000000, fee: 10000 },
];
export function tradeFee(price) {
  if (!Number.isFinite(price) || price < 1000) return 0;
  const tier = FEE_TIERS.find((t) => price <= t.max) || FEE_TIERS[FEE_TIERS.length - 1];
  return Math.min(tier.fee, price);
}

// tradeManager.js/server.js xato kodlarini (masalan "insufficient_balance")
// foydalanuvchiga tushunarli xabarga aylantiradi — aks holda xom kod chiqib,
// tugma "ishlamayapti"dek tuyulishi mumkin edi.
export function tradeErr(err) {
  const code = err?.error || err;
  if (typeof code === "string" && DICT_HAS_ERR(code)) return t(`trade.err.${code}`);
  return t("common.genericError");
}
function DICT_HAS_ERR(code) {
  return ["not_found", "self", "not_open", "forbidden", "locked", "no_price", "invalid_price", "insufficient_balance", "wrong_state", "promo_not_found", "promo_exhausted", "promo_already_used", "min_price"].includes(code);
}

// Muzlatilgan pul ochilishigacha qolgan vaqt: "8 kun 11 soat 42 daqiqa".
export function fmtUnlockLeft(iso, now = Date.now()) {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return t("balance.timerFmt").replace("{d}", d).replace("{h}", h).replace("{m}", m);
}

function fmtHoldInfo(hold) {
  const lines = [];
  if (hold.frozen > 0) lines.push(`${t("trade.frozen")}: ${fmtMoney(hold.frozen)}`);
  if (hold.frozen > 0 && hold.nextUnlockAt) lines.push(`${t("balance.unlockTimer")}: ${fmtUnlockLeft(hold.nextUnlockAt)}`);
  if (hold.available > 0) lines.push(`${t("trade.available")}: ${fmtMoney(hold.available)}`);
  if (hold.pending > 0) lines.push(`${t("trade.pending")}: ${fmtMoney(hold.pending)}`);
  if (!lines.length) lines.push(t("trade.nothingToWithdraw"));
  return lines.join("\n");
}

// "Pul yechish" — tepadagi balans tugmasi va Balans sahifasidagi muzlatilgan
// mablag' kartasi ikkalasi ham shu bir xil modalni ochadi. Yechib olish
// mumkin bo'lgan mablag' bo'lmasa ham modal OCHILADI (faqat ma'lumot
// ko'rsatiladi, karta-input yo'q) — foydalanuvchi hech bo'lmasa qancha
// mablag' muzlatilganini har doim ko'ra oladi, "hech narsa yo'q" xabari
// bilan to'sib qo'yilmaydi.
export async function openWithdrawModal({ openModal, closeModal, showToast, refreshMe }) {
  let hold;
  try {
    hold = await api("/api/trade-hold-summary");
  } catch {
    return showToast(t("common.genericError"), "err");
  }

  const info = fmtHoldInfo(hold);

  if (!hold.available || hold.available <= 0) {
    return openModal({ title: t("trade.withdraw"), icon: Banknote, viewOnly: true, info });
  }

  openModal({
    title: t("trade.withdraw"),
    icon: Banknote,
    inputType: "text",
    placeholder: t("trade.withdrawCardLabel"),
    okLabel: t("trade.withdrawSend"),
    info,
    onSubmit: async (cardNumber) => {
      if (!cardNumber.trim()) return showToast(t("trade.err.invalid_price"), "err");
      try {
        await api("/api/trade-withdraw", { method: "POST", body: JSON.stringify({ cardNumber: cardNumber.trim() }) });
        closeModal();
        hap("notif", "success");
        showToast(t("trade.withdrawSent"), "ok");
        refreshMe?.();
      } catch (e) {
        showToast(tradeErr(e), "err");
      }
    },
  });
}

export function hap(t, sub) {
  try {
    const tgWebApp = window.Telegram?.WebApp;
    if (t === "impact") tgWebApp?.HapticFeedback?.impactOccurred(sub || "light");
    else tgWebApp?.HapticFeedback?.notificationOccurred(sub || "success");
  } catch {}
}
