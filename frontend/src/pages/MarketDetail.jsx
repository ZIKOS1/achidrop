import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Package, Copy, Link2, CheckCircle2, Clock } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { imgSrc, wearClasses, hap, confirmTg, tradeErr, tradeFee } from "../utils";
import { t } from "../i18n";
import BackLink from "../components/BackLink";
import Empty from "../components/Empty";
import TradeStatusBadge from "../components/TradeStatus";
import SkinShowcaseModal from "../components/SkinShowcaseModal";
import TradeOnboardingWizard from "../components/TradeOnboardingWizard";

const POLL_MS = 5000;
const TERMINAL = ["completed", "cancelled"];

const actionBtn =
  "hover-lift flex items-center gap-2 px-4 py-2.5 font-heading text-sm font-bold uppercase tracking-wide transition-all duration-200 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";

export default function MarketDetail({ id }) {
  const { user, setUser, navigate, showToast, refreshMe } = useApp();
  const [trade, setTrade] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedSkin, setSelectedSkin] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const pollRef = useRef(null);

  function load() {
    api(`/api/market/${id}`).then(setTrade).catch(() => setNotFound(true));
  }

  useEffect(() => {
    load();
    return () => clearInterval(pollRef.current);
  }, [id]);

  useEffect(() => {
    clearInterval(pollRef.current);
    if (trade && !TERMINAL.includes(trade.status)) {
      pollRef.current = setInterval(load, POLL_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [trade?.status]);

  if (!user) {
    return (
      <Empty title={t("common.loginRequired")}>
        <button type="button" onClick={() => navigate("login")} className="bg-primary px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90">
          {t("common.login")}
        </button>
      </Empty>
    );
  }

  if (notFound) return <Empty title={t("market.notFound")}><BackLink onClick={() => navigate("market")} label={t("market.back")} /></Empty>;
  if (!trade) return <MarketDetailSkeleton />;

  const isSeller = trade.sellerId === user.id;
  const isBuyer = trade.buyerId === user.id;
  const participant = isSeller || isBuyer;

  async function act(fn) {
    setBusy(true);
    try {
      const result = await fn();
      hap("notif", "success");
      return result;
    } catch (e) {
      showToast(tradeErr(e), "err");
      hap("notif", "error");
      if (e?.trade) setTrade(e.trade);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function buy() {
    if (!user.tradeLink) { setShowWizard(true); return; }
    const r = await act(() => api(`/api/market/${id}/buy`, { method: "POST" }));
    if (r) {
      setTrade(r);
      refreshMe();
      showToast(t("market.boughtToast"), "ok");
    }
  }

  async function markSent() {
    const r = await act(() => api(`/api/trades/${id}/sent`, { method: "POST" }));
    if (r) setTrade(r);
  }

  async function markReceived() {
    const r = await act(() => api(`/api/trades/${id}/received`, { method: "POST" }));
    if (r) setTrade(r);
  }

  async function dispute() {
    if (!(await confirmTg(t("trade.disputeConfirm")))) return;
    const r = await act(() => api(`/api/trades/${id}/dispute`, { method: "POST" }));
    if (r) setTrade(r);
  }

  async function cancel() {
    if (!(await confirmTg(t("market.cancelConfirm")))) return;
    const r = await act(() => api(`/api/market/${id}/cancel`, { method: "POST" }));
    if (r) setTrade(r);
  }

  function copyBuyerTradeLink() {
    navigator.clipboard?.writeText(trade.buyerTradeLink);
    showToast(t("trade.linkCopied"), "ok");
    hap("impact", "light");
  }

  function handleWizardDone(patch) {
    setShowWizard(false);
    if (patch?.tradeLink || patch?.steamPublicConfirmed) {
      setUser((u) => (u ? {
        ...u,
        ...(patch.tradeLink ? { tradeLink: patch.tradeLink } : {}),
        ...(patch.steamPublicConfirmed ? { steamPublicConfirmed: true } : {}),
      } : u));
    }
  }

  const skin = trade.skins?.[0];
  const fee = trade.status === "completed" ? trade.feeAmount : tradeFee(trade.agreedPrice);
  const net = trade.status === "completed" ? trade.sellerProceeds : trade.agreedPrice - fee;

  return (
    <div className="space-y-5">
      <BackLink onClick={() => navigate("market")} label={t("market.back")} />

      {!isSeller && trade.status === "open" && !user.tradeLink && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="corner-brackets flex flex-col gap-3 border border-primary/40 bg-primary/10 p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center bg-primary/15 text-primary clip-tactical">
              <Link2 className="size-5" />
            </span>
            <div>
              <p className="font-heading text-sm font-bold text-foreground">{t("trade.needTradeLinkTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("market.needTradeLinkDesc")}</p>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={() => setShowWizard(true)}
            className="hover-lift shrink-0 bg-primary px-4 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90"
          >
            {t("trade.setTradeLinkBtn")}
          </motion.button>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="border border-border bg-card p-5 shadow-panel"
      >
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => setSelectedSkin(skin)}
            className="hover-lift flex size-20 shrink-0 items-center justify-center border border-border bg-secondary/40 transition-colors hover:border-primary/50"
          >
            {skin?.imageUrl ? (
              <img src={imgSrc(skin.imageUrl)} alt="" className="size-full object-contain" />
            ) : (
              <Package className="size-8 text-muted-foreground" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-lg font-bold text-foreground">{skin?.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <TradeStatusBadge status={trade.status} className="transition-colors" />
              {skin?.float != null && (
                <span className={"border px-2 py-0.5 text-[11px] font-semibold " + wearClasses(skin.float)}>
                  {skin.wear} · {skin.float.toFixed(4)}
                </span>
              )}
            </div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("market.seller")}</dt>
            <dd className="font-medium text-foreground">{trade.sellerName ?? trade.sellerId}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("market.buyer")}</dt>
            <dd className="font-medium text-foreground">{trade.buyerName ?? t("trade.noBuyerYet")}</dd>
          </div>
        </dl>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("market.price")}</span>
          <div className="text-right">
            <p className="font-heading text-xl font-bold text-primary">{trade.agreedPrice?.toLocaleString()} {t("common.somWithAmount")}</p>
            {isSeller && fee > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("trade.feeHint")}: <span className="text-warning">{fee.toLocaleString()}</span>
                {" · "}{t("trade.feeNet")}: <span className="text-success">{net.toLocaleString()}</span>
              </p>
            )}
          </div>
        </div>

        {isSeller && trade.buyerId && trade.status === "seller_sending" && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("trade.buyerTradeLink")}</p>
            {trade.buyerTradeLink ? (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 truncate border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground">{trade.buyerTradeLink}</div>
                <button type="button" onClick={copyBuyerTradeLink} className="hover-lift flex shrink-0 items-center gap-1.5 border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-accent">
                  <Copy className="size-3.5" />
                </button>
              </div>
            ) : (
              <p className="mt-2 flex items-center gap-1.5 border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                <Clock className="size-3.5 shrink-0" />
                {t("trade.buyerTradeLinkWaiting")}
              </p>
            )}
          </div>
        )}

        {isBuyer && trade.status === "seller_sending" && (
          <p className="mt-4 flex items-center gap-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
            <Clock className="size-3.5 shrink-0" />
            {t("market.waitingForSeller")}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          {!isSeller && !trade.buyerId && trade.status === "open" && (
            <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={busy} onClick={buy} className={actionBtn + " bg-primary text-primary-foreground hover:-translate-y-0.5 hover:bg-primary/90"}>
              <CheckCircle2 className="size-4" />
              {t("market.buyNow")}
            </motion.button>
          )}
          {isSeller && trade.status === "open" && (
            <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={busy} onClick={cancel} className={actionBtn + " border border-destructive/40 text-destructive hover:bg-destructive/10"}>
              {t("market.cancel")}
            </motion.button>
          )}
          {isSeller && trade.status === "seller_sending" && (
            <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={busy} onClick={markSent} className={actionBtn + " bg-primary text-primary-foreground hover:-translate-y-0.5 hover:bg-primary/90"}>
              {t("trade.markSent")}
            </motion.button>
          )}
          {isBuyer && trade.status === "buyer_confirming" && (
            <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={busy} onClick={markReceived} className={actionBtn + " bg-success text-white hover:-translate-y-0.5 hover:bg-success/90"}>
              {t("trade.markReceived")}
            </motion.button>
          )}
          {participant && !TERMINAL.includes(trade.status) && trade.buyerId && (
            <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={busy} onClick={dispute} className={actionBtn + " border border-warning/40 text-warning hover:bg-warning/10"}>
              {t("trade.dispute")}
            </motion.button>
          )}
        </div>
      </motion.div>

      <SkinShowcaseModal skin={selectedSkin} onClose={() => setSelectedSkin(null)} />
      {showWizard && <TradeOnboardingWizard onDone={handleWizardDone} />}
    </div>
  );
}

function MarketDetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="skeleton h-4 w-16" />
      <div className="border border-border bg-card p-5 shadow-panel">
        <div className="flex items-start gap-4">
          <div className="skeleton size-20 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-5 w-3/5" />
            <div className="skeleton h-4 w-2/5" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div className="space-y-1.5">
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-4 w-3/4" />
          </div>
          <div className="space-y-1.5">
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-4 w-3/4" />
          </div>
        </div>
        <div className="mt-5 flex gap-2 border-t border-border pt-4">
          <div className="skeleton h-9 w-28" />
        </div>
      </div>
    </div>
  );
}
