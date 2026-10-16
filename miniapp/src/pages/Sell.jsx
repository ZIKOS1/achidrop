import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Banknote, Check, CheckCircle2, Clock, Copy, ExternalLink, Layers, Lock, Package, RefreshCw, Search, Wallet, XCircle } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { imgSrc, wearClasses, fmtMoney, hap, rarityColor } from "../utils";
import { t } from "../i18n";
import { cn } from "../lib/cn";
import Empty from "../components/Empty";
import { SteamLogo } from "../components/BrandIcons";

// Skin sotish (Lis-Skins uslubida): user Steam inventaridan skinlarni
// belgilaydi → "Sotish" → so'rov yaratiladi va bizning trade link
// ko'rsatiladi → user skinni Steam orqali O'ZI yuboradi → admin Telegram'da
// "Oldim"ni bosgach pul balansga tushadi (server: POST /api/instant-sell).

function StatusBadge({ status }) {
  const map = {
    awaiting_admin: { icon: Clock, cls: "text-warning border-warning/40 bg-warning/10" },
    credited: { icon: CheckCircle2, cls: "text-success border-success/40 bg-success/10" },
    rejected: { icon: XCircle, cls: "text-destructive border-destructive/40 bg-destructive/10" },
  };
  const m = map[status] || { icon: XCircle, cls: "text-muted-foreground border-border bg-secondary" };
  const Icon = m.icon;
  const label = map[status] ? t(`sell.status.${status}`) : t("sell.status.other");
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", m.cls)}>
      <Icon className="size-3" />
      {label}
    </span>
  );
}

// Kartochka: rasm ortida nodirlik rangidagi yumshoq nur va pastda rangli
// chiziq (pichoq ★ — oltin), tanlanganda brend rangidagi halqa.
function SkinCard({ item, selected, disabled, priced, onToggle }) {
  const rColor = rarityColor(item.rarity, item.name);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all duration-200 ease-out",
        selected
          ? "border-primary shadow-[0_0_0_1px_var(--primary),0_14px_32px_-14px_color-mix(in_oklch,var(--primary)_70%,transparent)]"
          : "border-border",
        disabled
          ? "cursor-not-allowed opacity-45 grayscale-[35%]"
          : "hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_18px_36px_-18px_color-mix(in_oklch,var(--primary)_55%,transparent)]"
      )}
    >
      <span
        className={cn(
          "absolute right-2.5 top-2.5 z-10 flex size-6 items-center justify-center rounded-full border-2 transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/80 group-hover:border-primary/60"
        )}
      >
        {selected && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      {item.wear && (
        <span className={cn("absolute left-2.5 top-2.5 z-10 rounded-md border px-1.5 py-0.5 text-[10px] font-bold", wearClasses(item.float))}>{item.wear}</span>
      )}
      <span
        className="relative flex aspect-[4/3] items-center justify-center px-3 pt-6"
        style={{ background: `radial-gradient(ellipse 70% 60% at 50% 55%, ${rColor}2e, transparent 70%)` }}
      >
        {item.imageUrl ? (
          <img src={imgSrc(item.imageUrl)} alt="" loading="lazy" className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <Package className="size-8 text-muted-foreground" />
        )}
      </span>
      <span className="h-0.5 w-full" style={{ backgroundColor: rColor }} />
      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 min-h-[2.5em] text-xs font-medium leading-tight text-foreground">{item.name}</p>
        {item.float != null && <p className="mt-0.5 text-[10px] text-muted-foreground">{item.float.toFixed(4)}</p>}
        <div className="mt-auto pt-2">
          {!item.tradable ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning">
              <Lock className="size-3" />
              {t("sell.locked")}
            </span>
          ) : priced ? (
            <>
              <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{t("sell.youGet")}</span>
              <span className="font-heading text-base font-bold leading-tight text-foreground">{fmtMoney(item.priceSom)}</span>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">{t("sell.noPrice")}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function TradeLinkPanel({ request, botTradeUrl, onDone }) {
  const { showToast, tg } = useApp();
  function copy() {
    navigator.clipboard?.writeText(botTradeUrl);
    showToast(t("sell.copied"), "ok");
    hap("impact", "light");
  }
  function openSteam() {
    if (tg?.openLink) tg.openLink(botTradeUrl);
    else window.open(botTradeUrl, "_blank", "noopener");
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4 border border-border bg-card p-5 shadow-panel"
    >
      <div className="flex items-center gap-3 border border-success/40 bg-success/10 p-3">
        <CheckCircle2 className="size-5 shrink-0 text-success" />
        <div className="min-w-0">
          <p className="font-heading text-sm font-bold text-foreground">{t("sell.sentTitle", { id: request.id })}</p>
          <p className="text-xs text-muted-foreground">
            {t("sell.total")}: <span className="font-semibold text-success">{fmtMoney(request.totalSom)}</span>
          </p>
        </div>
      </div>

      <p className="text-sm text-foreground">{t("sell.sendInstr")}</p>

      <div className="space-y-2 border border-border bg-secondary/30 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sell.tradeLink")}</p>
        {botTradeUrl ? (
          <>
            <code className="block break-all text-xs text-foreground">{botTradeUrl}</code>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={openSteam} className="flex flex-1 items-center justify-center gap-2 bg-primary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90">
                <ExternalLink className="size-4" />
                {t("sell.openSteam")}
              </button>
              <button type="button" onClick={copy} className="flex flex-1 items-center justify-center gap-2 border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary">
                <Copy className="size-4" />
                {t("sell.copy")}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-destructive">{t("sell.noTradeLink")}</p>
        )}
      </div>

      <ul className="max-h-60 divide-y divide-border overflow-y-auto border border-border">
        {request.items.map((it) => (
          <li key={it.assetId} className="flex items-center gap-3 p-2">
            <span className="flex size-10 shrink-0 items-center justify-center bg-secondary">
              {it.imageUrl ? <img src={imgSrc(it.imageUrl)} alt="" className="max-h-full max-w-full object-contain" /> : <Package className="size-4 text-muted-foreground" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-foreground">{it.marketHashName}</span>
              {it.float != null && <span className="text-[10px] text-muted-foreground">{it.float.toFixed(4)}</span>}
            </span>
            <span className="shrink-0 text-xs font-semibold text-success">{fmtMoney(it.priceSom)}</span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-warning">{t("sell.warnOnly")}</p>
      <p className="text-xs text-muted-foreground">{t("sell.afterAccept")}</p>

      <button type="button" onClick={onDone} className="w-full border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
        {t("sell.done")}
      </button>
    </motion.div>
  );
}

export default function Sell() {
  const { user, navigate, showToast, openModal, closeModal, tg } = useApp();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { request, botTradeUrl }
  const [mine, setMine] = useState([]);

  const load = useCallback((refresh = false) => {
    setLoading(true);
    setError("");
    api(`/api/instant-sell/quote${refresh ? "?refresh=1" : ""}`)
      .then((q) => {
        setQuote(q);
        // Inventar yangilanganda yo'qolgan/narxsiz skinlar tanlovdan chiqadi.
        setSelected((prev) => {
          const ok = new Set(q.items.filter((i) => i.tradable && Number.isFinite(i.priceSom)).map((i) => i.assetId));
          return new Set([...prev].filter((id) => ok.has(id)));
        });
      })
      .catch((e) => setError(e?.error || t("common.genericError")))
      .finally(() => setLoading(false));
  }, []);

  const loadMine = useCallback(() => {
    api("/api/instant-sell-mine").then(setMine).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    load(true); // har kirganda inventar Steam'dan yangidan olinadi (keshsiz)
    loadMine();
  }, [user?.id, user?.steamId64, load, loadMine]);

  const items = quote?.items || [];
  const sellable = (it) => quote?.lisConfigured && it.tradable && Number.isFinite(it.priceSom);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
    // Sotiladiganlari oldinda, qimmatlari birinchi.
    return [...list].sort((a, b) => (sellable(b) - sellable(a)) || ((b.priceSom || 0) - (a.priceSom || 0)));
  }, [items, query, quote?.lisConfigured]);

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

  function selectAll() {
    setSelected(new Set(visible.filter(sellable).slice(0, maxItems).map((i) => i.assetId)));
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
    openModal({
      title: t("sell.confirmTitle"),
      icon: Banknote,
      noInput: true,
      info: `${t("sell.items", { n: selectedItems.length })}: ${fmtMoney(total)}\n${t("sell.afterAccept")}`,
      okLabel: t("sell.confirmBtn"),
      onSubmit: () => { closeModal(); submit(); },
    });
  }

  if (!user) {
    return (
      <Empty icon={Banknote} title={t("common.loginRequired")}>
        <button type="button" onClick={() => navigate("login")} className="bg-primary px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90">
          {t("common.login")}
        </button>
      </Empty>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-xl">
        <TradeLinkPanel request={result.request} botTradeUrl={result.botTradeUrl} onDone={() => { setResult(null); load(true); }} />
      </div>
    );
  }

  const steps = [t("sell.step1"), t("sell.step2"), t("sell.step3")];
  const sellableItems = items.filter(sellable);
  const inventoryValue = sellableItems.reduce((sum, i) => sum + i.priceSom, 0);

  return (
    <div className="space-y-5 pb-28">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-[linear-gradient(135deg,var(--hero-a),var(--hero-b))] p-5 shadow-panel sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground sm:text-3xl">{t("sell.title")}</h1>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{t("sell.subtitle")}</p>
          </div>
          {quote?.lisConfigured && sellableItems.length > 0 && (
            <div className="flex gap-3">
              <div className="rounded-xl border border-border bg-background/60 px-4 py-2.5">
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"><Wallet className="size-3.5" />{t("sell.inventoryValue")}</p>
                <p className="font-heading text-lg font-bold text-foreground">{fmtMoney(inventoryValue)}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/60 px-4 py-2.5">
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"><Layers className="size-3.5" />{t("sell.sellableCount")}</p>
                <p className="font-heading text-lg font-bold text-foreground">{sellableItems.length}</p>
              </div>
            </div>
          )}
        </div>
        <ol className="relative mt-5 grid gap-2 sm:grid-cols-3 sm:gap-0">
          {steps.map((s, i) => (
            <li key={i} className="relative flex items-center gap-2.5 text-xs text-foreground sm:pr-4">
              <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-xs font-bold text-primary-foreground shadow-[0_0_16px_-4px_var(--primary)]">{i + 1}</span>
              <span className="font-medium">{s}</span>
              {i < steps.length - 1 && <span className="ml-auto hidden h-px flex-1 bg-gradient-to-r from-primary/50 to-border sm:block" />}
            </li>
          ))}
        </ol>
      </div>

      {quote && !quote.lisConfigured && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
          <Clock className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-heading text-sm font-bold text-foreground">{t("sell.comingSoon")}</p>
            <p className="text-xs text-muted-foreground">{t("sell.comingSoonDesc")}</p>
          </div>
        </div>
      )}

      {!user.steamId64 || quote?.steamConnected === false ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-12 text-center shadow-panel">
          <p className="text-sm text-muted-foreground">{t("sell.connectSteam")}</p>
          <button type="button" onClick={connectSteam} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90">
            <SteamLogo className="size-4" />
            {t("trade.connectSteam")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 transition-colors focus-within:border-primary/60">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("sell.search")}
                className="w-full bg-transparent py-2 text-sm text-foreground outline-none"
              />
            </div>
            {quote?.lisConfigured && (
              <button type="button" onClick={selected.size ? () => setSelected(new Set()) : selectAll} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40">
                {selected.size ? t("sell.clear") : t("sell.selectAll")}
              </button>
            )}
            <button type="button" onClick={() => load(true)} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 disabled:opacity-50">
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              {t("sell.refresh")}
            </button>
          </div>

          {loading && !quote ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="space-y-2 overflow-hidden rounded-xl border border-border bg-card p-2.5">
                  <div className="skeleton aspect-[4/3] w-full rounded-lg" />
                  <div className="skeleton h-3 w-4/5" />
                  <div className="skeleton h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          ) : !items.length ? (
            <Empty icon={Package} title={t("sell.empty")} desc={t("sell.emptyDesc")} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {visible.map((it) => (
                <SkinCard
                  key={it.assetId}
                  item={it}
                  priced={Number.isFinite(it.priceSom)}
                  selected={selected.has(it.assetId)}
                  disabled={!sellable(it)}
                  onToggle={() => toggle(it)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {mine.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-panel sm:p-5">
          <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-foreground">{t("sell.myRequests")}</h2>
          <ul className="divide-y divide-border">
            {mine.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex -space-x-3">
                    {(r.items || []).slice(0, 3).map((it) => (
                      <span key={it.assetId} className="flex size-10 items-center justify-center rounded-lg border border-border bg-secondary">
                        {it.imageUrl ? <img src={imgSrc(it.imageUrl)} alt="" className="max-h-full max-w-full object-contain" /> : <Package className="size-4 text-muted-foreground" />}
                      </span>
                    ))}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">#{r.id} · {t("sell.items", { n: (r.items || [r]).length })}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{fmtMoney(r.totalSom ?? r.priceSom)}</span>
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

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 lg:left-64"
          >
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-panel-lg">
              <div className="flex min-w-0 items-center gap-3">
                <span className="hidden -space-x-3 sm:flex">
                  {selectedItems.slice(0, 4).map((it) => (
                    <span key={it.assetId} className="flex size-10 items-center justify-center rounded-lg border border-border bg-secondary">
                      {it.imageUrl ? <img src={imgSrc(it.imageUrl)} alt="" className="max-h-full max-w-full object-contain" /> : <Package className="size-4 text-muted-foreground" />}
                    </span>
                  ))}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("sell.selected", { n: selected.size })}</p>
                  <p className="font-heading text-xl font-bold text-foreground">{fmtMoney(total)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={confirmSell}
                disabled={submitting}
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 shadow-[0_10px_26px_-10px_var(--primary)] font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                <Banknote className="size-4" />
                {t("sell.sellBtn")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
