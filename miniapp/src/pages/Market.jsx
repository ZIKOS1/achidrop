import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ShoppingBag, Plus, Search, Package, Clock, Send, Zap } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { fmtMoney, imgSrc, parseSkinName, rarityColor, hap, confirmTg } from "../utils";
import { t } from "../i18n";
import Empty from "../components/Empty";
import { RarityBar, WearBadge } from "../components/SkinBadges";
import TradeStatusBadge from "../components/TradeStatus";
import TradeOnboardingWizard from "../components/TradeOnboardingWizard";

// Auksion "Chiqarib olish" (Inventory.jsx) bilan bir xil holat-belgi naqshi —
// bu yerda market xaridlari (user.marketPurchases) uchun ishlatiladi.
const WITHDRAW_TAG_KEYS = {
  pending: ["border-warning/40 bg-warning/10 text-warning", "inventory.pending"],
  requested: ["border-accent/40 bg-accent/10 text-accent", "inventory.requested"],
  auto_sent: ["border-accent/40 bg-accent/10 text-accent", "inventory.autoSent"],
  delivered: ["border-success/40 bg-success/10 text-success", "inventory.delivered"],
  rejected: ["border-destructive/40 bg-destructive/10 text-destructive", "inventory.rejected"],
  auto_failed: ["border-destructive/40 bg-destructive/10 text-destructive", "inventory.autoFailed"],
};

const GRID_CLASSES = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

function MarketCard({ listing, onClick, delay }) {
  const skin = listing.skins?.[0];
  const { weapon, skin: skinName } = parseSkinName(skin?.name || "");
  const rColor = rarityColor(skin?.rarity);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(delay, 8 * 45) / 1000, ease: [0.16, 1, 0.3, 1] }}
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -3 }}
      className="group flex flex-col overflow-hidden border border-border bg-card text-left shadow-panel transition-colors hover:border-primary/40"
    >
      <RarityBar color={rColor} rarity={skin?.rarity} />
      <div className="relative aspect-square overflow-hidden bg-[radial-gradient(circle_at_50%_35%,color-mix(in_oklch,var(--foreground)_6%,var(--card)),var(--card))]">
        {skin?.imageUrl ? (
          <img src={imgSrc(skin.imageUrl)} alt="" loading="lazy" className="absolute inset-0 size-full object-contain p-4 transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"><Package className="size-10 text-muted-foreground" /></div>
        )}
        <div className="absolute left-2 top-2"><WearBadge float={skin?.float} short /></div>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        {weapon && (
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {skin?.statTrak && <span className="text-warning">StatTrak™ </span>}
            {weapon}
          </p>
        )}
        <p className="truncate font-heading text-sm font-bold leading-tight text-foreground">{skinName || skin?.name}</p>
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <p className="font-heading text-lg font-bold tracking-tight text-primary">{fmtMoney(listing.agreedPrice)}</p>
          <span className="truncate pb-0.5 text-[11px] text-muted-foreground">{listing.sellerName ?? ""}</span>
        </div>
      </div>
    </motion.button>
  );
}

// Grid'ning birinchi kartasi — CS.Float uslubidagi katalogdagi oddiy
// MarketCard'ga o'xshaydi (bir xil o'lcham/animatsiya), lekin skin rasmi
// o'rniga ⚡ ikonka bilan "Tezkor sotish"ga taklif qiladi (MarketSell.jsx'ga olib boradi).
function InstantSellCard({ onClick, delay }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(delay, 8 * 45) / 1000, ease: [0.16, 1, 0.3, 1] }}
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -3 }}
      className="group flex flex-col overflow-hidden border border-primary/40 bg-primary/5 text-left shadow-panel transition-colors hover:border-primary"
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,color-mix(in_oklch,var(--primary)_14%,var(--card)),var(--card))]">
        <Zap className="size-10 text-primary transition-transform duration-500 group-hover:scale-110" />
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <p className="truncate font-heading text-sm font-bold leading-tight text-primary">{t("market.instantSellCardTitle")}</p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{t("market.instantSellCardDesc")}</p>
      </div>
    </motion.button>
  );
}

function MyListingRow({ listing, onClick, delay }) {
  const skin = listing.skins?.[0];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: delay / 1000, ease: [0.16, 1, 0.3, 1] }}
      whileTap={{ scale: 0.98 }}
      className="flex w-full items-center gap-3 border border-border bg-card p-3 text-left shadow-panel transition-colors hover:border-primary/40"
    >
      <span className="flex size-14 shrink-0 items-center justify-center border border-border bg-secondary/40">
        {skin?.imageUrl ? <img src={imgSrc(skin.imageUrl)} alt="" className="size-full object-contain" /> : <Package className="size-6 text-muted-foreground" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{skin?.name ?? "Skin"}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <TradeStatusBadge status={listing.status} className="text-[10px]" />
          {listing.agreedPrice != null && (
            <span className="font-heading text-xs font-bold text-primary">{listing.agreedPrice.toLocaleString()} {t("common.somWithAmount")}</span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// Sotib olingan (marketPurchases) bitta item — Inventory.jsx'dagi g'olib
// kartasiga o'xshab, status belgisi va (kerak bo'lsa) "Chiqarib olish" tugmasi.
function PurchaseRow({ purchase: p, onWithdraw, delay }) {
  const [cls, lblKey] = WITHDRAW_TAG_KEYS[p.status || "pending"];
  const canWithdraw = !p.status || p.status === "pending" || p.status === "rejected" || p.status === "auto_failed";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: delay / 1000, ease: [0.16, 1, 0.3, 1] }}
      className="flex w-full flex-wrap items-center gap-3 border border-border bg-card p-3 shadow-panel"
    >
      <span className="flex size-14 shrink-0 items-center justify-center border border-border bg-secondary/40">
        {p.image ? <img src={imgSrc(p.image)} alt="" className="size-full object-contain" /> : <Package className="size-6 text-muted-foreground" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{p.lotName ?? "Skin"}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={"border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " + cls}>{t(lblKey)}</span>
          {p.price != null && (
            <span className="font-heading text-xs font-bold text-primary">{p.price.toLocaleString()} {t("common.somWithAmount")}</span>
          )}
        </div>
        {p.status === "rejected" && p.rejectComment && (
          <p className="mt-1 text-[11px] text-destructive">{p.rejectComment}</p>
        )}
        {p.status === "auto_failed" && p.lastFailReason && (
          <p className="mt-1 text-[11px] text-destructive">{p.lastFailReason}</p>
        )}
      </div>
      {canWithdraw && (
        <button
          type="button"
          onClick={() => onWithdraw(p.lotId)}
          className="flex shrink-0 items-center gap-1.5 bg-primary px-3 py-2 font-heading text-xs font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Send className="size-3.5" />
          {(p.status === "rejected" || p.status === "auto_failed") ? t("inventory.retry") : t("inventory.take")}
        </button>
      )}
    </motion.div>
  );
}

export default function Market() {
  const { user, setUser, navigate, showToast } = useApp();
  const [tab, setTab] = useState("catalog");
  const [listings, setListings] = useState(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [mine, setMine] = useState(null);
  const [purchases, setPurchases] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [pendingPurchaseId, setPendingPurchaseId] = useState(null);

  useEffect(() => {
    if (tab !== "catalog") return;
    let alive = true;
    setListings(null);
    setError(false);
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    params.set("sort", sort);
    const h = setTimeout(() => {
      api(`/api/market?${params.toString()}`)
        .then((d) => alive && setListings(d))
        .catch(() => alive && setError(true));
    }, 300);
    return () => { alive = false; clearTimeout(h); };
  }, [tab, search, sort]);

  useEffect(() => {
    if (tab !== "mine" || !user) return;
    let alive = true;
    setMine(null);
    setPurchases(null);
    setError(false);
    Promise.all([api("/api/market-mine"), api("/api/market-inventory")])
      .then(([m, p]) => { if (alive) { setMine(m); setPurchases(p); } })
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [tab, user]);

  function goSell() {
    if (!user) return navigate("login");
    hap("impact", "light");
    navigate("market-sell");
  }

  // Inventory.jsx'dagi sendWithdrawRequest/confirmAndWithdraw/withdraw bilan
  // bir xil naqsh — faqat /api/withdraw o'rniga /api/market-withdraw'ga.
  async function sendWithdrawRequest(purchaseId) {
    try {
      const r = await api(`/api/market-withdraw/${purchaseId}`, { method: "POST" });
      showToast(t(r?.auto ? "inventory.autoSentToast" : "inventory.requestSent"), "ok");
      hap("notif", "success");
      setPurchases((prev) => prev && prev.map((p) => (p.lotId === purchaseId ? { ...p, status: r?.auto ? "auto_sent" : "requested" } : p)));
    } catch (e) {
      showToast(e.error || t("common.genericError"), "err");
    }
  }

  async function confirmAndWithdraw(purchaseId, tradeLink) {
    const confirmMsg = `"${tradeLink}" ${t("inventory.confirmWithdraw")}`;
    if (await confirmTg(confirmMsg)) sendWithdrawRequest(purchaseId);
  }

  function withdraw(purchaseId) {
    if (!user?.tradeLink) {
      setPendingPurchaseId(purchaseId);
      setShowWizard(true);
      return;
    }
    confirmAndWithdraw(purchaseId, user.tradeLink);
  }

  function handleWizardDone(patch) {
    setShowWizard(false);
    if (patch?.tradeLink) {
      setUser((u) => (u ? { ...u, tradeLink: patch.tradeLink, ...(patch.steamPublicConfirmed ? { steamPublicConfirmed: true } : {}) } : u));
      if (pendingPurchaseId != null) confirmAndWithdraw(pendingPurchaseId, patch.tradeLink);
    }
    setPendingPurchaseId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">{t("market.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("market.subtitle")}</p>
        </div>
        <motion.button
          type="button"
          onClick={goSell}
          whileTap={{ scale: 0.96 }}
          whileHover={{ y: -2 }}
          className="flex shrink-0 items-center gap-2 bg-primary px-4 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90"
        >
          <Plus className="size-4" />
          {t("market.sell")}
        </motion.button>
      </div>

      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setTab("catalog")}
          className={"px-4 py-2.5 font-heading text-sm font-bold uppercase tracking-wide transition-colors " + (tab === "catalog" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          {t("market.catalog")}
        </button>
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={"px-4 py-2.5 font-heading text-sm font-bold uppercase tracking-wide transition-colors " + (tab === "mine" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          {t("market.myListings")}
        </button>
      </div>

      {tab === "catalog" && (
        <>
          <div className="flex flex-col gap-3 border border-border bg-card p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex flex-1 items-center gap-2 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("market.search")}
                className="w-full border border-border bg-secondary py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="newest">{t("market.sortNewest")}</option>
              <option value="price_asc">{t("market.sortPriceAsc")}</option>
              <option value="price_desc">{t("market.sortPriceDesc")}</option>
            </select>
          </div>

          {listings === null && !error && <MarketGridSkeleton />}
          {error && <Empty icon={ShoppingBag} title={t("common.error")} desc={t("common.errorRetry")} />}
          {listings && (
            <>
              {listings.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("market.empty")}</p>
              )}
              <div className={GRID_CLASSES}>
                <InstantSellCard onClick={goSell} delay={0} />
                {listings.map((l, i) => (
                  <MarketCard key={l.id} listing={l} delay={(i + 1) * 45} onClick={() => navigate("market-detail", l.id)} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "mine" && (
        !user ? (
          <Empty icon={ShoppingBag} title={t("common.loginRequired")}>
            <button type="button" onClick={() => navigate("login")} className="bg-primary px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90">
              {t("common.login")}
            </button>
          </Empty>
        ) : mine === null && !error ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border border-border bg-card p-3 shadow-panel">
                <span className="skeleton size-14 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-3/5" />
                  <div className="skeleton h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        ) : mine && mine.selling.length === 0 && mine.buying.length === 0 && !(purchases && purchases.length > 0) ? (
          <Empty icon={Clock} title={t("market.emptyMine")} desc={t("market.emptyMineDesc")}>
            <button type="button" onClick={goSell} className="bg-primary px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90">
              {t("market.sell")}
            </button>
          </Empty>
        ) : mine && (
          <div className="space-y-6">
            {mine.selling.length > 0 && (
              <div>
                <h2 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("market.selling")}</h2>
                <div className="space-y-2">
                  {mine.selling.map((l, i) => (
                    <MyListingRow key={l.id} listing={l} delay={i * 40} onClick={() => navigate("market-detail", l.id)} />
                  ))}
                </div>
              </div>
            )}
            {mine.buying.length > 0 && (
              <div>
                <h2 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("market.buying")}</h2>
                <div className="space-y-2">
                  {mine.buying.map((l, i) => (
                    <MyListingRow key={l.id} listing={l} delay={i * 40} onClick={() => navigate("market-detail", l.id)} />
                  ))}
                </div>
              </div>
            )}
            {purchases && purchases.length > 0 && (
              <div>
                <h2 className="mb-1 font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("market.myInventoryTitle")}</h2>
                <p className="mb-2 text-xs text-muted-foreground">{t("market.myInventoryDesc")}</p>
                <div className="space-y-2">
                  {purchases.map((p, i) => (
                    <PurchaseRow key={p.lotId ?? i} purchase={p} delay={i * 40} onWithdraw={withdraw} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {showWizard && <TradeOnboardingWizard onDone={handleWizardDone} />}
    </div>
  );
}

function MarketGridSkeleton() {
  return (
    <div className={GRID_CLASSES}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="overflow-hidden border border-border bg-card shadow-panel">
          <div className="skeleton aspect-square w-full" />
          <div className="space-y-2 p-3">
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-4 w-4/5" />
            <div className="skeleton h-5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
