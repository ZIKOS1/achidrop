import { useEffect, useState } from "react";
import { Check, Copy, ShieldCheck, Wallet, Gift, Snowflake, Timer } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { fmtMoney, fmtUnlockLeft, openWithdrawModal } from "../utils";
import { t } from "../i18n";
import Empty from "../components/Empty";
import { TelegramLogo } from "../components/BrandIcons";
import { FEATURES } from "../features";

const presets = [500_000, 1_000_000, 2_000_000, 5_000_000];
const METHOD_ACCENT = {
  payme: "oklch(0.62 0.19 200)",
  click: "oklch(0.7 0.16 150)",
  paynet: "oklch(0.68 0.19 45)",
  uzumbank: "oklch(0.6 0.2 300)",
};

// Eng yaqin muzlatilgan summa ochilishigacha jonli taymer (har 30 soniyada
// yangilanadi, vaqt tugasa hold ma'lumoti qayta yuklanadi).
function UnlockTimer({ iso, onDone }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const left = new Date(iso).getTime() - now;
  useEffect(() => {
    if (left <= 0) onDone?.();
  }, [left <= 0]);
  return (
    <div className="flex items-center justify-between gap-3 border border-accent/40 bg-accent/10 px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Timer className="size-3.5 text-accent" />
        {t("balance.unlockTimer")}
      </span>
      <span className="font-heading text-sm font-bold text-accent">{fmtUnlockLeft(iso, now)}</span>
    </div>
  );
}

export default function Balance() {
  const { navigate, user, tg, showToast, openModal, closeModal, refreshMe } = useApp();
  const [cards, setCards] = useState(null);
  const [method, setMethod] = useState(null);
  const [amount, setAmount] = useState(1_000_000);
  const [copied, setCopied] = useState(false);
  const [refLink, setRefLink] = useState("");
  const [botUsername, setBotUsername] = useState(null);
  const [hold, setHold] = useState(null);

  function loadHold() {
    api("/api/trade-hold-summary").then(setHold).catch(() => {});
  }

  useEffect(() => {
    api("/api/payment-cards").then(setCards).catch(() => {});
    api("/api/bot-info").then((r) => setBotUsername(r.username)).catch(() => {});
    loadHold();
  }, []);

  function withdraw() {
    openWithdrawModal({ openModal, closeModal, showToast, refreshMe: () => { refreshMe(); loadHold(); } });
  }

  useEffect(() => {
    if (!user || !botUsername) return;
    setRefLink(`https://t.me/${botUsername}?start=ref_${user.id}`);
  }, [user, botUsername]);

  if (!user) {
    return (
      <Empty icon={Wallet} title={t("common.loginRequired")}>
        <button
          type="button"
          onClick={() => navigate("login")}
          className="bg-primary px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("common.login")}
        </button>
      </Empty>
    );
  }

  const selected = cards && method ? cards[method] : null;

  function copyAccount() {
    if (!selected) return;
    navigator.clipboard?.writeText(selected.card);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function openBot() {
    const url = `https://t.me/${botUsername}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, "_blank");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">{t(FEATURES.topup ? "balance.title" : "balance.titleOnly")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t(FEATURES.topup ? "balance.subtitle" : "balance.subtitleOnly")}</p>
      </div>

      <div className={"grid grid-cols-1 gap-6 " + (FEATURES.topup ? "lg:grid-cols-3" : "max-w-xl")}>
        {/* To'ldirish (features.js'da o'chirilishi mumkin) — pul yechish va
            muzlatilgan mablag' bloki har doim qoladi (Skin sotish puli). */}
        {FEATURES.topup && <div className="space-y-6 lg:col-span-2">
          <section className="border border-border bg-card p-5 shadow-panel">
            <SectionTitle step={1} title={t("balance.step1")} />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {cards && Object.entries(cards).map(([key, m]) => {
                const active = method === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMethod(key)}
                    className={"hover-lift relative flex flex-col items-center gap-2 border-2 bg-secondary/50 p-4 transition-all " + (active ? "border-primary" : "border-transparent hover:border-border")}
                    style={active ? { boxShadow: `0 0 28px -8px ${METHOD_ACCENT[key]}` } : undefined}
                  >
                    {active && (
                      <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center bg-primary text-primary-foreground">
                        <Check className="size-3.5" />
                      </span>
                    )}
                    <span className="flex size-11 items-center justify-center font-heading text-lg font-bold text-white shadow-panel clip-tactical" style={{ backgroundColor: METHOD_ACCENT[key] }}>
                      {m.name?.[0]?.toUpperCase()}
                    </span>
                    <span className="font-heading text-sm font-bold text-foreground">{m.name}</span>
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className="mt-4 flex items-center justify-between border border-border bg-secondary/40 px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{selected.name} {t("balance.cardNumber")}</p>
                  <p className="font-heading text-base font-bold tracking-wider text-foreground">{selected.card}</p>
                  <p className="text-xs text-muted-foreground">{selected.owner}</p>
                </div>
                <button
                  type="button"
                  onClick={copyAccount}
                  className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-accent"
                >
                  <Copy className="size-3.5" />
                  {copied ? t("balance.copied") : t("balance.copy")}
                </button>
              </div>
            )}
          </section>

          <section className="border border-border bg-card p-5 shadow-panel">
            <SectionTitle step={2} title={t("balance.step2")} />
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(p)}
                  className={"border px-2 py-2.5 font-heading text-sm font-bold transition-all duration-200 " + (amount === p ? "border-primary bg-primary/10 text-primary shadow-[0_0_20px_-8px_color-mix(in_oklch,var(--primary)_60%,transparent)]" : "border-border text-muted-foreground hover:-translate-y-0.5 hover:text-foreground")}
                >
                  {fmtMoney(p)}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">{t("balance.customAmount")}</label>
              <input
                type="number"
                value={amount}
                min={0}
                step={50_000}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="mt-1 w-full border border-border bg-secondary px-3 py-2.5 font-heading text-lg font-bold text-foreground outline-none focus:border-primary"
              />
            </div>
          </section>

          <section className="border border-border bg-card p-5 shadow-panel">
            <SectionTitle step={3} title={t("balance.step3")} />
            <p className="mt-2 text-sm text-muted-foreground">
              {t("balance.step3Desc", { amount: fmtMoney(amount) })}
            </p>
            <button
              type="button"
              disabled={!method || !botUsername}
              onClick={openBot}
              className="mt-4 flex w-full items-center justify-center gap-2 bg-primary py-3 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-[0_10px_28px_-10px_color-mix(in_oklch,var(--primary)_75%,transparent)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <TelegramLogo className="size-4" />
              {t("balance.goToBot")}
            </button>
          </section>
        </div>}

        <div className="space-y-6">
          {!FEATURES.topup && (
            <div className="border border-border bg-card p-5 shadow-panel-lg">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Wallet className="size-4 text-primary" />
                {t("profile.currentBalance")}
              </p>
              <p className="mt-2 font-heading text-3xl font-bold text-foreground">{fmtMoney(user.balance ?? 0)}</p>
              {!(hold && (hold.frozen > 0 || hold.available > 0 || hold.pending > 0)) && (
                <p className="mt-2 text-xs text-muted-foreground">{t("balance.nothingYet")}</p>
              )}
            </div>
          )}
          {FEATURES.topup && <div className="border border-border bg-card p-5 shadow-panel-lg">
            <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">{t("balance.summary")}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label={t("balance.method")} value={selected?.name ?? t("balance.notSelected")} />
              <Row label={t("balance.amount")} value={fmtMoney(amount)} highlight />
              <div className="border-t border-border pt-3">
                <Row label={t("balance.total")} value={fmtMoney(amount)} bold />
              </div>
            </dl>
            <div className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
              <p>{t("balance.securityNote")}</p>
            </div>
          </div>}

          {hold && (hold.frozen > 0 || hold.available > 0 || hold.pending > 0) && (
            <div className="border border-border bg-card p-5 shadow-panel">
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide text-foreground">
                <Snowflake className="size-4 text-accent" />
                {t("trade.frozenFunds")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("trade.frozenFundsDesc")}</p>
              <dl className="mt-3 space-y-2 text-sm">
                {hold.frozen > 0 && <Row label={t("trade.frozen")} value={fmtMoney(hold.frozen)} />}
                {hold.frozen > 0 && hold.nextUnlockAt && <UnlockTimer iso={hold.nextUnlockAt} onDone={loadHold} />}
                {hold.available > 0 && <Row label={t("trade.available")} value={fmtMoney(hold.available)} highlight />}
                {hold.pending > 0 && <Row label={t("trade.pending")} value={fmtMoney(hold.pending)} />}
              </dl>
              {hold.available > 0 && (
                <button
                  type="button"
                  onClick={withdraw}
                  className="mt-3 flex w-full items-center justify-center gap-2 bg-primary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t("trade.withdraw")}
                </button>
              )}
            </div>
          )}

          {refLink && (
            <div className="border border-border bg-card p-5 shadow-panel">
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide text-foreground">
                <Gift className="size-4 text-accent" />
                {t("balance.referral")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("balance.referralDesc")}</p>
              <div className="mt-3 break-all border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground">{refLink}</div>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(refLink)}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 border border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-accent"
              >
                <Copy className="size-3.5" />
                {t("balance.copyLink")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ step, title }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-7 items-center justify-center bg-primary/15 font-heading text-sm font-bold text-primary shadow-[0_0_14px_-4px_color-mix(in_oklch,var(--primary)_60%,transparent)]">{step}</span>
      <h2 className="font-heading text-base font-bold uppercase tracking-wide text-foreground">{title}</h2>
    </div>
  );
}

function Row({ label, value, highlight, bold }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={"font-heading font-bold " + (highlight || bold ? "text-primary" : "text-foreground") + (bold ? " text-xl text-glow-primary" : "")}>{value}</dd>
    </div>
  );
}
