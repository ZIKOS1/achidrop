import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Package, Copy, Send, Globe, Lock, CheckCircle2, XCircle, Link2, Clock } from "lucide-react";
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

export default function TradeDetail({ id }) {
  const { user, setUser, navigate, showToast, refreshMe } = useApp();
  const [trade, setTrade] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [chatText, setChatText] = useState("");
  const [selectedSkin, setSelectedSkin] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const pollRef = useRef(null);

  function load() {
    api(`/api/trades/${id}`).then(setTrade).catch(() => setNotFound(true));
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

  if (notFound) return <Empty title={t("trade.notFound")}><BackLink onClick={() => navigate("trade")} label={t("trade.back")} /></Empty>;
  if (!trade) return <TradeDetailSkeleton />;

  const isSeller = trade.sellerId === user.id;
  const isBuyer = trade.buyerId === user.id;
  const participant = isSeller || isBuyer;

  // Har bir amal: server bilan gaplashadi, muvaffaqiyatda yangi trade holatini
  // qaytaradi, xato bo'lsa (masalan "insufficient_balance") tarjima qilingan
  // xabar ko'rsatadi va — agar server xato bilan birga trade ham qaytargan
  // bo'lsa (masalan tasdiq bekor qilingani) — holatni baribir yangilaydi.
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

  async function join() {
    const r = await act(() => api(`/api/trades/${id}/join`, { method: "POST" }));
    if (r) setTrade(r);
  }

  async function sendPrice() {
    const price = Number(priceInput.replace(/\s/g, ""));
    if (!Number.isFinite(price) || price <= 0) return showToast(t("trade.err.invalid_price"), "err");
    const r = await act(() => api(`/api/trades/${id}/price`, { method: "POST", body: JSON.stringify({ price }) }));
    if (r) { setTrade(r); setShowPriceForm(false); setPriceInput(""); }
  }

  async function confirm() {
    const r = await act(() => api(`/api/trades/${id}/confirm`, { method: "POST" }));
    if (r?.trade) setTrade(r.trade);
    if (r?.locked) refreshMe(); // narx qulflanganda xaridor balansi darhol yechiladi
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
    if (!(await confirmTg(t("trade.cancelConfirm")))) return;
    const r = await act(() => api(`/api/trades/${id}/cancel`, { method: "POST" }));
    if (r?.trade) setTrade(r.trade);
    if (r?.refunded) refreshMe(); // bekor qilinganda band qilingan mablag' qaytariladi
  }

  async function sendChat() {
    const text = chatText.trim();
    if (!text) return;
    setChatText("");
    const r = await act(() => api(`/api/trades/${id}/chat`, { method: "POST", body: JSON.stringify({ text }) }));
    if (r) setTrade(r);
  }

  function copyInvite() {
    navigator.clipboard?.writeText(trade.inviteLink);
    showToast(t("trade.linkCopied"), "ok");
    hap("impact", "light");
  }

  function copyBuyerTradeLink() {
    navigator.clipboard?.writeText(trade.buyerTradeLink);
    showToast(t("trade.linkCopied"), "ok");
    hap("impact", "light");
  }

  // Wizard tugatilganda (yoki "Keyinroq" bilan yopilganda) local user'ni
  // qayta yuklamasdan yangilaymiz — shu bilan banner darhol yo'qoladi.
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

  const alreadyConfirmed = isSeller ? trade.sellerConfirmed : isBuyer ? trade.buyerConfirmed : false;

  return (
    <div className="space-y-5">
      <BackLink onClick={() => navigate("trade")} label={t("trade.back")} />

      {isBuyer && trade.agreedPrice != null && !TERMINAL.includes(trade.status) && !user.tradeLink && (
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
              <p className="text-xs text-muted-foreground">{t("trade.needTradeLinkDesc")}</p>
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
        {(() => {
          const skins = trade.skins || [];
          const single = skins.length === 1 ? skins[0] : null;
          return (
            <div className="flex items-start gap-4">
              {single ? (
                <button
                  type="button"
                  onClick={() => setSelectedSkin(single)}
                  className="hover-lift flex size-20 shrink-0 items-center justify-center border border-border bg-secondary/40 transition-colors hover:border-primary/50"
                >
                  {single.imageUrl ? (
                    <img src={imgSrc(single.imageUrl)} alt="" className="size-full object-contain" />
                  ) : (
                    <Package className="size-8 text-muted-foreground" />
                  )}
                </button>
              ) : (
                <div className="flex shrink-0 flex-wrap gap-1.5" style={{ maxWidth: "5.5rem" }}>
                  {skins.slice(0, 4).map((s, i) => (
                    <button
                      type="button"
                      key={s.assetId ?? i}
                      onClick={() => setSelectedSkin(s)}
                      className="hover-lift flex size-10 items-center justify-center border border-border bg-secondary/40 transition-colors hover:border-primary/50"
                    >
                      {s.imageUrl ? <img src={imgSrc(s.imageUrl)} alt="" className="size-full object-contain" /> : <Package className="size-4 text-muted-foreground" />}
                    </button>
                  ))}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="font-heading text-lg font-bold text-foreground">
                  {single ? single.name : t("trade.skinsCount").replace("{n}", skins.length)}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <TradeStatusBadge status={trade.status} className="transition-colors" />
                  <span className="inline-flex items-center gap-1 border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {trade.visibility === "private" ? <Lock className="size-3" /> : <Globe className="size-3" />}
                    {trade.visibility === "private" ? t("trade.visibilityBadgePrivate") : t("trade.visibilityBadgePublic")}
                  </span>
                  {single?.float != null && (
                    <span className={"border px-2 py-0.5 text-[11px] font-semibold " + wearClasses(single.float)}>
                      {single.wear} · {single.float.toFixed(4)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {(trade.skins?.length ?? 0) > 1 && (
          <div className="mt-4 space-y-1.5 border-t border-border pt-4">
            {trade.skins.map((s, i) => (
              <button
                type="button"
                key={s.assetId ?? i}
                onClick={() => setSelectedSkin(s)}
                className="flex w-full items-center gap-2 text-left text-sm text-foreground transition-colors hover:text-primary"
              >
                <span className="flex size-8 shrink-0 items-center justify-center border border-border bg-secondary/40">
                  {s.imageUrl ? <img src={imgSrc(s.imageUrl)} alt="" className="size-full object-contain" /> : <Package className="size-3.5 text-muted-foreground" />}
                </span>
                <span className="truncate">{s.name}</span>
                {s.float != null && <span className={"ml-auto shrink-0 border px-1.5 py-0.5 text-[10px] font-semibold " + wearClasses(s.float)}>{s.float.toFixed(4)}</span>}
              </button>
            ))}
          </div>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("trade.seller")}</dt>
            <dd className="font-medium text-foreground">{trade.sellerName ?? trade.sellerId}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("trade.buyer")}</dt>
            <dd className="font-medium text-foreground">{trade.buyerName ?? t("trade.noBuyerYet")}</dd>
          </div>
        </dl>

        <AnimatePresence>
        {trade.agreedPrice != null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-4 flex items-center justify-between border-t border-border pt-4"
          >
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("trade.price")}</span>
            <div className="text-right">
              <motion.p
                key={trade.priceLocked ? "locked" : trade.agreedPrice}
                initial={{ scale: trade.priceLocked ? 1.15 : 1, opacity: trade.priceLocked ? 0.6 : 1 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="font-heading text-xl font-bold text-primary"
              >
                {trade.agreedPrice.toLocaleString()} {t("common.somWithAmount")}
              </motion.p>
              <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                {trade.priceLocked ? (
                  t("trade.priceLocked")
                ) : (
                  <>
                    {trade.sellerConfirmed ? <CheckCircle2 className="size-3 text-success" /> : <XCircle className="size-3" />}
                    {t("trade.confirmedSeller")} ·
                    {trade.buyerConfirmed ? <CheckCircle2 className="size-3 text-success" /> : <XCircle className="size-3" />}
                    {t("trade.confirmedBuyer")}
                  </>
                )}
              </p>
              {isSeller && (() => {
                const fee = trade.status === "completed" ? trade.feeAmount : tradeFee(trade.agreedPrice);
                const net = trade.status === "completed" ? trade.sellerProceeds : trade.agreedPrice - fee;
                if (!fee) return null;
                return (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("trade.feeHint")}: <span className="text-warning">{fee.toLocaleString()}</span>
                    {" · "}{t("trade.feeNet")}: <span className="text-success">{net.toLocaleString()}</span>
                  </p>
                );
              })()}
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        {isSeller && trade.status === "open" && trade.inviteLink && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("trade.inviteLink")}</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 truncate border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground">{trade.inviteLink}</div>
              <button type="button" onClick={copyInvite} className="hover-lift flex shrink-0 items-center gap-1.5 border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-accent">
                <Copy className="size-3.5" />
              </button>
            </div>
          </div>
        )}

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

        {/* ── Actions ── */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          {!isSeller && !isBuyer && trade.status === "open" && (
            <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={busy} onClick={join} className={actionBtn + " bg-primary text-primary-foreground hover:-translate-y-0.5 hover:bg-primary/90"}>
              {trade.agreedPrice != null ? t("trade.buyNow") : t("trade.makeOffer")}
            </motion.button>
          )}

          {participant && !TERMINAL.includes(trade.status) && trade.buyerId && (
            <>
              {!trade.priceLocked && !showPriceForm && (
                <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={busy} onClick={() => setShowPriceForm(true)} className={actionBtn + " border border-border text-foreground hover:border-primary/50 hover:text-primary"}>
                  {t("trade.proposePrice")}
                </motion.button>
              )}
              {trade.agreedPrice != null && !trade.priceLocked && !alreadyConfirmed && (
                <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={busy} onClick={confirm} className={actionBtn + " bg-success text-white hover:-translate-y-0.5 hover:bg-success/90"}>
                  {t("trade.confirmBtn")}
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
              <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={busy} onClick={dispute} className={actionBtn + " border border-warning/40 text-warning hover:bg-warning/10"}>
                {t("trade.dispute")}
              </motion.button>
              <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={busy} onClick={cancel} className={actionBtn + " border border-destructive/40 text-destructive hover:bg-destructive/10"}>
                {t("trade.cancel")}
              </motion.button>
            </>
          )}

          {isSeller && trade.status === "open" && (
            <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={busy} onClick={cancel} className={actionBtn + " border border-destructive/40 text-destructive hover:bg-destructive/10"}>
              {t("trade.cancel")}
            </motion.button>
          )}
        </div>

        <AnimatePresence>
        {showPriceForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 flex gap-2 border-t border-border pt-4"
          >
            <input
              type="number"
              autoFocus
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendPrice()}
              placeholder={t("trade.priceInputLabel")}
              className="flex-1 border border-border bg-secondary px-3 py-2.5 font-heading text-sm font-bold text-foreground outline-none transition-colors focus:border-primary"
            />
            <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={busy} onClick={sendPrice} className={actionBtn + " bg-primary text-primary-foreground hover:-translate-y-0.5 hover:bg-primary/90"}>
              {t("trade.sendProposal")}
            </motion.button>
          </motion.div>
        )}
        </AnimatePresence>
      </motion.div>

      {/* ── Chat ── */}
      {participant && !TERMINAL.includes(trade.status) && trade.buyerId && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="border border-border bg-card p-5 shadow-panel"
        >
          {trade.chatLog?.length > 0 && (
            <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
              <AnimatePresence initial={false}>
                {trade.chatLog.map((m, i) => {
                  const mine = m.from === user.id;
                  const senderName = m.from === trade.sellerId ? trade.sellerName : trade.buyerName;
                  return (
                    <motion.div
                      key={i}
                      layout
                      initial={{ opacity: 0, y: 10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className={"max-w-[80%] " + (mine ? "ml-auto" : "")}
                    >
                      <p className={"mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground " + (mine ? "text-right" : "text-left")}>
                        {senderName ?? (m.from === trade.sellerId ? t("trade.seller") : t("trade.buyer"))}
                      </p>
                      <div className={"px-3 py-2 text-sm " + (mine ? "bg-primary/15 text-foreground" : "bg-secondary/60 text-foreground")}>
                        {m.text}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder={t("trade.chat")}
              className="flex-1 border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
            />
            <motion.button whileTap={{ scale: 0.9 }} type="button" disabled={busy || !chatText.trim()} onClick={sendChat} className={actionBtn + " bg-primary text-primary-foreground hover:-translate-y-0.5 hover:bg-primary/90"}>
              <Send className="size-4" />
            </motion.button>
          </div>
        </motion.div>
      )}

      <SkinShowcaseModal skin={selectedSkin} onClose={() => setSelectedSkin(null)} />
      {showWizard && <TradeOnboardingWizard onDone={handleWizardDone} />}
    </div>
  );
}

function TradeDetailSkeleton() {
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
          <div className="skeleton h-9 w-28" />
        </div>
      </div>
    </div>
  );
}
