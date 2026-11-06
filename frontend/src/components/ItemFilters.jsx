import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Check, ChevronDown, Package, Shapes, Sticker, UserRound, X } from "lucide-react";
import { hap, imgSrc } from "../utils";
import { t } from "../i18n";
import { cn } from "../lib/cn";
import { CATEGORY_ORDER, EMPTY_FILTERS, RARITY_DOT, RARITY_GROUPS, SPECIAL_OPTIONS, WEAR_OPTIONS, countActiveFilters } from "../lib/itemFilters";

// lis-skins.com uslubidagi filtr: tepada turlar paneli (pichoq, stiker, agent,
// case ...), chapda narx/nodirlik/sifat bo'limlari. Telefonda turlar gorizontal
// aylanadi va pastdan ochiladi, bo'limlar esa alohida panelda chiqadi.

const STATUS_OPTIONS = ["ok", "locked", "none"];

// Har bir tur uchun o'sha turdagi eng qimmat va taniqli itemlardan birining rasmi
// (Steam CDN, saytdagi boshqa skin rasmlari bilan bir xil manba). Bu rasmlar
// Steam'da faqat PNG, SVG varianti yo'q.
const CDN = "https://community.akamai.steamstatic.com/economy/image/";
const CATEGORY_ART = {
  // ★ Karambit | Fade
  knife: "i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q7uCvZaZkNM-SD1iWwOpzj-1gSCGn20tztm_UyIn_JHKUbgYlWMcmQ-ZcskSwldS0MOnntAfd3YlMzH35jntXrnE8SOGRGG8",
  // Desert Eagle | Blaze
  pistol: "i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL1m5fn8Sdk7vORbqhsLfWAMWuZxuZi_uI_TX6wxxkjsGXXnImsJ37COlUoWcByEOMOtxa5kdXmNu3htVPZjN1bjXKpkHLRfQU",
  // M4A4 | Howl
  rifle: "i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiFO0P_6afVSKP-EAm6extF6ueZhW2exwkl2tmTXwt39eCiUPQR2DMN4TOVetUK8xoLgM-K341eM2otDnC6okGoXufBz_TAB",
  // AWP | Dragon Lore
  sniper: "i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk4veqYaF7IfysCnWRxuF4j-B-Xxa_nBovp3Pdwtj9cC_GaAd0DZdwQu9fuhS4kNy0NePntVTbjYpCyyT_3CgY5i9j_a9cBkcCWUKV",
  // MP9 | Wild Lily
  smg: "i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8js_f_jdk4uL3V61-LPGdCliWzeFkse1WQyC0nQlp4WuHz4mpcCrDZ1QhCcR5FrUJtkK9lNPuYezh4gDf2ItNxCr8iypJujErvbjAJv0dlg",
  // XM1014 | Tranquility
  shotgun: "i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLpk8ewrHZk7OeRcKk8cKHHMWSR0-disfJWQyC0nQlp5zjWnNigIC-falMlWMN2F-cP5Ba-xoXlMri0swTZg41EyX34jS1LuDErvbgNI5zBZg",
  // M249 | Emerald Poison Dart
  machinegun: "i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8zMK5wjFL0P_8PP1SJuKcCVif0-dxue9oQxa_nBovp3PRzNb8JX2VO1IpDsclRrEPtxXtxNSxYuuw4QHai9gWyCT2j3gYuHlt_a9cBlcR8wa2",
  // ★ Sport Gloves | Pandora's Box
  gloves: "i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tk5UvzWCL2kpn2-DFk_OKherB0H-CGHHecxNF6ueZhW2exk01w4j7cmYn4eHPCbAMhApdwTOIN5BPsx9yyYu605FTeid0Uy3j3kGoXueKyz5wo",
  // Sticker | iBUYPOWER (Holo) | Katowice 2014
  sticker: "i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJai0ki7VeTHjM-sJnCW8Vli_YTxuAm2FVL4nIP57S1M6uCRYKthL77KW2XAkr91tLQ-S33iwhly62jcn9yrcy2fOlBxA5JyRuVf40W7xoC2Kaq8sK3FB_Eg",
  // Sir Bloody Miami Darryl | The Professionals
  agent: "i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIa-2lmxU-LR0dnuNm6E8Vl45Iv181z1fgn8oYby8iRe_OGnZ6psLM-FD3WWj-gn47Q-GH7qxkhwsWjWyN6pJynGZld0CJR3QOdbtRa4lIGxY7_g7wfAy9USZdxTISw",
  // CS:GO Weapon Case
  case: "i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bji61XxRCKg0MSz_nUDvPb-OPFvdKTFDzbAkbp16bY5Gn6wkx9ysj7Xntf9IC6WZgA-Sswnnj45WXo",
  // Charm | Lil' Squirt
  other: "i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGI6zwki4Uf_a0IW2MHqH6lhKpcj_6WbwURPOk8LhrDFk_OHgO_FrcaOWXz7ClL505rI7F3_jx0kh42uEyomrICqSagcmDsd0EOZZsQ74zINE7a8Rng",
};

// CDN ochilmasa zaxira sifatida oddiy icon ko'rsatiladi.
const FALLBACK_ICONS = { sticker: Sticker, agent: UserRound, case: Box, other: Shapes };

function CategoryIcon({ category }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    const Icon = FALLBACK_ICONS[category] || Shapes;
    return <Icon className="size-[18px] shrink-0" />;
  }
  return (
    <img
      src={`${CDN}${CATEGORY_ART[category]}/96fx96f`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-8 w-11 shrink-0 rounded-none object-contain"
    />
  );
}

export function subLabel(sub) {
  const key = `ifilter.sub.${sub}`;
  const text = t(key);
  return text === key ? sub : text;
}

function useIsPhone() {
  const query = "(max-width: 639px)";
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return phone;
}

// Panel ochiq turganda orqa sahifa aylanmasin, Escape yopsin.
function useOverlay(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
}

function Box3({ checked }) {
  return (
    <span className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors", checked ? "border-[#E3141F] bg-[#E3141F] text-white" : "border-[var(--ad-line)] bg-black/15")}>
      {checked && <Check className="size-3" strokeWidth={3.5} />}
    </span>
  );
}

function CheckRow({ checked, onToggle, label, dot, count, image, showImage }) {
  const empty = count === 0 && !checked;
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 text-[14.5px] text-foreground transition-colors hover:bg-[var(--row-hov)] sm:min-h-9 sm:text-sm", empty && "opacity-40", checked && "font-medium")}>
      <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />
      <Box3 checked={checked} />
      {showImage && (
        <span className="flex h-8 w-11 shrink-0 items-center justify-center">
          {image ? <img src={imgSrc(image)} alt="" loading="lazy" className="max-h-full max-w-full rounded-none object-contain" /> : <Package className="size-4 text-muted-foreground" />}
        </span>
      )}
      {dot && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>}
    </label>
  );
}

// Bitta tur ichidagi ro'yxat: "Hammasini tanlash" + inventarda bor kichik turlar.
function SubList({ category, facets, filters, onChange }) {
  const subs = [...facets.categories[category].subs.values()].sort((a, b) => a.sub.localeCompare(b.sub));
  const selected = filters.subs[category] || [];
  const allOn = subs.length > 0 && subs.every((s) => selected.includes(s.sub));

  function setSubs(list) {
    const next = { ...filters.subs };
    if (list.length) next[category] = list;
    else delete next[category];
    onChange({ ...filters, subs: next });
    hap("selection");
  }
  const toggle = (sub) => setSubs(selected.includes(sub) ? selected.filter((x) => x !== sub) : [...selected, sub]);

  return (
    <>
      <label className="flex min-h-12 cursor-pointer items-center gap-2.5 border-b border-[var(--ad-line)] px-3 text-[14.5px] font-semibold text-foreground sm:min-h-10 sm:text-sm">
        <input type="checkbox" checked={allOn} onChange={() => setSubs(allOn ? [] : subs.map((s) => s.sub))} className="sr-only" />
        <Box3 checked={allOn} />
        <span className="flex-1">{t("cat.selectAll")}</span>
        <span className="text-xs font-normal tabular-nums text-muted-foreground">{facets.categories[category].count}</span>
      </label>
      <div className="scrollbar-thin overflow-y-auto overscroll-contain p-1.5 sm:max-h-80">
        {subs.map((s) => (
          <CheckRow key={s.sub} showImage image={s.image} label={subLabel(s.sub)} count={s.count} checked={selected.includes(s.sub)} onToggle={() => toggle(s.sub)} />
        ))}
      </div>
    </>
  );
}

export function CategoryBar({ facets, filters, onChange }) {
  const [openKey, setOpenKey] = useState(null);
  const [alignRight, setAlignRight] = useState(false);
  const rootRef = useRef(null);
  const phone = useIsPhone();
  const close = () => setOpenKey(null);
  useOverlay(phone && !!openKey, close);

  useEffect(() => {
    if (!openKey || phone) return;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) close(); };
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openKey, phone]);

  function toggleOpen(cat, e) {
    hap("selection");
    if (openKey === cat) return close();
    setAlignRight(e.currentTarget.getBoundingClientRect().left + 300 > window.innerWidth);
    setOpenKey(cat);
  }

  return (
    <>
      <div ref={rootRef} className="ad-panel -mx-3.5 flex gap-0.5 overflow-x-auto border-x-0 p-1.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:rounded-[14px] sm:border-x">
        {CATEGORY_ORDER.map((cat) => {
          const count = facets.categories[cat].count;
          const picked = (filters.subs[cat] || []).length;
          const isOpen = openKey === cat;
          return (
            <div key={cat} className="relative shrink-0">
              <button
                type="button"
                disabled={count === 0}
                aria-expanded={isOpen}
                onClick={(e) => toggleOpen(cat, e)}
                className={cn(
                  "flex h-11 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-2.5 text-[14.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 sm:h-10",
                  picked > 0 ? "bg-[var(--row-sel)] text-primary" : isOpen ? "bg-[var(--row-hov)] text-foreground" : "text-muted-foreground hover:bg-[var(--row-hov)] hover:text-foreground"
                )}
              >
                <CategoryIcon category={cat} />
                {t(`ifilter.cat.${cat}`)}
                {picked > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#E3141F] px-1 text-[11px] font-bold tabular-nums text-white">{picked}</span>}
                <ChevronDown className={cn("size-3.5 opacity-70 transition-transform duration-200", isOpen && "rotate-180")} />
              </button>
              {isOpen && !phone && (
                <div className={cn("menu-in absolute top-full z-40 mt-1.5 w-[300px] overflow-hidden rounded-2xl border border-border bg-popover shadow-panel-lg", alignRight ? "right-0" : "left-0")}>
                  <SubList category={cat} facets={facets} filters={filters} onChange={onChange} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {phone && openKey && createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="scrim-in absolute inset-0 bg-[rgba(5,5,8,.65)]" onClick={close} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label={t(`ifilter.cat.${openKey}`)} className="sheet-in relative flex max-h-[80dvh] flex-col rounded-t-[20px] border-t border-border bg-popover">
            <div className="flex items-center gap-2 px-4 pb-2 pt-3.5 text-foreground">
              <CategoryIcon category={openKey} />
              <span className="flex-1 text-base font-bold">{t(`ifilter.cat.${openKey}`)}</span>
              <button type="button" onClick={close} aria-label={t("common.close")} className="-mr-1.5 flex size-11 items-center justify-center text-muted-foreground"><X className="size-5" /></button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <SubList category={openKey} facets={facets} filters={filters} onChange={onChange} />
            </div>
            <div className="border-t border-border p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={close} className="btn-grad h-12 w-full rounded-[14px] text-[15px] font-semibold">{t("ifilter.done")}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[var(--ad-line)] py-2.5 last:border-b-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-9 w-full items-center justify-between text-[15px] font-semibold text-foreground sm:text-sm">
        {title}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

function RangeInputs({ from, to, onFrom, onTo, fromLabel, toLabel, decimal }) {
  const cls = "h-11 w-full min-w-0 bg-transparent px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground sm:h-10";
  const common = { type: "number", min: 0, inputMode: decimal ? "decimal" : "numeric", step: decimal ? "0.01" : undefined, max: decimal ? 1 : undefined };
  return (
    <div className="ad-field flex divide-x divide-[var(--ad-line)] overflow-hidden rounded-[10px] focus-within:!border-ring">
      <input {...common} value={from} onChange={(e) => onFrom(e.target.value)} placeholder={fromLabel} aria-label={fromLabel} className={cls} />
      <input {...common} value={to} onChange={(e) => onTo(e.target.value)} placeholder={toLabel} aria-label={toLabel} className={cls} />
    </div>
  );
}

const toggleIn = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function FilterPanel({ facets, filters, onChange }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const toggle = (field, v) => { set({ [field]: toggleIn(filters[field], v) }); hap("selection"); };
  const phases = Object.keys(facets.phases).sort();
  const rarityGroups = RARITY_GROUPS.filter((g) => g.options.some((o) => facets.rarity[o] || filters.rarity.includes(o)));

  return (
    <>
      <Section title={t("filter.price")}>
        <RangeInputs
          from={filters.minPrice} to={filters.maxPrice}
          onFrom={(v) => set({ minPrice: v })} onTo={(v) => set({ maxPrice: v })}
          fromLabel={t("ifilter.from")} toLabel={t("ifilter.to")}
        />
      </Section>

      <Section title={t("ifilter.status")}>
        {STATUS_OPTIONS.map((s) => (
          <CheckRow key={s} label={t(`ifilter.status.${s}`)} count={facets.status[s] || 0} checked={filters.status.includes(s)} onToggle={() => toggle("status", s)} />
        ))}
      </Section>

      {rarityGroups.length > 0 && (
        <Section title={t("ifilter.rarity")}>
          {rarityGroups.map((g) => (
            <div key={g.key} className="mb-1 last:mb-0">
              {rarityGroups.length > 1 && <p className="px-1.5 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t(`ifilter.rarity.${g.key}`)}</p>}
              {g.options.map((r) => (
                <CheckRow key={r} dot={RARITY_DOT[r]} label={t(`ifilter.r.${r}`)} count={facets.rarity[r] || 0} checked={filters.rarity.includes(r)} onToggle={() => toggle("rarity", r)} />
              ))}
            </div>
          ))}
        </Section>
      )}

      <Section title={t("ifilter.wear")}>
        {WEAR_OPTIONS.map((w) => (
          <CheckRow key={w.code} dot={w.color} label={w.label} count={facets.wear[w.code] || 0} checked={filters.wear.includes(w.code)} onToggle={() => toggle("wear", w.code)} />
        ))}
      </Section>

      {facets.hasFloat && (
        <Section title={t("ifilter.float")}>
          <RangeInputs
            decimal
            from={filters.minFloat} to={filters.maxFloat}
            onFrom={(v) => set({ minFloat: v })} onTo={(v) => set({ maxFloat: v })}
            fromLabel={t("ifilter.from")} toLabel={t("ifilter.to")}
          />
        </Section>
      )}

      {phases.length > 0 && (
        <Section title={t("ifilter.phase")}>
          {phases.map((p) => (
            <CheckRow key={p} label={p} count={facets.phases[p]} checked={filters.phase.includes(p)} onToggle={() => toggle("phase", p)} />
          ))}
        </Section>
      )}

      <Section title={t("ifilter.special")}>
        {SPECIAL_OPTIONS.map((s) => (
          <CheckRow key={s} label={t(`ifilter.special.${s}`)} count={facets.special[s] || 0} checked={filters.special.includes(s)} onToggle={() => toggle("special", s)} />
        ))}
      </Section>
    </>
  );
}

// 2xl dan kichik ekranlarda bo'limlar chapdan chiqadigan panelda; telefonda butun ekran.
export function FilterDrawer({ open, onClose, facets, filters, onChange, resultCount }) {
  useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div className="scrim-in absolute inset-0 bg-[rgba(5,5,8,.65)]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={t("filter.title")} className="drawer-in absolute inset-y-0 left-0 flex w-full flex-col bg-popover sm:w-[360px] sm:border-r sm:border-border">
        <div className="flex items-center justify-between border-b border-border py-1.5 pl-4 pr-2">
          <span className="text-lg font-bold text-foreground">{t("filter.title")}</span>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex size-11 items-center justify-center text-muted-foreground"><X className="size-5" /></button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
          <FilterPanel facets={facets} filters={filters} onChange={onChange} />
        </div>
        <div className="flex gap-2 border-t border-border p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => onChange(EMPTY_FILTERS)} disabled={countActiveFilters(filters) === 0} className="ad-field h-12 shrink-0 rounded-[14px] px-4 text-[15px] font-medium text-foreground disabled:opacity-40">{t("filter.clearAll")}</button>
          <button type="button" onClick={onClose} className="btn-grad h-12 min-w-0 flex-1 rounded-[14px] text-[15px] font-semibold">{t("ifilter.show", { n: resultCount })}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Tanlangan filtrlar: har biri alohida olib tashlanadi.
export function ActiveChips({ filters, onChange }) {
  if (countActiveFilters(filters) === 0) return null;
  const chips = [];
  for (const [cat, list] of Object.entries(filters.subs)) {
    for (const sub of list) {
      const rest = list.filter((x) => x !== sub);
      chips.push({
        key: `sub-${cat}-${sub}`,
        label: subLabel(sub),
        remove: () => {
          const subs = { ...filters.subs };
          if (rest.length) subs[cat] = rest;
          else delete subs[cat];
          onChange({ ...filters, subs });
        },
      });
    }
  }
  const range = (a, b) => `${a === "" ? "0" : a} – ${b === "" ? "∞" : b}`;
  if (filters.minPrice !== "" || filters.maxPrice !== "") {
    chips.push({ key: "price", label: `${t("filter.price")}: ${range(filters.minPrice, filters.maxPrice)}`, remove: () => onChange({ ...filters, minPrice: "", maxPrice: "" }) });
  }
  if (filters.minFloat !== "" || filters.maxFloat !== "") {
    chips.push({ key: "float", label: `${t("ifilter.float")}: ${range(filters.minFloat, filters.maxFloat)}`, remove: () => onChange({ ...filters, minFloat: "", maxFloat: "" }) });
  }
  const listChips = (field, labelOf) => {
    for (const v of filters[field]) {
      chips.push({ key: `${field}-${v}`, label: labelOf(v), remove: () => onChange({ ...filters, [field]: filters[field].filter((x) => x !== v) }) });
    }
  };
  listChips("status", (v) => t(`ifilter.status.${v}`));
  listChips("rarity", (v) => t(`ifilter.r.${v}`));
  listChips("wear", (v) => WEAR_OPTIONS.find((w) => w.code === v)?.label || v);
  listChips("phase", (v) => v);
  listChips("special", (v) => t(`ifilter.special.${v}`));

  return (
    <div className="-mx-3.5 flex items-center gap-1.5 overflow-x-auto px-3.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {chips.map((c) => (
        <button key={c.key} type="button" onClick={c.remove} className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[rgba(227,20,31,.5)] bg-[var(--row-sel)] pl-3 pr-2 text-[13px] font-medium text-foreground transition-colors hover:border-[#E3141F] sm:h-8">
          {c.label}
          <X className="size-3.5 text-primary" />
        </button>
      ))}
      <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="h-9 shrink-0 whitespace-nowrap px-2 text-[13px] font-medium text-primary underline-offset-2 hover:underline sm:h-8">
        {t("cat.clearFilters")}
      </button>
    </div>
  );
}
