import { useState } from "react";
import { Gavel, ShieldCheck, Wallet } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import { SteamLogo } from "../components/BrandIcons";

export default function Login() {
  const [steamLoading, setSteamLoading] = useState(false);
  const [error, setError] = useState("");

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
        <div className="relative space-y-6">
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-foreground">
              <span className="text-[var(--logo-a)]">Achi</span><span className="text-[var(--logo-b)]">Drop</span>
            </h1>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t("auctions.heroTitle1")} {t("auctions.heroTitleAccent")} {t("auctions.heroTitle2")} — {t("nav.headerSlogan")}
            </p>
          </div>
          <ul className="space-y-3 text-sm text-foreground">
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center bg-primary/15 text-primary shadow-panel"><Gavel className="size-4" /></span>
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
          <span className="text-[var(--logo-a)]">Achi</span><span className="text-[var(--logo-b)]">Drop</span>{t("login.welcome")}
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">{t("login.subtitle")}</p>

        <div className="w-full space-y-4">
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
