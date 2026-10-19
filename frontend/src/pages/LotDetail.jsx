import { useEffect, useMemo, useState } from "react";
import {
  Gavel,
  Wallet,
  CheckCircle2,
  Link2,
  ShieldCheck,
  Info,
  Plus,
  Trophy,
  Ban,
  Lock,
  Package,
  Zap,
} from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { fmtMoney, hap, imgSrc, rarityColor, wearCode, wearName } from "../utils";
import { t } from "../i18n";
import BackLink from "../components/BackLink";
import Empty from "../components/Empty";
import Countdown from "../components/Countdown";
import { RarityBar, SkinName, WearBadge } from "../components/SkinBadges";
import FloatStickersDisplay from "../components/FloatStickersDisplay";

export default function LotDetail({ id }) {
  const { navigate, user, setUser, showToast } = useApp();
  const [lot, setLot] = useState(null);
  const [error, setError] = useState(false);
  const [, forceTick] = useState(0);
  const [amount, setAmount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);

  function load() {
    api(`/api/auction/${id}`).then((l) => { setLot(l); setAmount(null); }).catch(() => setError(true));
  }
  useEffect(load, [id]);

  useEffect(() => {
    if (lot?.status !== "active" || (!lot.endTimeMs && !lot.earlyAccessLocked)) return;
    const iv = setInterval(() => {
      if (lot.endTimeMs && lot.endTimeMs <= Date.now()) { load(); return; }
      forceTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, [lot]);

  const minStep = lot ? Math.max(lot.minBid, Math.round(lot.price * 0.02)) : 0;
  const minNext = lot ? lot.price + lot.minBid : 0;
  const bidAmount = amount ?? minNext;
  const tooLow = lot ? bidAmount < minNext : false;
  const insufficient = user ? bidAmount > (user.balance ?? 0) : false;

  const stats = useMemo(() => {
    if (!lot) return [];
    return [
      { label: t("lot.minBidLabel"), value: `+${fmtMoney(lot.minBid)}` },
      ...(lot.float != null ? [{ label: `${t("lot.floatLabel")} (${wearName(lot.float)})`, value: lot.float.toFixed(4) + (lot.paintSeed != null ? ` · #${lot.paintSeed}` : "") }] : []),
      ...(lot.rarity ? [{ label: t("lot.rarityLabel"), value: lot.rarity, color: rarityColor(lot.rarity) }] : []),
      { label: t("lot.leader"), value: lot.lastBidderName || t("lot.none") },
      ...(lot.tradeBanDays > 0 ? [{ label: t("lot.tradeBanLabel"), value: <span className="text-warning">{t("auctions.tradeBanNotice", { days: lot.tradeBanDays })}</span> }] : []),
    ];
  }, [lot]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate("auctions")} label={t("lot.back")} />
        <Empty icon={Ban} title={t("common.error")} />
      </div>
    );
  }
  if (!lot) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate("auctions")} label={t("lot.back")} />
        <LotDetailSkeleton />
      </div>
    );
  }

  if (lot.status !== "active") {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate("auctions")} label={t("lot.back")} />
        <Empty
          icon={Trophy}
          title={t("lot.auctionEnded")}
          desc={`${t("lot.auctionEndedDesc")} ${lot.lastBidderName || t("lot.none")} · ${fmtMoney(lot.price)}`}
        />
      </div>
    );
  }

  const locked = lot.earlyAccessLocked && lot.earlyAccessUntilMs > Date.now();
  const myWinning = user && lot.lastBidder === user.id;

  async function placeBid() {
    if (!user) { navigate("login"); return; }
    if (tooLow || insufficient || busy) return;
    hap("impact", "medium");
    setBusy(true);
    try {
      const r = await api("/api/bid", { method: "POST", body: JSON.stringify({ lotId: lot.id, amount: bidAmount }) });
      setUser((u) => (u ? { ...u, balance: r.newBalance } : u));
      showToast(`${t("lot.bidAccepted")} ${fmtMoney(bidAmount)}`, "ok");
      hap("notif", "success");
      setFlash(true);
      setTimeout(() => setFlash(false), 700);
      setTimeout(load, 300);
    } catch (e) {
      showToast(e.error || t("common.genericError"), "err");
      hap("notif", "error");
    } finally {
      setBusy(false);
    }
  }

  async function quickBid() {
    if (!user) { navigate("login"); return; }
    hap("impact", "medium");
    setBusy(true);
    try {
      const r = await api(`/api/quickbid/${lot.id}`, { method: "POST" });
      setUser((u) => (u ? { ...u, balance: r.newBalance } : u));
      showToast(`${t("lot.quickBidLabel")}: ${fmtMoney(r.newPrice)}`, "ok");
      hap("notif", "success");
      load();
    } catch (e) {
      showToast(e.error || t("common.genericError"), "err");
      hap("notif", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <BackLink onClick={() => navigate("auctions")} label={t("lot.back")} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Showcase */}
        <div className="lg:col-span-3 animate-fade-up">
          <div className="overflow-hidden border border-border bg-card shadow-panel-lg">
            <RarityBar color={rarityColor(lot.rarity)} rarity={lot.rarity} />
            <div
              className="relative aspect-[16/11] bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklch,var(--foreground)_6%,var(--card)),var(--card))]"
              style={{ boxShadow: `inset 0 0 120px -20px ${rarityColor(lot.rarity)}33` }}
            >
              {lot.image ? (
                <img
                  src={imgSrc(lot.image)}
                  alt={lot.name}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                  className="absolute inset-0 size-full object-contain p-8 drop-shadow-[0_18px_30px_rgba(0,0,0,0.35)]"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center"><Package className="size-16 text-muted-foreground" /></div>
              )}
              <div className="absolute left-3 top-3 flex flex-col gap-1.5">
                <WearBadge float={lot.float} />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="hover-lift border border-border bg-card p-3 shadow-panel">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className="mt-0.5 flex items-center gap-1.5 font-heading text-sm font-bold text-foreground">
                  {s.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color, boxShadow: `0 0 8px 0 ${s.color}99` }} aria-hidden="true" />}
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {(lot.float != null || lot.stickers?.length > 0) && (
            <div className="mt-4 border border-border bg-card p-4 shadow-panel">
              <FloatStickersDisplay
                floatValue={lot.float}
                stickers={(lot.stickers || []).map((s) => ({
                  icon: s.icon,
                  wearPercent: s.wear == null ? 100 : Math.round((1 - s.wear) * 100),
                }))}
              />
            </div>
          )}
        </div>

        {/* Bid panel */}
        <div className="lg:col-span-2">
          <div className="animate-fade-up space-y-4 lg:sticky lg:top-20" style={{ "--fade-delay": "90ms" }}>
            <div className="relative overflow-hidden border border-border bg-card p-5 shadow-panel-lg">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 to-transparent" />
              <h1 className="relative font-heading text-2xl font-bold uppercase tracking-wide text-foreground"><SkinName name={lot.name} /></h1>

              <div className="relative mt-4 flex items-center justify-between border-y border-border py-4">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("lot.endsIn")}</span>
                <Countdown endMs={locked ? lot.earlyAccessUntilMs : lot.endTimeMs} className="text-lg" />
              </div>

              <div className="relative py-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("lot.currentPrice")}</p>
                <p className={"font-heading text-4xl font-bold tracking-tight text-primary transition-all duration-300 sm:text-5xl" + (flash ? " text-glow-primary scale-[1.03]" : "")}>
                  {fmtMoney(lot.price)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("lot.minNext")} <span className="font-semibold text-foreground">{fmtMoney(minNext)}</span></p>
              </div>

              {myWinning && (
                <div className="mb-3 flex items-center gap-2 border border-success/30 bg-success/10 px-3 py-2 text-sm font-semibold text-success">
                  <Trophy className="size-4" />
                  {t("lot.winning")}
                </div>
              )}

              {locked ? (
                <div className="space-y-2 border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Lock className="size-4 shrink-0" />
                    {t("lot.earlyAccessNotice")}
                  </p>
                  <p>{t("lot.opensToEveryoneIn")} <Countdown endMs={lot.earlyAccessUntilMs} className="text-sm" /></p>
                </div>
              ) : !user ? (
                <button
                  type="button"
                  onClick={() => navigate("login")}
                  className="flex w-full items-center justify-center gap-2 bg-primary py-3 font-heading text-base font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Gavel className="size-5" />
                  {t("lot.loginToBid")}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-stretch gap-2">
                    <input
                      type="number"
                      value={bidAmount}
                      min={minNext}
                      step={minStep}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className="w-full border border-border bg-secondary px-3 py-2.5 font-heading text-lg font-bold text-foreground outline-none focus:border-primary"
                      aria-label={t("lot.bidAmountLabel")}
                    />
                    <button
                      type="button"
                      onClick={() => setAmount(bidAmount + minStep)}
                      aria-label={t("lot.increaseBid")}
                      className="flex w-12 shrink-0 items-center justify-center border border-border bg-secondary text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Plus className="size-5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 5].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAmount(lot.price + minStep * m)}
                        className="flex-1 border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                      >
                        +{fmtMoney(minStep * m)}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={placeBid}
                    disabled={tooLow || insufficient || busy}
                    className="flex w-full items-center justify-center gap-2 bg-primary py-3 font-heading text-base font-bold uppercase tracking-wide text-primary-foreground shadow-panel transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90  disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    <Gavel className="size-5" />
                    {busy ? "..." : t("auctions.placeBid")}
                  </button>
                  <button
                    type="button"
                    onClick={quickBid}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 border border-border bg-secondary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-foreground transition-colors hover:border-accent/40 hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Zap className="size-4" />
                    {t("lot.quickBidLabel")} (+{fmtMoney(lot.minBid)})
                  </button>

                  {insufficient && <p className="text-xs text-destructive">{t("lot.insufficientBalance")}</p>}
                  {tooLow && !insufficient && <p className="text-xs text-warning">{t("lot.tooLow")}</p>}

                  <div className="mt-4 flex items-center justify-between border border-border bg-secondary/60 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Wallet className="size-4 text-accent" />
                      {t("lot.yourBalance")}
                    </span>
                    <span className="font-heading text-base font-bold text-accent text-glow-accent">{fmtMoney(user.balance ?? 0)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 border border-border bg-card p-5 shadow-panel">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <Link2 className="size-4 text-accent" />
                  {t("lot.steamTrade")}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                  <CheckCircle2 className="size-4" />
                  {t("lot.safe")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <ShieldCheck className="size-4 text-primary" />
                  {t("lot.seller")}
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  Admin <span className="text-success">({t("profile.confirmed")})</span>
                </span>
              </div>
              <div className="flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0 text-accent" />
                <p>{t("lot.sellerTrustNote")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LotDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div className="skeleton aspect-[16/11] w-full" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5 border border-border bg-card p-3 shadow-panel">
              <div className="skeleton h-3 w-2/3" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
      <div className="lg:col-span-2 space-y-4">
        <div className="border border-border bg-card p-5 shadow-panel-lg">
          <div className="skeleton h-6 w-3/4" />
          <div className="skeleton mt-4 h-4 w-1/3" />
          <div className="skeleton mt-4 h-10 w-2/3" />
          <div className="skeleton mt-6 h-12 w-full" />
        </div>
        <div className="skeleton h-24 w-full" />
      </div>
    </div>
  );
}
