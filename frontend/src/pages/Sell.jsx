import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Banknote, Check, CheckCircle2, ChevronDown, Clock, Copy, Crown, ExternalLink, Lock, Package, RefreshCw, Search, X, XCircle } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { imgSrc, fmtMoney, hap, rarityColor } from "../utils";
import { t } from "../i18n";
import { cn } from "../lib/cn";
import { SteamLogo } from "../components/BrandIcons";
import { SELL_CATEGORIES, sellCategory, TrustBadges, TrustStats, RecentSales, HowItWorks, Faq, TelegramBanner, Confetti } from "../components/SellExtras";

// Skin sotish — Claude Design v2 (tungi) / v3 (yorug') bo'yicha: telefonda ro'yxat +
// pastda oltin "Sotish" paneli, kompyuterda jadval + o'ngda "Tanlanganlar" paneli.
// Oqim: skinlar belgilanadi → "Sotish" → so'rov yaratiladi va bizning trade link
// ko'rsatiladi → user skinni Steam orqali O'ZI yuboradi → admin "Oldim"ni bosgach
// pul balansga tushadi (server: POST /api/instant-sell).

// Steam nodirlik nomi qisqa ko'rinishda ("Mil-Spec Grade" → "Mil-Spec", case'lar → "Container")
// Bir martada nechta skin ko'rsatiladi ("Yana ko'rsatish" har bosilganda +20).
const PAGE = 20;

function rarityLabel(item) {
  if (sellCategory(item.marketHashName || item.name) === "case") return "Container";
  return (item.rarity || "").replace(/ Grade$/, "") || "—";
}

function StatusBadge({ status }) {
  const map = {
    awaiting_admin: { icon: Clock, cls: "text-primary bg-[var(--row-sel)]" },
    credited: { icon: CheckCircle2, cls: "text-success bg-success/12" },
    rejected: { icon: XCircle, cls: "text-destructive bg-destructive/12" },
  };
  const m = map[status] || { icon: XCircle, cls: "text-muted-foreground bg-secondary" };
  const Icon = m.icon;
  const label = map[status] ? t(`sell.status.${status}`) : t("sell.status.other");
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", m.cls)}>
      <Icon className="size-3" />
      {label}
    </span>
  );
}

// Tanlash doirasi — tanlanganda qizil bilan "pop" qilib to'ladi.
function Tick({ on }) {
  return (
    <span className={cn("relative flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px]", on ? "border-[#E3141F]" : "border-white/35 bg-black/25")}>
      {on && (
        <span className="tick-pop absolute -inset-[1.5px] flex items-center justify-center rounded-full bg-[#E3141F] text-white">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      )}
    </span>
  );
}

// $0.15 dan arzon skinning narxi cheapPriceSom'da (priceSom null) — u faqat
// jami bulkSellSom dan oshgan sotuvda tanlanadi.
const sellPrice = (it) => (Number.isFinite(it.priceSom) ? it.priceSom : it.cheapPriceSom);

// Bir sotuvdagi (groupId) ochiq skin so'rovlari → TradeLinkPanel uchun bitta ko'rinish.
// groupId'siz eski so'rovlar adminga yaratilganda xabar qilingan — ular "yuborilgan" hisoblanadi.
function groupOf(mine, r) {
  const gid = r.groupId ?? r.id;
  const list = mine.filter((x) => (x.groupId ?? x.id) === gid && x.status === "awaiting_admin");
  return {
    id: gid,
    ids: list.map((x) => x.id),
    items: list.flatMap((x) => x.items || []),
    totalSom: list.reduce((n, x) => n + (x.totalSom || 0), 0),
    sentAt: r.groupId == null ? r.createdAt : list.every((x) => x.sentAt) ? list[0]?.sentAt : null,
  };
}

// Skin kartochkasi (dizayn): binafsha nurli to'q fon, rasm 16:10, nom,
// "Nodirlik · Sifat" (kvadrat nuqta bilan), narx. Tanlansa — qizil chegara va nur.
function SkinCard({ item, selected, disabled, priced, onToggle, index = 0 }) {
  const rColor = rarityColor(item.rarity, item.name);
  const lockDays = item.lockedUntil ? Math.max(1, Math.ceil((Date.parse(item.lockedUntil) - Date.now()) / 86400000)) : 0;
  const tag = item.sellable === false ? t("sell.notSellable") : !item.tradable ? (lockDays ? t("sellx.lockDays", { n: lockDays }) : t("sell.locked")) : item.tooCheap ? t("sell.tooCheap") : !priced ? t("sell.noPrice") : null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      style={{ "--fade-delay": `${Math.min((index % PAGE) * 30, 450)}ms` }}
      className={cn(
        "ad-skin animate-fade-up group relative flex flex-col gap-1.5 rounded-2xl border border-[var(--ad-line)] p-2.5 text-left transition-[border-color,box-shadow,transform] duration-150 sm:px-3.5 sm:pb-3.5 sm:pt-3",
        selected ? "skin-sel" : "hover:-translate-y-0.5 hover:border-white/25",
        disabled ? "cursor-not-allowed opacity-50 hover:translate-y-0" : "active:scale-[0.98]"
      )}
    >
      <span className="absolute right-2.5 top-2.5 z-10"><Tick on={selected} /></span>
      <span className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-[10px]">
        {item.imageUrl ? <img src={imgSrc(item.imageUrl)} alt="" loading="lazy" className="max-h-full max-w-full rounded-none object-contain transition-transform duration-300 group-hover:scale-105" /> : <Package className="size-7 text-muted-foreground" />}
      </span>
      <span className="line-clamp-2 min-h-[2.4em] text-[13.5px] font-medium leading-[1.2] text-[var(--heading)] sm:text-[15px]">{item.name}</span>
      <span className="flex items-center gap-[7px] text-xs text-muted-foreground sm:text-[13px]">
        <span className="size-[7px] shrink-0 rounded-[2px]" style={{ backgroundColor: rColor }} />
        <span className="truncate">{rarityLabel(item)}{item.wear ? ` · ${item.wear}` : ""}</span>
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums text-[var(--heading)] sm:text-[17px]">{priced ? fmtMoney(sellPrice(item)) : "—"}</span>
        {tag && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--row-sel)] px-2 py-0.5 text-[10px] font-semibold text-primary">
            {!item.tradable && item.sellable !== false && <Lock className="size-2.5" />}
            {tag}
          </span>
        )}
      </span>
    </button>
  );
}

// Inventar qiymati / Sotsa bo'ladi — ikki statistik blok
function StatBoxes({ value, count, big }) {
  return (
    <div className={cn("grid gap-2.5", big ? "grid-cols-[1.15fr_1fr]" : "grid-cols-2")}>
      <div className={cn("ad-panel", big ? "rounded-2xl px-4 py-3.5" : "rounded-[14px] px-3.5 py-3")}>
        <p className={cn("uppercase tracking-[0.15em] text-muted-foreground", big ? "text-[11.5px]" : "text-[11px]")}>{t("sell.inventoryValue")}</p>
        <p className={cn("mt-1 whitespace-nowrap font-bold tabular-nums text-[var(--heading)]", big ? "text-[26px]" : "text-[22px]")}>
          {value.toLocaleString("ru-RU").replace(/ /g, " ")} <span className={cn("text-primary", big ? "text-[15px]" : "text-sm")}>so'm</span>
        </p>
      </div>
      <div className={cn("ad-panel", big ? "rounded-2xl px-4 py-3.5" : "rounded-[14px] px-3.5 py-3")}>
        <p className={cn("uppercase tracking-[0.15em] text-muted-foreground", big ? "text-[11.5px]" : "text-[11px]")}>{t("sell.sellableCount")}</p>
        <p className={cn("mt-1 font-bold tabular-nums text-[var(--heading)]", big ? "text-[26px]" : "text-[22px]")}>{count}</p>
      </div>
    </div>
  );
}

// Saralash menyusi — tugmadan pastga kattalashib ochiladi (07).
function SortMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const opts = ["desc", "asc", "name"];
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn("ad-field flex h-[46px] items-center gap-1.5 whitespace-nowrap rounded-[14px] px-3.5 text-[14.5px] transition-colors", open ? "!border-ring" : "hover:!border-ring/60")}
      >
        <span className="hidden text-muted-foreground sm:inline">{t("sellx.sort.label")}:</span>
        <span className="font-semibold text-primary">{t(`sellx.sort.${value}`)}</span>
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="menu-in absolute right-0 top-full z-20 mt-1.5 w-56 overflow-hidden rounded-2xl border border-border bg-popover shadow-panel-lg">
          {opts.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => { onChange(o); setOpen(false); hap("selection"); }}
              className={cn("flex w-full items-center justify-between rounded-none px-3.5 py-2.5 text-left text-xs transition-colors", value === o ? "bg-[var(--row-sel)] font-semibold text-primary" : "text-foreground hover:bg-[var(--row-hov)]")}
            >
              {t(`sellx.sort.${o}`)}
              {value === o && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Asosiy tugma (dizayn): qizil konturli, nurli. "SOTISH · N TA" / "SKIN TANLANG".
function SellButton({ count, submitting, onClick, className }) {
  const off = count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off || submitting}
      className={cn("ad-cta flex items-center justify-center gap-2 whitespace-nowrap rounded-[14px] text-[15px] uppercase", !off && "on", className)}
    >
      {submitting ? <span className="size-4 rounded-full border-2 border-white/30 border-t-[#FF3B45] spin" /> : null}
      {off ? t("sellx.pickSkin") : submitting ? t("sellx.sending") : t("sellx.ctaSell", { n: count })}
    </button>
  );
}

// So'rov yuborilgandan keyin: bizning trade link, "Steam'da ochish" va "Nusxalash" (07, 10).
function TradeLinkPanel({ request, botTradeUrl, onDone, onSent }) {
  const { tg, showToast } = useApp();
  const [copied, setCopied] = useState(false);
  const [sentAt, setSentAt] = useState(request.sentAt || null);
  const [sending, setSending] = useState(false);
  async function markSent() {
    setSending(true);
    try {
      const r = await api("/api/instant-sell/sent", { method: "POST", body: JSON.stringify({ ids: request.ids || [request.id] }) });
      hap("notif", "success");
      setSentAt(r.sentAt || new Date().toISOString());
      showToast(t("sell.sentDone"), "ok");
      onSent?.();
    } catch (e) {
      hap("notif", "error");
      showToast(e?.error || t("common.genericError"), "err");
    } finally {
      setSending(false);
    }
  }
  function copy() {
    navigator.clipboard?.writeText(botTradeUrl);
    hap("impact", "light");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function openSteam() {
    if (tg?.openLink) tg.openLink(botTradeUrl);
    else window.open(botTradeUrl, "_blank", "noopener");
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-panel"
    >
      <div className="flex items-center gap-3 rounded-2xl bg-success/12 p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success"><Check className="size-4.5" strokeWidth={3} /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{t("sell.sentTitle", { id: request.id })}</p>
          <p className="text-xs text-muted-foreground">
            {t("sell.total")}: <span className="font-semibold text-success">{fmtMoney(request.totalSom)}</span>
          </p>
        </div>
      </div>

      <p className="text-sm text-foreground">{t("sell.sendInstr")}</p>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("sell.tradeLink")}</p>
        {botTradeUrl ? (
          <>
            <code className="block truncate rounded-xl border border-border bg-secondary px-3 py-2.5 font-mono text-[11px] text-foreground">{botTradeUrl}</code>
            <div className="flex gap-2">
              <button type="button" onClick={openSteam} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gold-grad py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.97]">
                <ExternalLink className="size-4" />
                {t("sell.openSteam")}
              </button>
              <button
                type="button"
                onClick={copy}
                className={cn("relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl border py-3 text-sm font-medium transition-colors duration-200", copied ? "border-transparent bg-success/12 text-success" : "border-border bg-card text-foreground hover:border-ring/60")}
              >
                {copied ? (
                  <span key="ok" className="swap-in flex items-center gap-2 font-semibold"><Check className="size-4" />{t("sell.copied")}</span>
                ) : (
                  <span key="cp" className="swap-in flex items-center gap-2"><Copy className="size-4" />{t("sell.copy")}</span>
                )}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-destructive">{t("sell.noTradeLink")}</p>
        )}
      </div>

      <ul className="max-h-60 overflow-y-auto rounded-2xl border border-border">
        {request.items.map((it) => (
          <li key={it.assetId} className="flex items-center gap-3 border-b border-border p-2.5 last:border-b-0">
            <span className="flex h-9 w-12 shrink-0 items-center justify-center">
              {it.imageUrl ? <img src={imgSrc(it.imageUrl)} alt="" className="max-h-full max-w-full rounded-none object-contain" /> : <Package className="size-4 text-muted-foreground" />}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{it.marketHashName}</span>
            <span className="shrink-0 font-heading text-sm font-semibold tabular-nums text-foreground">{fmtMoney(it.priceSom)}</span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-primary">{t("sell.warnOnly")}</p>
      <p className="text-xs text-muted-foreground">{t("sell.afterAccept")}</p>

      {sentAt ? (
        <p className="flex items-center gap-2 rounded-2xl bg-success/12 p-3 text-sm font-medium text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          {t("sell.sentDone")}
        </p>
      ) : (
        <div className="space-y-2">
          <button type="button" onClick={markSent} disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold-grad py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-60">
            {sending ? <span className="size-4 rounded-full border-2 border-white/30 border-t-white spin" /> : <CheckCircle2 className="size-4" />}
            {t("sell.sentBtn")}
          </button>
          <p className="text-xs text-muted-foreground">{t("sell.sentHint")}</p>
        </div>
      )}

      <button type="button" onClick={onDone} className="w-full rounded-2xl border border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground">
        {t("sell.done")}
      </button>
    </motion.div>
  );
}

// Bo'sh / xato holatlari (09)
function EmptyState({ icon: Icon, title, desc, children, tone = "gold" }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-border bg-card px-5 py-12 text-center shadow-panel">
      <span className={cn("mb-1 flex size-11 items-center justify-center rounded-2xl", tone === "err" ? "bg-destructive/12 text-destructive" : "bg-[var(--row-sel)] text-primary")}>
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {desc && <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{desc}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

export default function Sell() {
  const { user, navigate, showToast, openModal, closeModal, tg, refreshMe } = useApp();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { request, botTradeUrl }
  const [mine, setMine] = useState([]);
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("desc");
  const [shown, setShown] = useState(PAGE);
  const [stats, setStats] = useState(null);
  const [botUsername, setBotUsername] = useState(null);
  const [confetti, setConfetti] = useState(false);
  const prevStatus = useRef(null);

  const load = useCallback((refresh = false) => {
    setLoading(true);
    setError("");
    api(`/api/instant-sell/quote${refresh ? "?refresh=1" : ""}`)
      .then((q) => {
        setQuote(q);
        // Inventar yangilanganda yo'qolgan/narxsiz skinlar tanlovdan chiqadi.
        setSelected((prev) => {
          const ok = new Set(q.items.filter((i) => i.tradable && Number.isFinite(sellPrice(i))).map((i) => i.assetId));
          return new Set([...prev].filter((id) => ok.has(id)));
        });
      })
      // Eski ro'yxat ko'rsatilmaydi — faqat Steam'dan yangi olingan inventar.
      .catch((e) => { setQuote(null); setError(e?.error || t("common.genericError")); })
      .finally(() => setLoading(false));
  }, []);

  const loadMine = useCallback(() => {
    api("/api/instant-sell-mine").then((list) => {
      const prev = prevStatus.current;
      if (prev) {
        const credited = list.filter((r) => r.status === "credited" && prev[r.id] === "awaiting_admin");
        if (credited.length) {
          const sum = credited.reduce((n, r) => n + (r.totalSom || 0), 0);
          showToast(t("sellx.credited", { id: credited.map((r) => r.id).join(", #"), sum: fmtMoney(sum) }), "ok");
          hap("notif", "success");
          setConfetti(true);
          setTimeout(() => setConfetti(false), 3500);
          refreshMe?.();
        }
      }
      prevStatus.current = Object.fromEntries(list.map((r) => [r.id, r.status]));
      setMine(list);
    }).catch(() => {});
  }, [showToast, refreshMe]);

  // Ochiq statistika va bot nomi (lenta, statistika, Telegram banner)
  useEffect(() => {
    api("/api/public-stats").then(setStats).catch(() => {});
    api("/api/bot-info").then((r) => setBotUsername(r.username)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    load(true); // har kirganda inventar Steam'dan yangidan olinadi (keshsiz)
    loadMine();
  }, [user?.id, user?.steamId64, load, loadMine]);

  // Admin "Oldim"ni bosganini sahifa ochiq turganda ham sezish uchun
  useEffect(() => {
    if (!user || !mine.some((r) => r.status === "awaiting_admin")) return;
    const id = setInterval(loadMine, 30000);
    return () => clearInterval(id);
  }, [user?.id, mine, loadMine]);

  const items = quote?.items || [];
  const sellable = (it) => quote?.lisConfigured && it.tradable && Number.isFinite(sellPrice(it));

  const catCounts = useMemo(() => {
    const c = { all: items.length };
    for (const it of items) { const k = sellCategory(it.marketHashName || it.name); c[k] = (c[k] || 0) + 1; }
    return c;
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
    if (category !== "all") list = list.filter((i) => sellCategory(i.marketHashName || i.name) === category);
    const byPrice = sort === "asc" ? (a, b) => (sellPrice(a) || 0) - (sellPrice(b) || 0) : (a, b) => (sellPrice(b) || 0) - (sellPrice(a) || 0);
    const cmp = sort === "name" ? (a, b) => a.name.localeCompare(b.name) : byPrice;
    // Sotiladiganlari doim oldinda, umuman sotilmaydiganlar (medal, coin...) eng oxirida.
    const rank = (it) => (sellable(it) ? 2 : it.sellable === false ? 0 : 1);
    return [...list].sort((a, b) => (rank(b) - rank(a)) || cmp(a, b));
  }, [items, query, category, sort, quote?.lisConfigured]);

  // Filtr/qidiruv/saralash o'zgarsa yana birinchi 20 tadan boshlanadi.
  useEffect(() => { setShown(PAGE); }, [query, category, sort]);

  const selectedItems = items.filter((i) => selected.has(i.assetId));
  const total = selectedItems.reduce((s, i) => s + (sellPrice(i) || 0), 0);
  const maxItems = quote?.maxItems || 30;

  function toggle(it) {
    if (!sellable(it)) return;
    hap("impact", "light");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(it.assetId)) next.delete(it.assetId);
      else {
        if (next.size >= maxItems) {
          showToast(t("sell.maxItems", { n: maxItems }), "err");
          return prev;
        }
        next.add(it.assetId);
      }
      return next;
    });
  }

  function selectTop5() {
    hap("impact", "medium");
    const top = items.filter((i) => sellable(i) && !i.tooCheap).sort((a, b) => b.priceSom - a.priceSom).slice(0, Math.min(5, maxItems));
    setSelected(new Set(top.map((i) => i.assetId)));
  }

  async function connectSteam() {
    try {
      const r = await api("/api/steam-login-url");
      if (tg?.openLink) tg.openLink(r.url);
      else window.open(r.url, "_blank");
    } catch (e) {
      showToast(e?.error || t("common.genericError"), "err");
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const r = await api("/api/instant-sell", { method: "POST", body: JSON.stringify({ assetIds: [...selected] }) });
      hap("notif", "success");
      setResult(r);
      setSelected(new Set());
      loadMine();
    } catch (e) {
      hap("notif", "error");
      showToast(e?.error || t("common.genericError"), "err");
      if (Array.isArray(e?.assetIds)) load(true);
    } finally {
      setSubmitting(false);
    }
  }

  function confirmSell() {
    if (!selected.size) return;
    if (selectedItems.some((i) => i.tooCheap) && total < (quote?.bulkSellSom || 0)) {
      hap("notif", "error");
      showToast(t("sell.cheapBulk", { sum: fmtMoney(quote.bulkSellSom) }), "err");
      return;
    }
    openModal({
      title: t("sell.confirmTitle"),
      icon: Banknote,
      noInput: true,
      info: `${t("sell.items", { n: selectedItems.length })}: ${fmtMoney(total)}\n${t("sell.afterAccept")}`,
      okLabel: t("sell.confirmBtn"),
      onSubmit: () => { closeModal(); submit(); },
    });
  }

  const openLink = (url) => (tg?.openLink ? tg.openLink(url) : window.open(url, "_blank", "noopener"));

  if (!user) {
    return (
      <div className="space-y-5">
        <EmptyState icon={Banknote} title={t("common.loginRequired")}>
          <button type="button" onClick={() => navigate("login")} className="rounded-2xl bg-gold-grad px-5 py-2.5 font-heading text-sm font-semibold uppercase tracking-wide text-white transition-all hover:-translate-y-0.5">
            {t("common.login")}
          </button>
        </EmptyState>
        <TrustBadges />
        <RecentSales recent={stats?.recent} />
        <HowItWorks />
        <Faq />
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-xl">
        <TradeLinkPanel request={result.request} botTradeUrl={result.botTradeUrl} onSent={loadMine} onDone={() => { setResult(null); load(true); }} />
      </div>
    );
  }

  const sellableItems = items.filter(sellable);
  const inventoryValue = sellableItems.reduce((sum, i) => sum + sellPrice(i), 0);
  const steamMissing = !user.steamId64 || quote?.steamConnected === false;

  return (
    <div className="space-y-5 pb-28 xl:pb-8">
      <Confetti show={confetti} />

      {/* Sarlavha + (xl dan kichik ekranda) statistika */}
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-[30px] font-bold leading-[1.05] tracking-[-0.01em] text-[var(--heading)] lg:text-[40px]">{t("sell.title")}</h1>
          <p className="text-[15px] text-muted-foreground [text-wrap:pretty]">{t("sellx.deskSubtitle")}</p>
        </div>
        {quote?.lisConfigured && sellableItems.length > 0 && (
          <div className="xl:hidden"><StatBoxes value={inventoryValue} count={sellableItems.length} /></div>
        )}
      </div>

      <RecentSales recent={stats?.recent} />

      {quote && !quote.lisConfigured && (
        <div className="ad-panel flex items-start gap-3 rounded-2xl p-4">
          <Clock className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">{t("sell.comingSoon")}</p>
            <p className="text-xs text-muted-foreground">{t("sell.comingSoonDesc")}</p>
          </div>
        </div>
      )}

      {steamMissing ? (
        <EmptyState icon={SteamLogo} title={t("sellx.steamMissing")} desc={t("sell.connectSteam")}>
          <button type="button" onClick={connectSteam} className="flex items-center gap-2 rounded-2xl bg-gold-grad px-5 py-2.5 font-heading text-sm font-semibold uppercase tracking-wide text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.97]">
            <SteamLogo className="size-4" />
            {t("trade.connectSteam")}
          </button>
        </EmptyState>
      ) : (
        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <section className="min-w-0 space-y-[18px]">
            {/* Qidiruv + saralash + Top-5 + yangilash */}
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="ad-field group flex h-[46px] min-w-0 flex-[1_1_220px] max-xl:order-1 items-center gap-2.5 rounded-[14px] px-3.5 transition-[border-color,box-shadow] duration-200 focus-within:!border-ring sm:max-w-[320px]">
                <Search className="size-[18px] shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("sell.search")}
                  className="w-full rounded-none bg-transparent text-[15px] text-foreground caret-primary outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label={t("sell.clear")} className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground">
                    <X className="size-3" />
                  </button>
                )}
              </label>
              <span className="hidden min-w-0 flex-1 sm:block max-xl:order-3" />
              {items.length > 0 && <div className="max-xl:order-4"><SortMenu value={sort} onChange={setSort} /></div>}
              {quote?.lisConfigured && sellableItems.length > 0 && (
                <button type="button" onClick={selectTop5} className="flex h-[46px] shrink-0 items-center gap-[7px] max-xl:order-5 whitespace-nowrap rounded-[14px] border border-[rgba(227,20,31,.7)] bg-[rgba(227,20,31,.1)] px-3.5 text-[14.5px] font-semibold text-primary transition-colors hover:bg-[rgba(227,20,31,.2)] active:scale-95">
                  <Crown className="size-[17px]" />
                  {t("sellx.top5")}
                </button>
              )}
              <button type="button" onClick={() => load(true)} disabled={loading} aria-label={t("sell.refresh")} title={t("sell.refresh")} className="ad-field flex size-[46px] shrink-0 max-xl:order-2 items-center justify-center rounded-[14px] text-foreground transition-colors hover:!border-ring/60 disabled:opacity-50">
                <RefreshCw className={cn("size-[18px]", loading && "spin")} />
              </button>
            </div>
            {query && !loading && <p className="-mt-2 px-1 text-xs text-muted-foreground">{visible.length ? t("sellx.found", { n: visible.length }) : <span className="text-destructive">{t("sellx.notFound")}</span>}</p>}

            {/* Filtr chiplari */}
            {items.length > 0 && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
                {SELL_CATEGORIES.filter((c) => c === "all" || catCounts[c]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setCategory(c); hap("selection"); }}
                    className={cn(
                      "flex h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[15px] transition-all duration-200 active:scale-95",
                      category === c ? "border-[#E3141F] bg-[#E3141F] font-bold text-white" : "border-[var(--ad-line)] bg-[var(--ad-field)] font-medium text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t(`sellx.cat.${c}`)}
                    <span className="opacity-75">{catCounts[c] || 0}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Ro'yxat / jadval */}
            {loading && !quote ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 px-1 text-xs text-muted-foreground">
                  <span className="size-4 rounded-full border-2 border-primary/30 border-t-primary spin" />
                  {t("sellx.loadingInv")}
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-3.5">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="ad-skin overflow-hidden rounded-2xl border border-[var(--ad-line)] p-3">
                      <div className="skeleton h-20 w-full rounded-xl" />
                      <div className="skeleton mt-3 h-2.5 w-4/5 rounded-md" />
                      <div className="skeleton mt-2 h-2 w-1/2 rounded-md" />
                      <div className="skeleton mt-3 h-3.5 w-2/5 rounded-md" />
                    </div>
                  ))}
                </div>
              </div>
            ) : error ? (
              <EmptyState icon={Lock} tone="err" title={error}>
                <button type="button" onClick={() => load(true)} className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-xs font-medium text-foreground transition-colors hover:border-ring/60">
                  <RefreshCw className="size-3.5" />
                  {t("sell.refresh")}
                </button>
              </EmptyState>
            ) : !items.length ? (
              <EmptyState icon={Package} title={t("sell.empty")} desc={t("sell.emptyDesc")} />
            ) : (
              visible.length === 0 ? (
                <p className="rounded-3xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">{t("sellx.notFound")}</p>
              ) : (
                <div>
                  {/* Hammasi bir marta yuklangan — "Yana ko'rsatish" faqat ekranda ochadi, serverga so'rov yubormaydi. */}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-3.5">
                    {visible.slice(0, shown).map((it, i) => (
                      <SkinCard
                        key={it.assetId}
                        index={i}
                        item={it}
                        priced={Number.isFinite(sellPrice(it))}
                        selected={selected.has(it.assetId)}
                        disabled={!sellable(it)}
                        onToggle={() => toggle(it)}
                      />
                    ))}
                  </div>
                  {visible.length > shown && (
                    <button
                      type="button"
                      onClick={() => { setShown((n) => n + PAGE); hap("selection"); }}
                      className="mx-auto mt-4 flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm font-medium text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-ring/60 active:scale-95"
                    >
                      <ChevronDown className="size-4 text-primary" />
                      {t("sellx.more", { n: visible.length - shown })}
                    </button>
                  )}
                </div>
              )
            )}
          </section>

          {/* Keng ekran: statistika + "Tanlanganlar" ramkasi + afzalliklar */}
          <aside className="sticky top-24 hidden flex-col gap-3.5 xl:flex">
            {quote?.lisConfigured && sellableItems.length > 0 && <StatBoxes value={inventoryValue} count={sellableItems.length} big />}
            <div className="ad-frame">
              <div className="ad-frame-in flex flex-col gap-3.5 px-5 pb-[22px] pt-5">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("sellx.picked")}</p>
                <p className="text-[15px] text-foreground [text-wrap:pretty]">{selected.size ? t("sellx.nPicked", { n: selected.size }) : t("sellx.pickedEmpty")}</p>
                <div className="h-px bg-[linear-gradient(90deg,transparent,var(--ad-line),transparent)]" />
                <div className="flex items-baseline justify-between">
                  <span className="text-base text-foreground">{t("sellx.totalLabel")}</span>
                  <span className="text-[30px] font-bold tabular-nums text-[var(--heading)]">{total.toLocaleString("ru-RU").replace(/ /g, " ")} <span className="text-base text-primary">so'm</span></span>
                </div>
                <SellButton count={selected.size} submitting={submitting} onClick={confirmSell} className="h-[52px] w-full" />
                <p className="text-sm leading-normal text-muted-foreground [text-wrap:pretty]">{t("sellx.nextStep")}</p>
              </div>
              <div className="ad-frame-glow" />
            </div>
            <div className="ad-frame-sm">
              <div className="flex flex-col gap-3 px-[18px] py-4">
                {["safe", "cards", "support"].map((k) => (
                  <p key={k} className="flex items-center gap-3 text-[15px] text-foreground">
                    <span className="size-[7px] shrink-0 rotate-45 bg-[#E3141F]" />
                    {t(`sellx.bullet.${k}`)}
                  </p>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}

      {mine.length > 0 && (
        <div id="my-requests" className="ad-panel scroll-mt-24 rounded-2xl p-4 sm:p-5">
          <h2 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("sell.myRequests")}</h2>
          <ul>
            {mine.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 last:border-b-0">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex -space-x-3">
                    {(r.items || []).slice(0, 3).map((it) => (
                      <span key={it.assetId} className="flex size-10 items-center justify-center rounded-xl border border-border bg-secondary">
                        {it.imageUrl ? <img src={imgSrc(it.imageUrl)} alt="" className="max-h-full max-w-full rounded-none object-contain" /> : <Package className="size-4 text-muted-foreground" />}
                      </span>
                    ))}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">#{r.id} · {t("sell.items", { n: (r.items || [r]).length })}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-heading text-sm font-semibold tabular-nums text-foreground">{fmtMoney(r.totalSom ?? r.priceSom)}</span>
                  <StatusBadge status={r.status} />
                  {r.status === "awaiting_admin" && (
                    <button type="button" onClick={() => setResult({ request: groupOf(mine, r), botTradeUrl: quote?.botTradeUrl })} className="text-xs text-primary underline-offset-2 hover:underline">
                      {t("sell.tradeLink")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <TrustStats stats={stats} />
      <div className="lg:hidden"><TrustBadges /></div>
      <HowItWorks />
      <Faq />
      <TelegramBanner botUsername={botUsername} onOpen={openLink} />

      {/* xl dan kichik ekran: pastda "Tanlandi · N" paneli */}
      {!steamMissing && items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center bg-[linear-gradient(180deg,transparent,var(--background)_30%)] px-3.5 pb-4 pt-3 lg:left-66 xl:hidden">
          <div className="ad-bar flex w-full max-w-[560px] items-center gap-3 rounded-[18px] py-2.5 pl-4 pr-2.5">
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{t("sellx.pickedN", { n: selected.size })}</p>
              <p className="whitespace-nowrap text-xl font-bold tabular-nums text-[var(--heading)]">{total.toLocaleString("ru-RU").replace(/ /g, " ")} <span className="text-[13px] text-primary">so'm</span></p>
            </div>
            <SellButton count={selected.size} submitting={submitting} onClick={confirmSell} className="h-12 px-[18px] text-sm" />
          </div>
        </div>
      )}
    </div>
  );
}
