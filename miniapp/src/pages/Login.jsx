import { useEffect, useState } from "react";
import { Crosshair, KeyRound, Gavel, ShieldCheck, Wallet } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { t } from "../i18n";
import { TelegramLogo, SteamLogo } from "../components/BrandIcons";

function remaining(expiresAt) {
  const total = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Login() {
  const { navigate, refreshMe } = useApp();
  const [steamLoading, setSteamLoading] = useState(false);
  const [tgLoading, setTgLoading] = useState(false);
  const [botUrl, setBotUrl] = useState(null);
  const [nonce, setNonce] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!expiresAt) return;
    setTimeLeft(remaining(expiresAt));
    const i = setInterval(() => setTimeLeft(remaining(expiresAt)), 1000);
    return () => clearInterval(i);
  }, [expiresAt]);

  const expired = expiresAt != null && Date.now() >= expiresAt;

  async function startTelegramLogin() {
    setTgLoading(true);
    setError("");
    setCode("");
    try {
      const r = await api("/api/auth/telegram-login/start", { method: "POST" });
      setNonce(r.nonce);
      setBotUrl(r.botUrl);
      setExpiresAt(r.expiresAt);
      window.open(r.botUrl, "_blank");
    } catch (e) {
      setError(e.error || t("login.error"));
    } finally {
      setTgLoading(false);
    }
  }

  async function verifyCode() {
    if (!code.trim()) return;
    setVerifying(true);
    setError("");
    try {
      await api("/api/auth/telegram-login/verify", { method: "POST", body: JSON.stringify({ nonce, code: code.trim() }) });
      await refreshMe();
      navigate("auctions");
    } catch (e) {
      setError(e.error || t("login.codeError"));
    } finally {
      setVerifying(false);
    }
  }

  async function loginWithSteam() {
    setSteamLoading(true);
    setError("");
    try {
      const r = await api("/api/auth/steam-login-url");
      window.location.href = r.url;
    } catch (e) {
      setError(e.error || t("login.error"));
      setSteamLoading(false);
    }
  }

  return (
    <div className="animate-fade-up mx-auto grid max-w-4xl overflow-hidden border border-border bg-card shadow-panel-lg lg:grid-cols-2">
      {/* Brand panel */}
      <div className="corner-brackets surface-grid relative hidden flex-col justify-center gap-6 overflow-hidden bg-[linear-gradient(160deg,var(--hero-a)_0%,var(--hero-b)_60%)] p-10 lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_60%)]" />
        <div className="absolute bottom-0 right-0 h-2/3 w-2/3 bg-[radial-gradient(circle_at_90%_100%,color-mix(in_oklch,var(--accent)_16%,transparent),transparent_65%)]" />
        <div className="relative space-y-6">
          <span className="flex size-14 items-center justify-center bg-primary text-primary-foreground shadow-[0_0_36px_-6px_color-mix(in_oklch,var(--primary)_70%,transparent)] clip-tactical">
            <Crosshair className="size-7" strokeWidth={2.5} />
          </span>
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-foreground">
              Ziko<span className="text-primary text-glow-primary">Auction</span>
            </h1>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t("auctions.heroTitle1")} {t("auctions.heroTitleAccent")} {t("auctions.heroTitle2")} — {t("nav.headerSlogan")}
            </p>
          </div>
          <ul className="space-y-3 text-sm text-foreground">
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center bg-primary/15 text-primary shadow-[0_0_16px_-4px_color-mix(in_oklch,var(--primary)_60%,transparent)]"><Gavel className="size-4" /></span>
              {t("login.feature1")}
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center bg-accent/15 text-accent shadow-[0_0_16px_-4px_color-mix(in_oklch,var(--accent)_60%,transparent)]"><Wallet className="size-4" /></span>
              {t("login.feature2")}
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center bg-success/15 text-success shadow-[0_0_16px_-4px_color-mix(in_oklch,var(--success)_60%,transparent)]"><ShieldCheck className="size-4" /></span>
              {t("login.feature3")}
            </li>
          </ul>
        </div>
      </div>

      {/* Auth panel */}
      <div className="flex flex-col justify-center gap-1 p-8 sm:p-10">
        <h2 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground lg:hidden">
          Ziko<span className="text-primary">Auction</span>{t("login.welcome")}
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">{t("login.subtitle")}</p>

        <div className="w-full space-y-4">
        {!botUrl ? (
          <button
            type="button"
            disabled={tgLoading}
            onClick={startTelegramLogin}
            className="flex w-full items-center justify-center gap-2 bg-[#2AABEE] py-3 font-heading text-sm font-bold uppercase tracking-wide text-white shadow-[0_10px_24px_-10px_#2AABEEaa] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2AABEE]/90 disabled:translate-y-0 disabled:opacity-50"
          >
            <TelegramLogo className="size-4" />
            {tgLoading ? "..." : t("login.telegram")}
          </button>
        ) : (
          <div className="animate-fade-up space-y-3 border border-border bg-card p-4 text-left shadow-panel">
            <p className="text-sm text-foreground">
              <span className="font-heading font-bold text-primary">1.</span> {t("login.step1")}
            </p>
            <a
              href={botUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 border border-accent/40 bg-accent/10 py-2 font-heading text-xs font-bold uppercase tracking-wide text-accent transition-colors hover:bg-accent/20"
            >
              <TelegramLogo className="size-3.5" />
              {t("login.reopenBot")}
            </a>
            <div className="flex items-center justify-between">
              <p className="text-sm text-foreground">
                <span className="font-heading font-bold text-primary">2.</span> {t("login.step2")}
              </p>
              <span className={"font-heading text-sm font-bold tabular-nums " + (expired ? "text-destructive" : "text-accent")}>
                {expired ? t("login.expiredShort") : timeLeft}
              </span>
            </div>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                disabled={expired}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full border border-border bg-secondary px-3 py-2.5 text-center font-heading text-lg font-bold tracking-[0.3em] text-foreground outline-none focus:border-primary disabled:opacity-40"
              />
              <button
                type="button"
                disabled={verifying || expired || code.length < 6}
                onClick={verifyCode}
                aria-label={t("login.step2")}
                className="flex w-14 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                <KeyRound className="size-5" />
              </button>
            </div>
            {expired && (
              <p className="text-xs text-destructive">{t("login.codeExpired")}</p>
            )}
            <button
              type="button"
              onClick={startTelegramLogin}
              className="w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("login.resend")}
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {t("login.or")}
          <span className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          disabled={steamLoading}
          onClick={loginWithSteam}
          className="flex w-full items-center justify-center gap-2 border border-border bg-secondary py-3 font-heading text-sm font-bold uppercase tracking-wide text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-secondary/70 disabled:translate-y-0 disabled:opacity-50"
        >
          <SteamLogo className="size-4" />
          {steamLoading ? "..." : t("login.steam")}
        </button>

        {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
