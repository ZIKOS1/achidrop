import { useState } from "react";
import { ChevronDown, Heart, X } from "lucide-react";
import { t } from "../i18n";
import { RARITY_COLORS } from "../utils";

// wearColor()dagi (utils.js) 5 ta chegara qiymatiga mos ranglar — o'sha
// funksiya bitta float qiymatini oladi, bu yerda esa kod bo'yicha to'g'ridan
// -to'g'ri kerak, shu sabab bir xil ranglar shu yerda ham qayd etilgan
// (WearBadge/cardlardagi rang bilan bir xil bo'lishi uchun).
const WEAR_OPTIONS = [
  { code: "FN", label: "Factory New", color: "#1acfdf" },
  { code: "MW", label: "Minimal Wear", color: "#37bb62" },
  { code: "FT", label: "Field-Tested", color: "#f2a618" },
  { code: "WW", label: "Well-Worn", color: "#f3680f" },
  { code: "BS", label: "Battle-Scarred", color: "#ee343b" },
];

const RARITY_OPTIONS = ["Covert", "Classified", "Restricted", "Mil-Spec"];

const STATUS_OPTIONS = [
  { key: "all", labelKey: "filter.statusAll" },
  { key: "active", labelKey: "filter.statusActive" },
  { key: "ending", labelKey: "filter.statusEnding" },
];

export const EMPTY_FILTERS = { minPrice: "", maxPrice: "", status: "all", favoritesOnly: false, wear: [], rarity: [] };

export function countActiveFilters(f) {
  let n = 0;
  if (f.minPrice !== "") n++;
  if (f.maxPrice !== "") n++;
  if (f.status !== "all") n++;
  if (f.favoritesOnly) n++;
  n += f.wear.length + f.rarity.length;
  return n;
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/10 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wide text-foreground"
      >
        {title}
        <ChevronDown className={"size-3.5 text-muted-foreground transition-transform duration-200 " + (open ? "rotate-180" : "")} />
      </button>
      {open && <div className="mt-3 space-y-2.5">{children}</div>}
    </div>
  );
}

function toggleInArray(arr, val) {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

function FilterContent({ filters, onChange }) {
  const set = (patch) => onChange({ ...filters, ...patch });

  return (
    <>
      <Section title={t("filter.price")}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={filters.minPrice}
            onChange={(e) => set({ minPrice: e.target.value })}
            placeholder={t("filter.priceFrom")}
            className="w-full border border-white/10 bg-[#1a1a1a] px-2.5 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <span className="text-muted-foreground">—</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={filters.maxPrice}
            onChange={(e) => set({ maxPrice: e.target.value })}
            placeholder={t("filter.priceTo")}
            className="w-full border border-white/10 bg-[#1a1a1a] px-2.5 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
      </Section>

      <Section title={t("filter.status")}>
        {STATUS_OPTIONS.map((s) => (
          <label key={s.key} className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
            <span
              className={
                "flex size-4 shrink-0 items-center justify-center rounded-full border " +
                (filters.status === s.key ? "border-primary" : "border-white/20")
              }
              onClick={() => set({ status: s.key })}
            >
              {filters.status === s.key && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span onClick={() => set({ status: s.key })} className="cursor-pointer">
              {t(s.labelKey)}
              {s.key === "active" && " 🔥"}
            </span>
          </label>
        ))}
      </Section>

      <Section title={t("filter.favorites")}>
        <label className="flex cursor-pointer items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <Heart className="size-4 text-primary" />
            {t("filter.favoritesOnly")}
          </span>
          <span
            onClick={() => set({ favoritesOnly: !filters.favoritesOnly })}
            className={"relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors " + (filters.favoritesOnly ? "bg-primary" : "bg-white/15")}
          >
            <span
              className={"absolute top-0.5 size-4 rounded-full bg-white transition-transform " + (filters.favoritesOnly ? "translate-x-4" : "translate-x-0.5")}
            />
          </span>
        </label>
      </Section>

      <Section title={t("filter.wear")}>
        {WEAR_OPTIONS.map((w) => {
          const checked = filters.wear.includes(w.code);
          return (
            <label
              key={w.code}
              onClick={() => set({ wear: toggleInArray(filters.wear, w.code) })}
              className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground"
            >
              <span className={"flex size-4 shrink-0 items-center justify-center rounded-sm border " + (checked ? "border-primary bg-primary" : "border-white/20")}>
                {checked && <span className="size-2 rounded-sm bg-primary-foreground" />}
              </span>
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: w.color }} />
              <span>{w.code} — {w.label}</span>
            </label>
          );
        })}
      </Section>

      <Section title={t("filter.rarity")}>
        {RARITY_OPTIONS.map((r) => {
          const checked = filters.rarity.includes(r);
          return (
            <label
              key={r}
              onClick={() => set({ rarity: toggleInArray(filters.rarity, r) })}
              className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground"
            >
              <span className={"flex size-4 shrink-0 items-center justify-center rounded-sm border " + (checked ? "border-primary bg-primary" : "border-white/20")}>
                {checked && <span className="size-2 rounded-sm bg-primary-foreground" />}
              </span>
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: RARITY_COLORS[r] }} />
              <span>{t(`rarity.${r}`)}</span>
            </label>
          );
        })}
      </Section>
    </>
  );
}

// lis-skins.com uslubidagi chapdan ochiladigan filtr paneli. Desktopda
// (lg+) inline joylashadi va eni animatsiya bilan 0 -> 260px o'zgaradi
// (lenta shunga qarab siljiydi/torayadi). Mobilda to'liq ekran overlay —
// ikkalasi ham bir xil <FilterContent> bo'limlarini ishlatadi, faqat
// tashqi qobiq/joylashuv farqli, shu sabab bo'limlar mantig'i bitta joyda.
export default function FilterSidebar({ open, onClose, filters, onChange }) {
  return (
    <>
      {/* Mobil: to'liq ekran overlay */}
      <div className={"fixed inset-0 z-50 lg:hidden " + (open ? "" : "pointer-events-none")}>
        <div
          onClick={onClose}
          className={"absolute inset-0 bg-black/70 transition-opacity duration-300 " + (open ? "opacity-100" : "opacity-0")}
        />
        <div
          className={
            "absolute inset-y-0 left-0 flex w-full max-w-[340px] flex-col bg-[#111] transition-transform duration-300 ease-in-out " +
            (open ? "translate-x-0" : "-translate-x-full")
          }
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
            <span className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">{t("filter.title")}</span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                {t("filter.clearAll")}
              </button>
              <button type="button" onClick={onClose} aria-label={t("common.close")} className="text-muted-foreground hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-4">
            <FilterContent filters={filters} onChange={onChange} />
          </div>
        </div>
      </div>

      {/* Desktop: inline slide (eni animatsiyalanadi, lenta o'ngga siljiydi) */}
      <div className={"hidden shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out lg:block " + (open ? "w-[260px]" : "w-0")}>
        <div className="scrollbar-thin h-full w-[260px] overflow-y-auto border border-white/10 bg-[#111] px-4">
          <div className="flex items-center justify-between border-b border-white/10 py-3.5">
            <span className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">{t("filter.title")}</span>
            <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="text-xs font-medium text-muted-foreground hover:text-foreground">
              {t("filter.clearAll")}
            </button>
          </div>
          <FilterContent filters={filters} onChange={onChange} />
        </div>
      </div>
    </>
  );
}
