import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
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

// Tanlash doirasi — tanlanganda oltin bilan "pop" qilib to'ladi (02).
function Tick({ on }) {
  return (
    <span className="relative flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-input bg-card">
      {on && (
        <span className="tick-pop absolute -inset-[1.5px] flex items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      )}
    </span>
  );
}

// Skin kartochkasi: rasm (nodirlik nuri bilan), nom, "Nodirlik · Sifat", narx.
// Nodirlik nuqtasi va matn orasida 8px (gap-2).
function SkinCard({ item, selected, disabled, priced, onToggle, index = 0 }) {
  const rColor = rarityColor(item.rarity, item.name);
  const tag = !item.tradable ? t("sell.locked") : !priced ? t("sell.noPrice") : null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      style={{ "--fade-delay": `${Math.min((index % PAGE) * 30, 450)}ms` }}
      className={cn(
        "animate-fade-up group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition-[border-color,background-color,transform,box-shadow] duration-200",
        selected ? "border-primary/60 bg-[var(--row-sel)] shadow-[0_14px_30px_-20px_var(--primary)]" : "border-border hover:-translate-y-0.5 hover:border-ring/60",
        disabled ? "cursor-not-allowed opacity-50 hover:translate-y-0" : "active:scale-[0.98]"
      )}
    >
      <span className="absolute right-2.5 top-2.5 z-10"><Tick on={selected} /></span>
      <span
        className="flex h-24 items-center justify-center px-4 pt-3 sm:h-28"
        style={{ background: `radial-gradient(ellipse at center, ${rColor}33, transparent 70%)` }}
      >
        {item.imageUrl ? <img src={imgSrc(item.imageUrl)} alt="" loading="lazy" className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105" /> : <Package className="size-7 text-muted-foreground" />}
      </span>
      <span className="flex flex-1 flex-col px-3 pb-3 pt-2">
        <span className="line-clamp-2 min-h-[2.5em] text-[12px] font-medium leading-[1.25] text-foreground">{item.name}</span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: rColor, boxShadow: `0 0 8px ${rColor}` }} />
          <span className="truncate text-[10.5px] text-muted-foreground">{rarityLabel(item)}{item.wear ? ` · ${item.wear}` : ""}</span>
        </span>
        <span className="mt-2 flex items-end justify-between gap-2">
          <span className="whitespace-nowrap font-heading text-[15px] font-semibold tabular-nums text-foreground">{priced ? fmtMoney(item.priceSom) : "—"}</span>
          {tag && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--row-sel)] px-2 py-0.5 text-[10px] font-semibold text-primary">
              {!item.tradable && <Lock className="size-2.5" />}
              {tag}
            </span>
          )}
        </span>
      </span>
    </button>
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
        className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-xl border bg-card px-3 py-2.5 text-xs transition-colors", open ? "border-ring" : "border-border hover:border-ring/60")}
      >
        <span className="hidden text-muted-foreground lg:inline">{t("sellx.sort.label")}:</span>
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

// Asosiy oltin tugma holatlari (05): oddiy, kursor (ko'tariladi), bosilgan, o'chiq, yuborilmoqda.
function SellButton({ count, submitting, onClick, className }) {
  const off = count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off || submitting}
      className={cn(
        "flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 font-heading text-sm font-semibold uppercase tracking-wide transition-all duration-200",
        off ? "bg-secondary text-muted-foreground"
          : submitting ? "bg-[var(--row-sel)] text-primary"
          : "bg-gold-grad text-[#1A160F] hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-14px_rgba(201,162,74,.8)] active:translate-y-0 active:scale-[0.97] active:brightness-95",
        className
      )}
    >
      {submitting ? <span className="size-4 rounded-full border-2 border-primary/30 border-t-primary spin" /> : null}
      {off ? t("sellx.pickSkin") : submitting ? t("sellx.sending") : `${t("sell.sellBtn")} →`}
    </button>
  );
}

// So'rov yuborilgandan keyin: bizning trade link, "Steam'da ochish" va "Nusxalash" (07, 10).
function TradeLinkPanel({ request, botTradeUrl, onDone }) {
  const { tg } = useApp();
  const [copied, setCopied] = useState(false);
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
              <button type="button" onClick={openSteam} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gold-grad py-3 text-sm font-semibold text-[#1A160F] transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.97]">
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

  const hasQuote = useRef(false);
  const load = useCallback((refresh = false) => {
    setLoading(true);
    setError("");
    api(`/api/instant-sell/quote${refresh ? "?refresh=1" : ""}`)
      .then((q) => {
        hasQuote.current = true;
        setQuote(q);
        // Inventar yangilanganda yo'qolgan/narxsiz skinlar tanlovdan chiqadi.
        setSelected((prev) => {
          const ok = new Set(q.items.filter((i) => i.tradable && Number.isFinite(i.priceSom)).map((i) => i.assetId));
          return new Set([...prev].filter((id) => ok.has(id)));
        });
      })
      .catch((e) => {
        const msg = e?.error || t("common.genericError");
        // Yangilashda xato bo'lsa — eski ro'yxat qoladi, faqat ogohlantiramiz.
        if (refresh && hasQuote.current) showToast(msg, "err");
        else setError(msg);
      })
      .finally(() => setLoading(false));
  }, [showToast]);

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
  const sellable = (it) => quote?.lisConfigured && it.tradable && Number.isFinite(it.priceSom);

  const catCounts = useMemo(() => {
    const c = { all: items.length };
    for (const it of items) { const k = sellCategory(it.marketHashName || it.name); c[k] = (c[k] || 0) + 1; }
    return c;
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
    if (category !== "all") list = list.filter((i) => sellCategory(i.marketHashName || i.name) === category);
    const byPrice = sort === "asc" ? (a, b) => (a.priceSom || 0) - (b.priceSom || 0) : (a, b) => (b.priceSom || 0) - (a.priceSom || 0);
    const cmp = sort === "name" ? (a, b) => a.name.localeCompare(b.name) : byPrice;
    // Sotiladiganlari doim oldinda.
    return [...list].sort((a, b) => (sellable(b) - sellable(a)) || cmp(a, b));
  }, [items, query, category, sort, quote?.lisConfigured]);

  // Filtr/qidiruv/saralash o'zgarsa yana birinchi 20 tadan boshlanadi.
  useEffect(() => { setShown(PAGE); }, [query, category, sort]);

  const selectedItems = items.filter((i) => selected.has(i.assetId));
  const total = selectedItems.reduce((s, i) => s + (i.priceSom || 0), 0);
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
    const top = items.filter(sellable).sort((a, b) => b.priceSom - a.priceSom).slice(0, Math.min(5, maxItems));
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
          <button type="button" onClick={() => navigate("login")} className="rounded-2xl bg-gold-grad px-5 py-2.5 font-heading text-sm font-semibold uppercase tracking-wide text-[#1A160F] transition-all hover:-translate-y-0.5">
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
        <TradeLinkPanel request={result.request} botTradeUrl={result.botTradeUrl} onDone={() => { setResult(null); load(true); }} />
      </div>
    );
  }

  const sellableItems = items.filter(sellable);
  const inventoryValue = sellableItems.reduce((sum, i) => sum + i.priceSom, 0);
  const steamMissing = !user.steamId64 || quote?.steamConnected === false;

  return (
    <div className="space-y-5 pb-28 lg:pb-8">
      <Confetti show={confetti} />

      {/* Sarlavha: telefonda katta "Inventaringiz qiymati", kompyuterda sarlavha + statistika */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="lg:hidden">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("sellx.invValue")}</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-[42px] font-semibold leading-none tabular-nums text-foreground">{(quote?.lisConfigured ? inventoryValue : 0).toLocaleString("ru-RU").replace(/ /g, " ")}</span>
            <span className="font-heading text-lg text-primary">so'm</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] text-muted-foreground">{t("sellx.nSkins", { n: sellableItems.length })}</span>
            <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] text-muted-foreground">{t("sellx.holdPill")}</span>
          </div>
        </div>
        <div className="hidden lg:block">
          <h1 className="font-heading text-3xl font-semibold text-foreground">{t("sell.title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("sellx.deskSubtitle")}</p>
        </div>
        {quote?.lisConfigured && sellableItems.length > 0 && (
          <div className="hidden gap-2.5 lg:flex">
            <div className="rounded-2xl border border-border bg-card px-4 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("sell.inventoryValue")}</p>
              <p className="mt-0.5 whitespace-nowrap font-heading text-[22px] font-semibold tabular-nums text-foreground">{inventoryValue.toLocaleString("ru-RU").replace(/ /g, " ")} <span className="text-sm text-primary">so'm</span></p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("sell.sellableCount")}</p>
              <p className="mt-0.5 font-heading text-[22px] font-semibold tabular-nums text-foreground">{sellableItems.length}</p>
            </div>
          </div>
        )}
      </div>

      <RecentSales recent={stats?.recent} />

      {quote && !quote.lisConfigured && (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
          <Clock className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">{t("sell.comingSoon")}</p>
            <p className="text-xs text-muted-foreground">{t("sell.comingSoonDesc")}</p>
          </div>
        </div>
      )}

      {steamMissing ? (
        <EmptyState icon={SteamLogo} title={t("sellx.steamMissing")} desc={t("sell.connectSteam")}>
          <button type="button" onClick={connectSteam} className="flex items-center gap-2 rounded-2xl bg-gold-grad px-5 py-2.5 font-heading text-sm font-semibold uppercase tracking-wide text-[#1A160F] transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.97]">
            <SteamLogo className="size-4" />
            {t("trade.connectSteam")}
          </button>
        </EmptyState>
      ) : (
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
          <section className="min-w-0 space-y-3">
            {/* Qidiruv + saralash (+ kompyuterda Top-5) */}
            <div className="flex items-center gap-2">
              <label className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 transition-[border-color,box-shadow] duration-200 focus-within:border-ring focus-within:shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_20%,transparent)] lg:max-w-[340px]">
                <Search className="size-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("sell.search")}
                  className="w-full rounded-none bg-transparent py-2.5 text-[13px] text-foreground caret-primary outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label={t("sell.clear")} className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground">
                    <X className="size-3" />
                  </button>
                )}
              </label>
              <span className="hidden flex-1 lg:block" />
              {items.length > 0 && <SortMenu value={sort} onChange={setSort} />}
              {quote?.lisConfigured && sellableItems.length > 0 && (
                <button type="button" onClick={selectTop5} className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-primary/35 bg-[var(--row-sel)] px-3 py-2.5 text-xs font-medium text-primary transition-all duration-200 hover:-translate-y-0.5 active:scale-95 lg:flex">
                  <Crown className="size-3.5" />
                  {t("sellx.top5")}
                </button>
              )}
              <button type="button" onClick={() => load(true)} disabled={loading} aria-label={t("sell.refresh")} title={t("sell.refresh")} className="flex shrink-0 items-center justify-center rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
                <RefreshCw className={cn("size-4", loading && "spin")} />
              </button>
            </div>
            {query && !loading && <p className="-mt-1 px-1 text-[11px] text-muted-foreground">{visible.length ? t("sellx.found", { n: visible.length }) : <span className="text-destructive">{t("sellx.notFound")}</span>}</p>}

            {/* Filtr chiplari (03) */}
            {items.length > 0 && (
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
                {SELL_CATEGORIES.filter((c) => c === "all" || catCounts[c]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setCategory(c); hap("selection"); }}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs transition-all duration-200 active:scale-95",
                      category === c ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border bg-card font-medium text-muted-foreground hover:border-ring/60 hover:text-foreground"
                    )}
                  >
                    {t(`sellx.cat.${c}`)}
                    <span className="text-[10.5px] opacity-65">{catCounts[c] || 0}</span>
                  </button>
                ))}
                {quote?.lisConfigured && sellableItems.length > 0 && (
                  <button type="button" onClick={selectTop5} className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/35 bg-[var(--row-sel)] px-3.5 py-1.5 text-xs font-medium text-primary transition-all active:scale-95 lg:hidden">
                    <Crown className="size-3.5" />
                    {t("sellx.top5")}
                  </button>
                )}
              </div>
            )}

            {/* Ro'yxat / jadval */}
            {loading && !quote ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 px-1 text-xs text-muted-foreground">
                  <span className="size-4 rounded-full border-2 border-primary/30 border-t-primary spin" />
                  {t("sellx.loadingInv")}
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card p-3">
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
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                    {visible.slice(0, shown).map((it, i) => (
                      <SkinCard
                        key={it.assetId}
                        index={i}
                        item={it}
                        priced={Number.isFinite(it.priceSom)}
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

          {/* Kompyuter: "Tanlanganlar" paneli */}
          <aside className="sticky top-6 hidden space-y-3.5 lg:block">
            <div className="rounded-3xl border border-border bg-card p-[22px] shadow-panel">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("sellx.picked")}</p>
              <div className="mt-3.5 max-h-72 space-y-2.5 overflow-y-auto">
                {selectedItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("sellx.pickedEmpty")}</p>
                ) : selectedItems.map((it) => (
                  <div key={it.assetId} className="animate-fade-up flex items-center gap-3">
                    <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg" style={{ background: `radial-gradient(ellipse at center, ${rarityColor(it.rarity, it.name)}30, transparent 72%)` }}>
                      {it.imageUrl ? <img src={imgSrc(it.imageUrl)} alt="" className="max-h-full max-w-full rounded-none object-contain" /> : <Package className="size-4 text-muted-foreground" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{it.name}</span>
                    <span className="shrink-0 whitespace-nowrap font-heading text-sm font-semibold tabular-nums text-foreground">{fmtMoney(it.priceSom)}</span>
                  </div>
                ))}
              </div>
              <div className="my-[18px] h-px bg-border" />
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-muted-foreground">{t("sellx.totalLabel")}</span>
                <span className="font-heading text-[28px] font-semibold tabular-nums text-foreground">{total.toLocaleString("ru-RU").replace(/ /g, " ")} <span className="text-[15px] text-primary">so'm</span></span>
              </div>
              <SellButton count={selected.size} submitting={submitting} onClick={confirmSell} className="mt-[18px] w-full" />
              <p className="mt-3.5 text-[11.5px] leading-relaxed text-muted-foreground">{t("sellx.nextStep")}</p>
            </div>
            <div className="space-y-3 rounded-3xl border border-border bg-card px-5 py-[18px] text-xs shadow-panel">
              {["safe", "cards", "support"].map((k) => (
                <p key={k} className="flex items-center gap-2.5"><span className="text-primary">◆</span><span className="text-muted-foreground">{t(`sellx.bullet.${k}`)}</span></p>
              ))}
            </div>
          </aside>
        </div>
      )}

      {mine.length > 0 && (
        <div id="my-requests" className="scroll-mt-20 rounded-3xl border border-border bg-card p-4 shadow-panel sm:p-5">
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
                    <button type="button" onClick={() => setResult({ request: r, botTradeUrl: quote?.botTradeUrl })} className="text-xs text-primary underline-offset-2 hover:underline">
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

      {/* Telefon: pastda oltin "Sotish" paneli (03) */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: "120%", opacity: 0 }}
            animate={{ y: 0, opacity: 1, transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ y: "120%", opacity: 0, transition: { duration: 0.24, ease: "easeIn" } }}
            className="fixed inset-x-0 bottom-0 z-30 px-3.5 pb-[18px] lg:hidden"
          >
            <div className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-[20px] bg-gold-grad py-3.5 pl-5 pr-4 text-[#1A160F] shadow-[0_18px_40px_-18px_rgba(201,162,74,.6)]">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.14em] opacity-65">{t("sellx.nPicked", { n: selected.size })}</p>
                <p className="font-heading text-[22px] font-bold tabular-nums">{fmtMoney(total)}</p>
              </div>
              <button
                type="button"
                onClick={confirmSell}
                disabled={submitting}
                className="flex shrink-0 items-center gap-2 rounded-2xl bg-[#1A160F] px-[18px] py-3 text-[13px] font-semibold text-[#E3CC98] transition-transform duration-100 active:scale-[0.96] disabled:opacity-70"
              >
                {submitting && <span className="size-3.5 rounded-full border-2 border-[#E3CC98]/30 border-t-[#E3CC98] spin" />}
                {submitting ? t("sellx.sending") : `${t("sell.sellBtn")} →`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
