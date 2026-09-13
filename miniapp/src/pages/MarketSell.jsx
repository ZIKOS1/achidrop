import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShoppingBag, Package, ChevronDown, ArrowLeft, Check } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { imgSrc, wearClasses, hap, tradeErr, tradeFee } from "../utils";
import { t } from "../i18n";
import Empty from "../components/Empty";
import BackLink from "../components/BackLink";
import { SteamLogo } from "../components/BrandIcons";

const PAGE_SIZE = 8;

export default function MarketSell() {
  const { user, navigate, showToast, tg } = useApp();
  const [inv, setInv] = useState(null);
  const [invError, setInvError] = useState("");
  const [invLoading, setInvLoading] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState(null);
  const [priceStep, setPriceStep] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user?.steamId64 || inv) return;
    setInvLoading(true);
    api("/api/trade-inventory")
      .then(setInv)
      .catch((e) => setInvError(tradeErr(e)))
      .finally(() => setInvLoading(false));
  }, [user]);

  if (!user) {
    return (
      <Empty icon={ShoppingBag} title={t("common.loginRequired")}>
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

  const selected = (inv || []).find((it) => it.assetId === selectedId);

  async function confirmCreate() {
    const price = Number(priceInput.replace(/\s/g, ""));
    if (!Number.isFinite(price) || price < 999) return showToast(t("trade.err.min_price"), "err");
    setCreating(true);
    try {
      const result = await api("/api/market", { method: "POST", body: JSON.stringify({ assetId: selectedId, price }) });
      hap("notif", "success");
      showToast(t("market.createdToast"), "ok");
      navigate("market-detail", result.id);
    } catch (e) {
      showToast(tradeErr(e), "err");
    } finally {
      setCreating(false);
    }
  }

  const visibleInv = (inv || []).slice(0, shown);
  const hasMore = inv && inv.length > shown;

  return (
    <div className="space-y-5">
      <BackLink onClick={() => navigate("market")} label={t("market.back")} />

      <div className="border border-border bg-card p-5 shadow-panel">
        <h2 className="font-heading text-base font-bold uppercase tracking-wide text-foreground">
          {priceStep ? t("market.priceStepTitle") : t("market.pickSkin")}
        </h2>

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
            <div className="flex items-center gap-3 border border-border bg-secondary/30 p-3">
              <span className="flex size-14 shrink-0 items-center justify-center border border-border bg-background">
                {selected?.image ? <img src={imgSrc(selected.image)} alt="" className="size-full object-contain" /> : <Package className="size-5 text-muted-foreground" />}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm text-foreground">{selected?.name}</p>
            </div>

            <input
              type="number"
              autoFocus
              min={999}
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder={t("market.priceInputLabel")}
              className="w-full border border-border bg-secondary px-3 py-2.5 font-heading text-sm font-bold text-foreground outline-none transition-colors focus:border-primary"
            />

            <AnimatePresence>
              {(() => {
                const p = Number(priceInput.replace(/\s/g, ""));
                if (!Number.isFinite(p) || p <= 0) return null;
                const fee = tradeFee(p);
                if (fee <= 0) return null;
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

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPriceStep(false)}
                className="flex items-center gap-1.5 border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                {t("market.changeSkin")}
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={confirmCreate}
                className="flex flex-1 items-center justify-center gap-2 bg-primary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? <span className="spin size-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : t("market.listNow")}
              </button>
            </div>
          </motion.div>
        ) : inv && inv.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("trade.noTradable")}</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleInv.map((it, i) => {
                const isSelected = selectedId === it.assetId;
                return (
                  <motion.button
                    key={it.assetId}
                    type="button"
                    onClick={() => { setSelectedId(it.assetId); setPriceStep(true); }}
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
                onClick={() => setShown((n) => n + PAGE_SIZE)}
                className="mt-4 flex w-full items-center justify-center gap-2 border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <ChevronDown className="size-4" />
                {t("trade.showRest")} ({inv.length - shown})
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
