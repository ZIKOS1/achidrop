// Profil va Balans sahifalari uchun umumiy kichik bo'laklar.
import { useEffect, useRef, useState } from "react";
import { Lock, Minus, Plus } from "lucide-react";
import { cn } from "../lib/cn";
import { getCurrentLang, t } from "../i18n";

export const fmtNum = (n) => Math.round(n || 0).toLocaleString("ru-RU");

const MONTHS = {
  uz: ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"],
  ru: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
// "16-okt, 18:23" — brauzer locale'iga bog'liq bo'lmagan qisqa sana.
export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  const lang = getCurrentLang();
  const mon = (MONTHS[lang] || MONTHS.uz)[d.getMonth()];
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return lang === "uz" ? `${d.getDate()}-${mon}, ${hm}` : `${d.getDate()} ${mon}, ${hm}`;
}

// Raqam 0 dan haqiqiy qiymatgacha sanaydi (700ms, ease-out). Keyingi
// o'zgarishlarda eski qiymatdan yangisigacha.
export function useCountUp(value, ms = 700) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(value); from.current = value; return; }
    const start = performance.now();
    const a = from.current;
    let raf;
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const v = a + (value - a) * (1 - Math.pow(1 - p, 3));
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export function StatusTag({ status }) {
  const cls = {
    awaiting_admin: "bg-[var(--row-sel)] text-primary",
    credited: "bg-success/12 text-success",
    rejected: "bg-destructive/12 text-destructive",
  }[status] || "bg-secondary text-muted-foreground";
  const label = ["awaiting_admin", "credited", "rejected"].includes(status) ? t(`sell.status.${status}`) : t("sell.status.other");
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-semibold", cls)}>{label}</span>;
}

// Qulf halqasi: progress 0..1. Ochilganda oltin rangga o'tadi.
export function Ring({ progress, size = 46, done, children }) {
  const pct = Math.max(0.03, Math.min(1, progress)) * 100;
  const hole = size - 10;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full transition-[background] duration-700"
      style={{ width: size, height: size, background: done ? "var(--primary)" : `conic-gradient(#8FC3E8 0 ${pct}%, var(--input) ${pct}% 100%)` }}
    >
      <span className={cn("flex items-center justify-center rounded-full bg-card", done && "tick-pop text-primary")} style={{ width: hole, height: hole }}>
        {children}
      </span>
    </span>
  );
}

export function HistoryRow({ h, dense }) {
  const positive = (h.amount || 0) > 0;
  const Icon = positive ? Plus : Minus;
  return (
    <div className={cn("flex items-center gap-3 border-b border-border last:border-b-0", dense ? "px-4 py-2.5" : "px-5 py-3")}>
      <span className={cn("flex size-[30px] shrink-0 items-center justify-center rounded-[10px]", positive ? "bg-success/12 text-success" : "bg-[var(--row-sel)] text-primary")}>
        <Icon className="size-3.5" strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] text-foreground">{h.reason || "—"}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{fmtDate(h.date)}</p>
      </div>
      <span className={cn("shrink-0 font-heading text-[15px] font-semibold tabular-nums", positive ? "text-success" : "text-[var(--heading)]")}>
        {positive ? "+" : "−"}{fmtNum(Math.abs(h.amount || 0))}
      </span>
    </div>
  );
}

export function LockedHint({ text }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Lock className="size-3.5" />
      {text}
    </span>
  );
}

export function SkeletonRows({ n = 3 }) {
  return Array.from({ length: n }).map((_, i) => (
    <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="skeleton size-[30px] rounded-[10px]" />
      <div className="flex-1 space-y-2"><div className="skeleton h-2.5 w-1/2 rounded-md" /><div className="skeleton h-2 w-1/4 rounded-md" /></div>
      <div className="skeleton h-3.5 w-16 rounded-md" />
    </div>
  ));
}
