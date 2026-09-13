import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, LayoutGrid, Sword, Hand, CircleDot, Radar, Target, Crosshair, Bomb } from "lucide-react";
import { t } from "../i18n";
import { CATEGORY_WEAPONS, weaponImagePath } from "../utils";

const CATEGORY_ORDER = ["pichoq", "qolqop", "pistolet", "smg", "miltiq", "snayper", "ogir"];

const CATEGORY_ICONS = {
  pichoq: Sword,
  qolqop: Hand,
  pistolet: CircleDot,
  smg: Radar,
  miltiq: Target,
  snayper: Crosshair,
  ogir: Bomb,
};

// lis-skins.com uslubidagi kategoriya filtri: har bir tugma bosilganda
// o'sha toifaning TO'LIQ qurol ro'yxati checkbox holida ochiladi (dropdown),
// bir nechta qurol/kategoriya birdaniga tanlanishi mumkin. `value` — har bir
// kategoriya kaliti bo'yicha tanlangan qurol nomlari massivi:
// { pichoq: ["Karambit", "M9 Bayonet"], pistolet: ["Glock-18"] }.
// Auctions.jsx bu obyektni tekislab (flatten), auksion nomiga substring
// sifatida solishtiradi — eski guessCategory() bilan bir xil mantiq,
// faqat endi tanlash aniq va ko'p martalik.
export default function CategoryFilterBar({ value, onChange }) {
  const [openKey, setOpenKey] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    function onDocPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpenKey(null);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, []);

  function toggleWeapon(catKey, weapon) {
    const current = new Set(value[catKey] || []);
    if (current.has(weapon)) current.delete(weapon);
    else current.add(weapon);
    const next = { ...value };
    if (current.size === 0) delete next[catKey];
    else next[catKey] = [...current];
    onChange(next);
  }

  function toggleAll(catKey) {
    const weapons = CATEGORY_WEAPONS[catKey];
    const current = value[catKey] || [];
    const next = { ...value };
    if (current.length === weapons.length) delete next[catKey];
    else next[catKey] = [...weapons];
    onChange(next);
  }

  const hasAny = Object.keys(value).length > 0;

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => { onChange({}); setOpenKey(null); }}
        className={
          "flex items-center gap-1.5 px-4 py-2 font-heading text-sm font-semibold uppercase tracking-wide transition-all duration-200 " +
          (!hasAny
            ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_color-mix(in_oklch,var(--primary)_70%,transparent)]"
            : "border border-border bg-card text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground")
        }
      >
        <LayoutGrid className="size-4" />
        {t("cat.all")}
      </button>

      {CATEGORY_ORDER.map((catKey) => {
        const Icon = CATEGORY_ICONS[catKey];
        const weapons = CATEGORY_WEAPONS[catKey];
        const selected = value[catKey] || [];
        const isOpen = openKey === catKey;
        const isActive = selected.length > 0;

        return (
          <div key={catKey} className="relative">
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : catKey)}
              className={
                "flex items-center gap-1.5 px-4 py-2 font-heading text-sm font-semibold uppercase tracking-wide transition-all duration-200 " +
                (isActive
                  ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_color-mix(in_oklch,var(--primary)_70%,transparent)]"
                  : "border border-border bg-card text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground")
              }
            >
              <Icon className="size-4" />
              {t(`cat.${catKey}`)}
              {isActive && <span className="opacity-80">({selected.length})</span>}
              <ChevronDown className={"size-3.5 transition-transform duration-200 " + (isOpen ? "rotate-180" : "")} />
            </button>

            {isOpen && (
              <div
                className="animate-fade-up absolute left-0 top-full z-30 mt-2 w-72 overflow-hidden border border-border bg-[#0d0d0d] shadow-panel-lg max-sm:left-1/2 max-sm:w-[calc(100vw-1.5rem)] max-sm:-translate-x-1/2 sm:w-72"
              >
                <div
                  role="checkbox"
                  aria-checked={selected.length === weapons.length}
                  tabIndex={0}
                  onClick={() => toggleAll(catKey)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleAll(catKey); } }}
                  className="flex cursor-pointer items-center justify-between gap-2 border-b border-border bg-[#1a1a1a] px-3 py-2.5"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-foreground">{t("cat.selectAll")}</span>
                  <CategoryCheckbox checked={selected.length === weapons.length} />
                </div>

                <div className="scrollbar-thin max-h-80 overflow-y-auto">
                  {weapons.map((weapon) => {
                    const checked = selected.includes(weapon);
                    return (
                      <div
                        key={weapon}
                        role="checkbox"
                        aria-checked={checked}
                        tabIndex={0}
                        onClick={() => toggleWeapon(catKey, weapon)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleWeapon(catKey, weapon); } }}
                        className={
                          "flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-white/5 " +
                          (checked ? "bg-primary/10" : "")
                        }
                      >
                        <span className="flex h-7 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary/40">
                          <img
                            src={weaponImagePath(weapon)}
                            alt=""
                            className="h-full w-full object-contain"
                            loading="lazy"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        </span>
                        <span className="flex-1 truncate text-sm text-foreground">{weapon}</span>
                        <CategoryCheckbox checked={checked} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {hasAny && (
        <button
          type="button"
          onClick={() => { onChange({}); setOpenKey(null); }}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("cat.clearFilters")}
        </button>
      )}
    </div>
  );
}

function CategoryCheckbox({ checked }) {
  return (
    <span
      className={
        "flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors " +
        (checked ? "border-primary bg-primary" : "border-border bg-transparent")
      }
    >
      {checked && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
    </span>
  );
}
