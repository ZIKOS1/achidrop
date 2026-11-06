// Inventar filtri mantig'i (lis-skins.com uslubida). Sof funksiyalar — UI va
// i18n'ga bog'liq emas, shu sabab tests/itemFilters.test.js'da testlanadi.
// Tur Steam'ning market_hash_name'idan aniqlanadi: server hozircha Steam'ning
// "Type" tegini frontendga bermaydi.

const WEAPONS = {
  knife: ["Bayonet", "Bowie Knife", "Butterfly Knife", "Classic Knife", "Falchion Knife", "Flip Knife", "Gut Knife", "Huntsman Knife", "Karambit", "Kukri Knife", "M9 Bayonet", "Navaja Knife", "Nomad Knife", "Paracord Knife", "Shadow Daggers", "Skeleton Knife", "Stiletto Knife", "Survival Knife", "Talon Knife", "Ursus Knife"],
  pistol: ["CZ75-Auto", "Desert Eagle", "Dual Berettas", "Five-SeveN", "Glock-18", "P2000", "P250", "R8 Revolver", "Tec-9", "USP-S"],
  rifle: ["AK-47", "AUG", "FAMAS", "Galil AR", "M4A1-S", "M4A4", "SG 553"],
  sniper: ["AWP", "G3SG1", "SCAR-20", "SSG 08"],
  smg: ["MAC-10", "MP5-SD", "MP7", "MP9", "P90", "PP-Bizon", "UMP-45"],
  shotgun: ["MAG-7", "Nova", "Sawed-Off", "XM1014"],
  machinegun: ["M249", "Negev"],
  gloves: ["Bloodhound Gloves", "Broken Fang Gloves", "Driver Gloves", "Hand Wraps", "Hydra Gloves", "Moto Gloves", "Specialist Gloves", "Sport Gloves"],
};

const WEAPON_CATEGORY = new Map(Object.entries(WEAPONS).flatMap(([cat, names]) => names.map((n) => [n, cat])));

// Agentlar nomida qurol yo'q ("Rezan The Ready | Sabre"), faqat fraksiya bor.
const AGENT_FACTIONS = new Set([
  "The Professionals", "Phoenix", "Elite Crew", "Guerrilla Warfare", "Sabre", "Sabre Footsoldier",
  "FBI", "FBI SWAT", "FBI HRT", "FBI Sniper", "SWAT", "SAS", "NZSAS", "NSWC SEAL", "SEAL Frogman",
  "USAF TACP", "USAF TACP Cavalry", "TACP Cavalry", "KSK", "Gendarmerie Nationale", "Brazilian 1st Battalion",
]);

export const CATEGORY_ORDER = ["knife", "pistol", "rifle", "sniper", "smg", "shotgun", "machinegun", "gloves", "sticker", "agent", "case", "other"];

// Stiker nomida turnir/kolleksiya bo'lmasa shu guruhga tushadi.
export const STICKER_MISC = "Misc";

function stripPrefixes(name) {
  return String(name || "")
    .replace(/^★\s*/, "")
    .replace(/^(StatTrak™|Souvenir)\s+/, "")
    .replace(/^★\s*/, "")
    .trim();
}

export function classifyItem(name) {
  const clean = stripPrefixes(name);
  const parts = clean.split(" | ").map((p) => p.trim());
  const head = parts[0].replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/, "");

  const weaponCat = WEAPON_CATEGORY.get(head);
  if (weaponCat) return { category: weaponCat, sub: head };
  if (head === "Zeus x27") return { category: "other", sub: "Zeus x27" };

  if (head === "Sticker") return { category: "sticker", sub: parts[2] || STICKER_MISC };
  if (head === "Sticker Slab") return { category: "sticker", sub: "Sticker Slab" };
  if (head === "Charm" || head === "Souvenir Charm") return { category: "other", sub: "Charm" };
  if (head === "Patch") return { category: "other", sub: "Patch" };
  if (head === "Music Kit") return { category: "other", sub: "Music Kit" };
  if (head === "Graffiti" || head === "Sealed Graffiti") return { category: "other", sub: "Graffiti" };

  if (parts.length >= 2 && AGENT_FACTIONS.has(parts[parts.length - 1])) {
    return { category: "agent", sub: parts[parts.length - 1] };
  }

  // Kalit tekshiruvi case'dan OLDIN: "Chroma Case Key" ham "Case" so'zini o'z ichiga oladi.
  if (/\bKey$/i.test(clean)) return { category: "other", sub: "Key" };
  if (/^Gift\b|\bGift Package$/i.test(clean)) return { category: "other", sub: "Gift" };
  if (/\bCase$/i.test(clean)) return { category: "case", sub: "Case" };
  if (/\bCapsule$/i.test(clean)) return { category: "case", sub: "Capsule" };
  if (/\bPackage$/i.test(clean)) return { category: "case", sub: "Package" };
  if (/\b(Terminal|Box|Pack|Collection)$/i.test(clean)) return { category: "case", sub: "Other" };

  if (/\bPass$/i.test(clean)) return { category: "other", sub: "Pass" };
  if (/^Name Tag$/i.test(clean)) return { category: "other", sub: "Tag" };
  if (/^(Storage Unit|StatTrak.*Swap Tool|Swap Tool)$/i.test(String(name || "").trim())) return { category: "other", sub: "Tool" };
  if (/\b(Pin|Coin|Medal|Trophy|Legend|Champion|Challenger)\b/i.test(clean)) return { category: "other", sub: "Collectible" };

  // Bizga noma'lum ★ — baribir pichoq yoki qo'lqop.
  if (String(name || "").includes("★")) {
    return { category: /Gloves|Wraps/i.test(head) ? "gloves" : "knife", sub: head };
  }
  return { category: "other", sub: "Misc" };
}

export const RARITY_GROUPS = [
  { key: "weapon", options: ["Contraband", "Covert", "Classified", "Restricted", "Mil-Spec", "Industrial", "Consumer"] },
  { key: "agent", options: ["Master", "Superior", "Exceptional", "Distinguished"] },
  { key: "other", options: ["Extraordinary", "Exotic", "Remarkable", "High", "Base"] },
];

export const RARITY_DOT = {
  Contraband: "#E4AE39", Covert: "#EB4B4B", Classified: "#D32CE6", Restricted: "#8847FF", "Mil-Spec": "#4B69FF", Industrial: "#5E98D9", Consumer: "#B0C3D9",
  Master: "#EB4B4B", Superior: "#D32CE6", Exceptional: "#8847FF", Distinguished: "#4B69FF",
  Extraordinary: "#EB4B4B", Exotic: "#D32CE6", Remarkable: "#8847FF", High: "#4B69FF", Base: "#B0C3D9",
};

// Steam: "Mil-Spec Grade", "High Grade", "Base Grade" ... -> filtrdagi qisqa nom.
export function normalizeRarity(rarity) {
  return String(rarity || "").replace(/\s+Grade$/i, "").trim();
}

export const WEAR_OPTIONS = [
  { code: "FN", label: "Factory New", color: "#1acfdf" },
  { code: "MW", label: "Minimal Wear", color: "#37bb62" },
  { code: "FT", label: "Field-Tested", color: "#f2a618" },
  { code: "WW", label: "Well-Worn", color: "#f3680f" },
  { code: "BS", label: "Battle-Scarred", color: "#ee343b" },
  { code: "NP", label: "Not Painted", color: "#8b8b93" },
];

export const SPECIAL_OPTIONS = ["statTrak", "souvenir"];

export function specialsOf(name) {
  const n = String(name || "");
  const out = [];
  if (/StatTrak/i.test(n)) out.push("statTrak");
  if (/^(★\s*)?Souvenir\s/i.test(n) && n.includes(" | ")) out.push("souvenir");
  return out;
}

export const EMPTY_FILTERS = {
  subs: {}, // { knife: ["Karambit"], sticker: ["Katowice 2014"] }
  minPrice: "",
  maxPrice: "",
  status: [],
  rarity: [],
  wear: [],
  minFloat: "",
  maxFloat: "",
  phase: [],
  special: [],
};

const itemName = (it) => it.marketHashName || it.name || "";
const wearOf = (it) => it.wear || "NP";

function toNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// opts.priceOf(item) -> narx yoki null; opts.statusOf(item) -> "ok" | "locked" | "none".
export function applyFilters(items, f, { priceOf = () => null, statusOf = () => "ok" } = {}) {
  const pickedSubs = Object.entries(f.subs).filter(([, list]) => list.length > 0);
  const minP = toNum(f.minPrice);
  const maxP = toNum(f.maxPrice);
  const minF = toNum(f.minFloat);
  const maxF = toNum(f.maxFloat);

  return items.filter((it) => {
    if (pickedSubs.length > 0) {
      const { category, sub } = classifyItem(itemName(it));
      if (!pickedSubs.some(([cat, list]) => cat === category && list.includes(sub))) return false;
    }
    if (minP != null || maxP != null) {
      const p = priceOf(it);
      if (!Number.isFinite(p)) return false;
      if (minP != null && p < minP) return false;
      if (maxP != null && p > maxP) return false;
    }
    if (f.status.length > 0 && !f.status.includes(statusOf(it))) return false;
    if (f.rarity.length > 0 && !f.rarity.includes(normalizeRarity(it.rarity))) return false;
    if (f.wear.length > 0 && !f.wear.includes(wearOf(it))) return false;
    if (minF != null || maxF != null) {
      if (!Number.isFinite(it.float)) return false;
      if (minF != null && it.float < minF) return false;
      if (maxF != null && it.float > maxF) return false;
    }
    if (f.phase.length > 0 && !f.phase.includes(it.phase)) return false;
    if (f.special.length > 0) {
      const own = specialsOf(itemName(it));
      if (!f.special.some((s) => own.includes(s))) return false;
    }
    return true;
  });
}

// Filtr panelidagi sonlar: hamma itemlar bo'yicha bir marta hisoblanadi.
export function buildFacets(items, { statusOf = () => "ok" } = {}) {
  const facets = {
    categories: Object.fromEntries(CATEGORY_ORDER.map((c) => [c, { count: 0, subs: new Map() }])),
    rarity: {},
    wear: {},
    status: {},
    special: {},
    phases: {},
    hasFloat: false,
  };
  for (const it of items) {
    const name = itemName(it);
    const { category, sub } = classifyItem(name);
    const cat = facets.categories[category];
    cat.count++;
    const entry = cat.subs.get(sub);
    if (entry) entry.count++;
    else cat.subs.set(sub, { sub, count: 1, image: it.imageUrl || null });

    const r = normalizeRarity(it.rarity);
    if (r) facets.rarity[r] = (facets.rarity[r] || 0) + 1;
    const w = wearOf(it);
    facets.wear[w] = (facets.wear[w] || 0) + 1;
    const s = statusOf(it);
    facets.status[s] = (facets.status[s] || 0) + 1;
    for (const sp of specialsOf(name)) facets.special[sp] = (facets.special[sp] || 0) + 1;
    if (it.phase) facets.phases[it.phase] = (facets.phases[it.phase] || 0) + 1;
    if (Number.isFinite(it.float)) facets.hasFloat = true;
  }
  return facets;
}

export function countActiveFilters(f) {
  let n = Object.values(f.subs).reduce((s, list) => s + list.length, 0);
  if (f.minPrice !== "" || f.maxPrice !== "") n++;
  if (f.minFloat !== "" || f.maxFloat !== "") n++;
  return n + f.status.length + f.rarity.length + f.wear.length + f.phase.length + f.special.length;
}
