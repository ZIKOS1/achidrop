import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Repeat, Plus, Package, ChevronDown, ArrowLeft, Globe, Lock, Check } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { imgSrc, wearClasses, hap, tradeErr, tradeFee } from "../utils";
import { t } from "../i18n";
import Empty from "../components/Empty";
import { CardRowsSkeleton } from "../components/Skeleton";
import TradeStatusBadge from "../components/TradeStatus";
import { SteamLogo } from "../components/BrandIcons";

const PICKER_PAGE_SIZE = 5;

function TradeCard({ trade, viewerId, onClick, delay }) {
  const isSeller = trade.sellerId === viewerId;
  const role = isSeller ? t("trade.roleSeller") : trade.buyerId === viewerId ? t("trade.roleBuyer") : null;
  const skins = trade.skins || [];
  const first = skins[0];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: delay / 1000, ease: [0.16, 1, 0.3, 1] }}
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -2 }}
      className="flex w-full items-center gap-3 border border-border bg-card p-3 text-left shadow-panel transition-colors hover:border-primary/40"
    >
      <span className="relative flex size-14 shrink-0 items-center justify-center border border-border bg-secondary/40">
        {first?.imageUrl ? (
          <img src={imgSrc(first.imageUrl)} alt="" className="size-full object-contain" />
        ) : (
          <Package className="size-6 text-muted-foreground" />
        )}
        {skins.length > 1 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            +{skins.length - 1}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {first?.name ?? "Skin"}
          {skins.length > 1 && <span className="text-muted-foreground"> {t("trade.andMore").replace("{n}", skins.length - 1)}</span>}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {role && <span className="border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{role}</span>}
          <TradeStatusBadge status={trade.status} className="text-[10px]" />
          {isSeller && (
            <span className="inline-flex items-center gap-1 border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {trade.visibility === "private" ? <Lock className="size-2.5" /> : <Globe className="size-2.5" />}
              {trade.visibility === "private" ? t("trade.private") : t("trade.public")}
            </span>
          )}
          {trade.agreedPrice && (
            <span className="font-heading text-xs font-bold text-primary">{trade.agreedPrice.toLocaleString()} {t("common.somWithAmount")}</span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

export default function Trade() {
  const { user, navigate, showToast, tg } = useApp();
  const [trades, setTrades] = useState(null);
  const [error, setError] = useState(false);
  const [picking, setPicking] = useState(false);
  const [inv, setInv] = useState(null);
  const [invError, setInvError] = useState("");
  const [invLoading, setInvLoading] = useState(false);
  const [invShown, setInvShown] = useState(PICKER_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState([]);
  const [priceStep, setPriceStep] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [creating, setCreating] = useState(false);

  function load() {
    api("/api/trades").then(setTrades).catch(() => setError(true));
  }
  useEffect(load, []);

  if (!user) {
    return (
      <Empty icon={Repeat} title={t("common.loginRequired")}>
        <button type="button" onClick={() => navigate("login")} className="bg-primary px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90">
          {t("common.login")}
        </button>
      </Empty>
    );
  }

  async function connectSteam() {
    try {
      const r = await api("/api/steam-login-url");
      if (tg?.openLink) tg.openLink(r.url);
      else window.open(r.url, "_blank");
    } catch (e) {
      showToast(tradeErr(e), "err");
    }
  }

  async function openPicker() {
    setPicking(true);
    setSelectedIds([]);
    setPriceStep(false);
    setInvShown(PICKER_PAGE_SIZE);
    if (user.steamId64 && !inv) {
      setInvLoading(true);
      try {
        setInv(await api("/api/trade-inventory"));
      } catch (e) {
        setInvError(tradeErr(e));
      } finally {
        setInvLoading(false);
      }
    }
  }

  function closePicker() {
    setPicking(false);
    setSelectedIds([]);
    setPriceStep(false);
    setPriceInput("");
    setVisibility("public");
    setPromoCode("");
    setPromoApplied(false);
  }

  function toggleSelect(assetId) {
    setSelectedIds((ids) => (ids.includes(assetId) ? ids.filter((id) => id !== assetId) : [...ids, assetId]));
  }

  const selectedItems = (inv || []).filter((it) => selectedIds.includes(it.assetId));

  async function applyPromo() {
    if (!promoCode.trim()) return;
    setApplyingPromo(true);
    try {
      await api("/api/trades/check-promo", { method: "POST", body: JSON.stringify({ code: promoCode.trim().toUpperCase() }) });
      setPromoApplied(true);
      hap("notif", "success");
      showToast(t("trade.promoApplied"), "ok");
    } catch (e) {
      setPromoApplied(false);
      showToast(tradeErr(e), "err");
    } finally {
      setApplyingPromo(false);
    }
  }

  async function confirmCreate() {
    const price = priceInput.trim() ? Number(priceInput.replace(/\s/g, "")) : null;
    if (price != null && price < 999) return showToast(t("trade.err.min_price"), "err");
    setCreating(true);
    try {
      const body = {
        assetIds: selectedIds,
        price,
        visibility,
        promoCode: promoCode.trim() ? promoCode.trim().toUpperCase() : undefined,
      };
      const result = await api("/api/trades", { method: "POST", body: JSON.stringify(body) });
      hap("notif", "success");
      showToast(t("trade.createdToast"), "ok");
      navigate("trade-detail", result.id);
    } catch (e) {
      showToast(tradeErr(e), "err");
    } finally {
      setCreating(false);
    }
  }

  const visibleInv = (inv || []).slice(0, invShown);
  const hasMore = inv && inv.length > invShown;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">{t("trade.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("trade.subtitle")}</p>
      </div>

      {!picking && (
        <motion.button
          type="button"
          onClick={openPicker}
          whileTap={{ scale: 0.97 }}
          whileHover={{ y: -2 }}
          className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-border bg-secondary/30 py-4 font-heading text-sm font-bold uppercase tracking-wide text-foreground transition-colors hover:border-primary/50 hover:text-primary sm:w-auto sm:px-6"
        >
          <Plus className="size-4" />
          {t("trade.new")}
        </motion.button>
      )}

      <AnimatePresence>
      {picking && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="border border-border bg-card p-5 shadow-panel"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-bold uppercase tracking-wide text-foreground">
              {priceStep ? t("trade.priceStepTitle") : t("trade.pickSkin")}
            </h2>
            <button type="button" onClick={closePicker} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {t("common.close")}
            </button>
          </div>

          {!user.steamId64 ? (
            <div className="mt-4 flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">{t("trade.connectSteamFirst")}</p>
              <button type="button" onClick={connectSteam} className="flex items-center gap-2 bg-primary px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90">
                <SteamLogo className="size-4" />
                {t("trade.connectSteam")}
              </button>
            </div>
          ) : invLoading ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5 border border-border bg-secondary/30 p-3">
                  <span className="skeleton size-16" />
                  <span className="skeleton h-3 w-4/5" />
                </div>
              ))}
            </div>
          ) : invError ? (
            <p className="mt-4 text-sm text-destructive">{invError}</p>
          ) : priceStep ? (
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 space-y-4"
            >
              <div className="flex flex-wrap gap-2 border border-border bg-secondary/30 p-3">
                {selectedItems.map((it) => (
                  <span key={it.assetId} className="flex size-14 shrink-0 items-center justify-center border border-border bg-background" title={it.name}>
                    {it.image ? <img src={imgSrc(it.image)} alt="" className="size-full object-contain" /> : <Package className="size-5 text-muted-foreground" />}
                  </span>
                ))}
                <div className="flex flex-1 items-center justify-center px-2 text-sm text-muted-foreground">
                  {selectedItems.length > 1 ? t("trade.selectedCount").replace("{n}", selectedItems.length) : selectedItems[0]?.name}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{t("trade.priceStepDesc")}</p>

              <input
                type="number"
                autoFocus
                min={999}
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder={t("trade.priceOptionalPlaceholder")}
                className="w-full border border-border bg-secondary px-3 py-2.5 font-heading text-sm font-bold text-foreground outline-none transition-colors focus:border-primary"
              />

              <AnimatePresence>
                {(() => {
                  const p = Number(priceInput.replace(/\s/g, ""));
                  if (!Number.isFinite(p) || p <= 0) return null;
                  const fee = promoApplied ? 0 : tradeFee(p);
                  if (fee <= 0 && !promoApplied) return null;
                  return (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-xs text-muted-foreground"
                    >
                      {t("trade.feeHint")}: <span className="font-semibold text-warning">{fee.toLocaleString()} {t("common.somWithAmount")}</span>
                      {" — "}{t("trade.feeNet")}: <span className="font-semibold text-success">{(p - fee).toLocaleString()} {t("common.somWithAmount")}</span>
                    </motion.p>
                  );
                })()}
              </AnimatePresence>

              <div>
                <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">{t("trade.visibility")}</p>
                <div className="relative flex border border-border bg-secondary/30 p-1">
                  <motion.span
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    className="absolute inset-y-1 w-[calc(50%-4px)] bg-primary"
                    style={{ left: visibility === "public" ? 4 : "50%" }}
                  />
                  <button
                    type="button"
                    onClick={() => setVisibility("public")}
                    className={
                      "relative z-10 flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold uppercase tracking-wide transition-colors " +
                      (visibility === "public" ? "text-primary-foreground" : "text-muted-foreground")
                    }
                  >
                    <Globe className="size-3.5" />
                    {t("trade.public")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility("private")}
                    className={
                      "relative z-10 flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold uppercase tracking-wide transition-colors " +
                      (visibility === "private" ? "text-primary-foreground" : "text-muted-foreground")
                    }
                  >
                    <Lock className="size-3.5" />
                    {t("trade.private")}
                  </button>
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={visibility}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                    className="mt-1.5 text-xs text-muted-foreground"
                  >
                    {visibility === "public" ? t("trade.publicHint") : t("trade.privateHint")}
                  </motion.p>
                </AnimatePresence>
              </div>

              <div>
                <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">{t("trade.promoLabel")}</p>
                <div className="flex gap-2">
                  <input
                    value={promoCode}
                    onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoApplied(false); }}
                    placeholder={t("trade.promoPlaceholder")}
                    maxLength={15}
                    className={
                      "flex-1 border bg-secondary px-3 py-2.5 text-sm font-medium text-foreground outline-none transition-colors focus:border-primary " +
                      (promoApplied ? "border-success" : "border-border")
                    }
                  />
                  <button
                    type="button"
                    disabled={applyingPromo || !promoCode.trim() || promoApplied}
                    onClick={applyPromo}
                    className="shrink-0 border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {applyingPromo ? "..." : promoApplied ? <Check className="size-4 text-success" /> : t("trade.applyPromo")}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPriceStep(false)}
                  className="flex items-center gap-1.5 border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                  {t("trade.changeSkin")}
                </button>
                <button
                  type="button"
                  disabled={creating}
                  onClick={confirmCreate}
                  className="flex flex-1 items-center justify-center gap-2 bg-primary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? <span className="spin size-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : t("trade.listNow")}
                </button>
              </div>
            </motion.div>
          ) : inv && inv.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("trade.noTradable")}</p>
          ) : (
            <>
              <p className="mt-3 text-xs text-muted-foreground">{t("trade.multiSelectHint")}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {visibleInv.map((it, i) => {
                  const isSelected = selectedIds.includes(it.assetId);
                  return (
                    <motion.button
                      key={it.assetId}
                      type="button"
                      onClick={() => toggleSelect(it.assetId)}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, delay: Math.min(i, 11) * 0.03 }}
                      whileTap={{ scale: 0.95 }}
                      whileHover={{ y: -3 }}
                      className={
                        "relative flex flex-col items-center gap-1.5 border p-3 text-center transition-colors " +
                        (isSelected ? "border-primary bg-primary/10" : "border-border bg-secondary/30 hover:border-primary/40")
                      }
                    >
                      {isSelected && (
                        <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3.5" />
                        </span>
                      )}
                      <span className="flex size-16 items-center justify-center">
                        {it.image ? <img src={imgSrc(it.image)} alt="" className="size-full object-contain" /> : <Package className="size-6 text-muted-foreground" />}
                      </span>
                      <p className="line-clamp-2 text-xs text-foreground">{it.name}</p>
                      {it.float != null && (
                        <span className={"border px-1.5 py-0.5 text-[10px] font-semibold " + wearClasses(it.float)}>
                          {it.float.toFixed(4)}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setInvShown((n) => n + PICKER_PAGE_SIZE)}
                  className="mt-4 flex w-full items-center justify-center gap-2 border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <ChevronDown className="size-4" />
                  {t("trade.showRest")} ({inv.length - invShown})
                </button>
              )}
              <AnimatePresence>
                {selectedIds.length > 0 && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    onClick={() => setPriceStep(true)}
                    className="mt-4 flex w-full items-center justify-center gap-2 bg-primary py-3 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90"
                  >
                    {t("trade.continueWith").replace("{n}", selectedIds.length)}
                  </motion.button>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      )}
      </AnimatePresence>

      {trades === null && !error && <CardRowsSkeleton />}
      {error && <Empty title={t("common.error")} desc={t("common.errorRetry")} />}

      {trades && (
        <>
          {trades.mine.length === 0 && trades.open.length === 0 ? (
            <Empty icon={Repeat} title={t("trade.empty")} desc={t("trade.emptyDesc")} />
          ) : (
            <>
              {trades.mine.length > 0 && (
                <div>
                  <h2 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("trade.mine")}</h2>
                  <div className="space-y-2">
                    {trades.mine.map((tr, i) => (
                      <TradeCard key={tr.id} trade={tr} viewerId={user.id} delay={i * 40} onClick={() => navigate("trade-detail", tr.id)} />
                    ))}
                  </div>
                </div>
              )}
              {trades.open.length > 0 && (
                <div>
                  <h2 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("trade.open")}</h2>
                  <div className="space-y-2">
                    {trades.open.map((tr, i) => (
                      <TradeCard key={tr.id} trade={tr} viewerId={user.id} delay={i * 40} onClick={() => navigate("trade-detail", tr.id)} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
