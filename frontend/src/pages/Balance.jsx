import { useEffect, useState } from "react";
import { ArrowRight, Check, Copy, Gem, Snowflake, Wallet } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { fmtUnlockLeft, hap, openWithdrawModal } from "../utils";
import { t } from "../i18n";
import { cn } from "../lib/cn";
import Empty from "../components/Empty";
import { FEATURES } from "../features";
import { HistoryRow, LockedHint, Ring, SkeletonRows, fmtNum, useCountUp } from "../components/MoneyBits";
import BalanceLegacy from "./BalanceLegacy";

// Skin sotishdan tushgan pul Steam trade himoyasi tugaguncha qulfda turadi.
const HOLD_MS = (8 * 24 + 12) * 3600 * 1000;

export default function Balance() {
  // To'ldirish yoqilsa — eski sahifa (to'lov usullari, summa, chek).
  if (FEATURES.topup) return <BalanceLegacy />;
  return <BalanceView />;
}

function Part({ color, label, value, tone, boxed }) {
  return (
    <div className={cn("flex items-center justify-between gap-2 lg:block lg:rounded-2xl lg:px-4 lg:py-3.5", boxed ? "lg:bg-[var(--row-sel)]" : "lg:border lg:border-border")}>
      <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground lg:text-xs">
        <span className="size-2 shrink-0 rounded-[3px]" style={{ background: color }} />
        {label}
      </span>
      <span className={cn("font-heading text-base font-semibold tabular-nums lg:mt-1 lg:block lg:text-2xl", tone)}>
        {fmtNum(value)} {t("common.somWithAmount")}
      </span>
    </div>
  );
}

function BalanceView() {
  const { navigate, user, showToast, openModal, closeModal, refreshMe } = useApp();
  const [hold, setHold] = useState(null);
  const [hist, setHist] = useState(null);
  const [botUsername, setBotUsername] = useState(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const balance = useCountUp(user?.balance ?? 0);

  function loadHold() {
    api("/api/trade-hold-summary").then(setHold).catch(() => setHold({}));
  }
  useEffect(() => {
    if (!user) return;
    loadHold();
    api("/api/balance-history").then(setHist).catch(() => setHist([]));
    api("/api/bot-info").then((r) => setBotUsername(r.username)).catch(() => {});
  }, [user?.id]);

  // Taymer har 30 soniyada yangilanadi; vaqt tugasa qulf ma'lumoti qayta yuklanadi.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const unlockAt = hold?.frozen > 0 && hold?.nextUnlockAt ? new Date(hold.nextUnlockAt).getTime() : null;
  useEffect(() => {
    if (unlockAt && unlockAt <= now) loadHold();
  }, [unlockAt != null && unlockAt <= now]);

  if (!user) {
    return (
      <Empty icon={Wallet} title={t("common.loginRequired")}>
        <button type="button" onClick={() => navigate("login")} className="btn-grad rounded-2xl px-5 py-2.5 text-sm font-semibold">{t("common.login")}</button>
      </Empty>
    );
  }

  const available = hold?.available || 0;
  const frozen = hold?.frozen || 0;
  const pending = hold?.pending || 0;
  const parts = available + frozen + pending;
  const isEmpty = hold && !(user.balance > 0) && parts === 0;
  const refLink = botUsername ? `https://t.me/${botUsername}?start=ref_${user.id}` : "";
  const progress = unlockAt ? 1 - (unlockAt - now) / HOLD_MS : 0;

  function withdraw() {
    openWithdrawModal({ openModal, closeModal, showToast, refreshMe: () => { refreshMe(); loadHold(); } });
  }
  function copyRef() {
    if (!refLink) return;
    navigator.clipboard?.writeText(refLink);
    hap("impact", "light");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const withdrawBtn = available > 0 ? (
    <button type="button" onClick={withdraw} className="btn-grad flex w-full items-center justify-center gap-2 rounded-[14px] px-[26px] py-3.5 text-sm font-semibold lg:w-auto">
      {t("pb.toCard")} <ArrowRight className="size-4" />
    </button>
  ) : (
    <button type="button" disabled className="flex w-full cursor-not-allowed items-center justify-center rounded-[14px] bg-secondary px-[26px] py-3.5 text-[13.5px] font-semibold text-muted-foreground lg:w-auto">
      {unlockAt ? <LockedHint text={t("pb.lockedFor", { t: fmtUnlockLeft(hold.nextUnlockAt, now) })} /> : t("pb.toCard")}
    </button>
  );

  return (
    <div className="stagger space-y-3 lg:space-y-[18px]">
      <div>
        <h1 className="font-heading text-[26px] font-semibold text-[var(--heading)] lg:text-[30px]">{t("balance.titleOnly")}</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground lg:mt-1 lg:text-[13px]">{t("balance.subtitleOnly")}</p>
      </div>

      {isEmpty ? (
        <div className="mx-auto max-w-md rounded-[20px] border border-border bg-card p-6 text-center">
          <span className="mx-auto flex size-[54px] items-center justify-center rounded-[18px] bg-[var(--row-sel)] text-primary"><Gem className="size-6" /></span>
          <p className="mt-3 font-heading text-3xl font-semibold text-[var(--heading)]">0 <span className="text-[15px] text-primary">{t("common.somWithAmount")}</span></p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t("balance.nothingYet")}</p>
          <button type="button" onClick={() => navigate("sell")} className="btn-grad mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-[13px] font-semibold">
            {t("nav.sell")} <ArrowRight className="size-4" />
          </button>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr] lg:gap-3.5">
          {/* Balans kartasi */}
          <div className="grad-card">
            <div className="grad-in relative overflow-hidden p-[18px] lg:px-7 lg:py-[26px]">
              <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-96 rounded-full bg-[var(--orb-a)] blur-[50px]" />
              <div className="relative lg:flex lg:items-end lg:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("profile.currentBalance")}</p>
                  <p className="mt-2 flex items-baseline gap-2">
                    <span className="font-heading text-[42px] font-semibold leading-none tabular-nums text-[var(--heading)] lg:text-[52px]">{fmtNum(balance)}</span>
                    <span className="font-heading text-lg text-primary lg:text-[22px]">{t("common.somWithAmount")}</span>
                  </p>
                </div>
                <div className="hidden lg:block">{withdrawBtn}</div>
              </div>
              {parts > 0 && (
                <div className="relative mt-4 flex h-2 overflow-hidden rounded-full bg-secondary lg:mt-6 lg:h-2.5">
                  <span className="bar-fill bg-grad" style={{ width: `${(available / parts) * 100}%` }} />
                  <span className="bar-fill bar-frozen" style={{ width: `${(frozen / parts) * 100}%` }} />
                  <span className="bar-fill bg-input" style={{ width: `${(pending / parts) * 100}%` }} />
                </div>
              )}
              <div className="relative mt-3.5 flex flex-col gap-2 lg:mt-[18px] lg:grid lg:grid-cols-3 lg:gap-3.5">
                <Part color="var(--primary)" label={t("trade.available")} value={available} tone="text-primary" boxed />
                <Part color="rgba(143,195,232,.6)" label={t("pb.frozen")} value={frozen} tone="text-[var(--heading)]" />
                <Part color="var(--input)" label={t("trade.pending")} value={pending} tone="text-muted-foreground" />
              </div>
              <div className="relative mt-4 lg:hidden">{withdrawBtn}</div>
            </div>
          </div>

          <div className="space-y-3 lg:space-y-3.5">
            {unlockAt && (
              <div className="flex items-center gap-3.5 rounded-[18px] border border-border bg-card px-4 py-3.5 lg:rounded-[20px] lg:px-5 lg:py-[18px]">
                <Ring progress={progress} size={52}><Snowflake className="size-4 text-[#8FC3E8]" /></Ring>
                <div className="min-w-0">
                  <p className="text-[11.5px] text-muted-foreground lg:text-xs">{t("pb.nextUnlock")}</p>
                  <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums text-[var(--heading)] lg:text-[22px]">{fmtUnlockLeft(hold.nextUnlockAt, now)}</p>
                  <p className="mt-0.5 hidden text-[11px] text-muted-foreground lg:block">{t("pb.holdNote")}</p>
                </div>
              </div>
            )}
            {refLink && (
              <div id="referral" className="scroll-mt-20 rounded-[20px] border border-border bg-card px-5 py-[18px]">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("menu.invite")}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">{t("balance.referralDesc")}</p>
                <div className="mt-3 flex gap-2">
                  <div className={cn("min-w-0 flex-1 truncate rounded-[13px] border bg-secondary px-3 py-2.5 text-xs text-foreground transition-colors", copied ? "border-success/40" : "border-border")}>
                    {refLink.replace("https://", "")}
                  </div>
                  <button
                    type="button"
                    onClick={copyRef}
                    className={cn("swap-in flex shrink-0 items-center gap-1.5 rounded-[13px] px-3.5 text-xs font-semibold transition-colors", copied ? "bg-success/12 text-success" : "border border-border text-foreground hover:border-ring/60")}
                    key={copied ? "c" : "n"}
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {t(copied ? "sell.copied" : "pb.copy")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* So'nggi amallar */}
      {(hist === null || hist.length > 0) && (
        <div className="overflow-hidden rounded-[20px] border border-border bg-card">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("pb.recent")}</span>
            <button type="button" onClick={() => navigate("bal-history")} className="text-xs text-primary hover:underline">{t("profile.balHistory")} ›</button>
          </div>
          <div className="border-t border-border">
            {hist === null ? <SkeletonRows n={3} /> : hist.slice(0, 5).map((h, i) => <HistoryRow key={i} h={h} />)}
          </div>
        </div>
      )}
    </div>
  );
}
