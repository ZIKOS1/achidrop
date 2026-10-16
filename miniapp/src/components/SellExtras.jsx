import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { BadgeCheck, ChevronDown, CreditCard, Headphones, MousePointerClick, Package, Send, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { imgSrc, fmtMoney } from "../utils";
import { t } from "../i18n";
import { cn } from "../lib/cn";
import { SteamLogo } from "./BrandIcons";

// Skin sotish sahifasining bezak va ishonch elementlari. Raqamlar faqat
// haqiqiy ma'lumotdan (/api/public-stats) — soxta statistika/sharh yo'q.

// ── Turkumlar (filtr chiplari) ───────────────────────────────────────────────
export const SELL_CATEGORIES = ["all", "weapon", "knife", "gloves", "case", "other"];

export function sellCategory(name = "") {
  if (name.startsWith("★")) return /Gloves|Hand Wraps/i.test(name) ? "gloves" : "knife";
  if (/^(Sticker|Charm|Music Kit|Patch|Sealed Graffiti|Graffiti)\b/i.test(name)) return "other";
  if (/\b(Case|Capsule|Package|Terminal|Souvenir Package)\b/i.test(name) && !name.includes(" | ")) return "case";
  if (name.includes(" | ")) return "weapon";
  return "other";
}

// ── Sanab chiqadigan raqam (count-up) ─────────────────────────────────────────
function CountUp({ value, format = (v) => v.toLocaleString(), duration = 1200 }) {
  const [shown, setShown] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(value); return; }
    let raf, start;
    const step = (ts) => {
      start ??= ts;
      const p = Math.min(1, (ts - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span ref={ref}>{format(shown)}</span>;
}

// ── Bosh blok bezagi: suzuvchi nur doiralari + eng qimmat skinlar ─────────────
export function HeroDecor({ images = [] }) {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="orb-drift absolute -right-16 -top-24 size-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="orb-drift-slow absolute -bottom-28 left-1/4 size-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="hero-grid absolute inset-0 opacity-[0.35]" />
      </div>
      {images.length > 0 && (
        <div aria-hidden className="pointer-events-none absolute right-4 top-1/2 hidden h-40 w-72 -translate-y-1/2 lg:block xl:w-96">
          {images.slice(0, 3).map((src, i) => (
            <img
              key={src}
              src={imgSrc(src)}
              alt=""
              className="float-skin absolute max-h-24 object-contain opacity-80 drop-shadow-[0_12px_18px_rgba(0,0,0,0.45)]"
              style={{
                right: `${i * 28}%`,
                top: `${[10, 45, 0][i]}%`,
                width: `${[46, 36, 32][i]}%`,
                animationDelay: `${i * -1.6}s`,
                transform: `rotate(${[-8, 6, -4][i]}deg)`,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── Ishonch belgilari (haqiqiy xususiyatlar) ─────────────────────────────────
export function TrustBadges() {
  const items = [
    { icon: ShieldCheck, key: "safe" },
    { icon: CreditCard, key: "cards" },
    { icon: BadgeCheck, key: "fair" },
    { icon: Headphones, key: "support" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {items.map(({ icon: Icon, key }, i) => (
        <div
          key={key}
          className="animate-fade-up group flex items-center gap-3 rounded-xl border border-border bg-card/70 p-3 transition-colors hover:border-primary/40"
          style={{ "--fade-delay": `${i * 70}ms` }}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary transition-transform duration-300 group-hover:scale-110">
            <Icon className="size-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground">{t(`sellx.trust.${key}`)}</p>
            <p className="text-[11px] leading-tight text-muted-foreground">{t(`sellx.trust.${key}Desc`)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Statistika (faqat yetarli real ma'lumot bo'lganda ko'rsatiladi) ──────────
export function TrustStats({ stats }) {
  if (!stats || stats.deals < 5) return null;
  const tiles = [
    { label: t("sellx.stats.skins"), value: stats.skins, fmt: (v) => v.toLocaleString() },
    { label: t("sellx.stats.paid"), value: stats.paidSom, fmt: fmtMoney },
    { label: t("sellx.stats.deals"), value: stats.deals, fmt: (v) => v.toLocaleString() },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((tile) => (
        <div key={tile.label} className="relative overflow-hidden rounded-xl border border-border bg-card p-3 text-center">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 mx-auto size-24 rounded-full bg-primary/10 blur-2xl" />
          <p className="relative font-heading text-lg font-bold text-foreground sm:text-2xl"><CountUp value={tile.value} format={tile.fmt} /></p>
          <p className="relative text-[10px] uppercase tracking-wider text-muted-foreground">{tile.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── "So'nggi sotuvlar" — uzluksiz aylanuvchi lenta (ismlarsiz) ────────────────
function ago(iso) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return t("sellx.ago.min", { n: m });
  const h = Math.round(m / 60);
  if (h < 48) return t("sellx.ago.hour", { n: h });
  return t("sellx.ago.day", { n: Math.round(h / 24) });
}

export function RecentSales({ recent }) {
  if (!recent || recent.length < 3) return null;
  const row = [...recent, ...recent]; // ikki nusxa — chok ko'rinmasin (ticker -50%)
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card/60">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        <p className="font-heading text-[11px] font-bold uppercase tracking-wider text-foreground">{t("sellx.recent")}</p>
      </div>
      <div className="mask-fade-x py-2.5">
        <div className="ticker-track flex w-max gap-3 px-3" style={{ animationDuration: `${Math.max(25, recent.length * 5)}s` }}>
          {row.map((r, i) => (
            <div key={i} className="flex shrink-0 items-center gap-2.5 rounded-lg border border-border bg-background/60 py-1.5 pl-1.5 pr-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-secondary">
                {r.imageUrl ? <img src={imgSrc(r.imageUrl)} alt="" className="max-h-full max-w-full object-contain" /> : <Package className="size-4 text-muted-foreground" />}
              </span>
              <span className="min-w-0">
                <span className="block max-w-[150px] truncate text-[11px] font-medium text-foreground">{r.name}</span>
                <span className="flex items-center gap-1.5 text-[10px]">
                  <span className="font-semibold text-success">{fmtMoney(r.priceSom)}</span>
                  <span className="text-muted-foreground">· {ago(r.at)}</span>
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Qanday ishlaydi ──────────────────────────────────────────────────────────
export function HowItWorks() {
  const steps = [
    { icon: SteamLogo, key: "s1" },
    { icon: MousePointerClick, key: "s2" },
    { icon: Send, key: "s3" },
    { icon: Wallet, key: "s4" },
  ];
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-panel sm:p-6">
      <h2 className="flex items-center gap-2 font-heading text-base font-bold uppercase tracking-wide text-foreground">
        <Sparkles className="size-4 text-primary" />
        {t("sellx.how.title")}
      </h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ icon: Icon, key }, i) => (
          <li key={key} className="group relative overflow-hidden rounded-xl border border-border bg-background/50 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40">
            <span aria-hidden className="absolute -right-2 -top-4 font-heading text-6xl font-black text-foreground/[0.04] transition-colors group-hover:text-primary/10">{i + 1}</span>
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-[0_8px_20px_-8px_var(--primary)]">
              <Icon className="size-5" />
            </span>
            <p className="mt-3 text-sm font-bold text-foreground">{t(`sellx.how.${key}`)}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(`sellx.how.${key}Desc`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── FAQ (ochiladigan) ────────────────────────────────────────────────────────
export function Faq() {
  const [open, setOpen] = useState(0);
  const qs = ["q1", "q2", "q3", "q4", "q5", "q6"];
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-panel sm:p-6">
      <h2 className="font-heading text-base font-bold uppercase tracking-wide text-foreground">{t("sellx.faq.title")}</h2>
      <div className="mt-3 divide-y divide-border">
        {qs.map((q, i) => {
          const isOpen = open === i;
          return (
            <div key={q}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:text-primary"
              >
                {t(`sellx.faq.${q}`)}
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", isOpen && "rotate-180 text-primary")} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="pb-3 text-xs leading-relaxed text-muted-foreground">{t(`sellx.faq.${q}a`)}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Telegram banner ──────────────────────────────────────────────────────────
export function TelegramBanner({ botUsername, onOpen }) {
  if (!botUsername) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#2AABEE]/30 bg-[linear-gradient(120deg,rgba(42,171,238,0.16),transparent_60%)] p-5">
      <div aria-hidden className="orb-drift pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-[#2AABEE]/20 blur-3xl" />
      <div className="relative flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">{t("sellx.tg.title")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("sellx.tg.desc")}</p>
        </div>
        <button
          type="button"
          onClick={() => onOpen(`https://t.me/${botUsername}`)}
          className="flex items-center gap-2 rounded-xl bg-[#2AABEE] px-5 py-2.5 font-heading text-xs font-bold uppercase tracking-wide text-white shadow-[0_10px_24px_-10px_#2AABEE] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2AABEE]/90"
        >
          <Send className="size-4" />
          @{botUsername}
        </button>
      </div>
    </div>
  );
}

// ── Konfetti (pul tushganda) ─────────────────────────────────────────────────
export function Confetti({ show }) {
  if (!show) return null;
  const colors = ["var(--primary)", "var(--accent)", "#22c55e", "#facc15", "#ffffff"];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 70 }).map((_, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-[-12px] block"
          style={{
            left: `${(i * 37) % 100}%`,
            width: `${6 + (i % 4) * 2}px`,
            height: `${10 + (i % 3) * 3}px`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 10) * 0.08}s`,
            animationDuration: `${2.2 + (i % 5) * 0.3}s`,
            transform: `rotate(${i * 23}deg)`,
          }}
        />
      ))}
    </div>
  );
}
