import { useEffect, useState } from "react";
import { FEATURES } from "../features";
import {
  Plus,
  Link2,
  CheckCircle2,
  Trophy,
  Gavel,
  Wallet,
  Save,
  BarChart3,
  CreditCard,
  Bell,
  LogOut,
} from "lucide-react";
import { api, initData } from "../api";
import { useApp } from "../context";
import { fmtMoney, imgSrc } from "../utils";
import { t } from "../i18n";
import Empty from "../components/Empty";
import { SteamLogo } from "../components/BrandIcons";

export default function Profile() {
  const { navigate, user, setUser, showToast, tg } = useApp();
  const [tradeLink, setTradeLink] = useState(user?.tradeLink || "");
  const [saving, setSaving] = useState(false);
  const [activeBids, setActiveBids] = useState(null);
  const [wins, setWins] = useState(null);

  useEffect(() => {
    if (!user) return;
    api("/api/auctions")
      .then((list) => setActiveBids(list.filter((a) => a.lastBidder === user.id).slice(0, 5)))
      .catch(() => setActiveBids([]));
    api("/api/inventory").then(setWins).catch(() => setWins([]));
  }, [user?.id]);

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

  const initials = user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  async function saveTradeLink() {
    const link = tradeLink.trim();
    if (link && !link.startsWith("https://steamcommunity.com/tradeoffer/new/")) {
      showToast(t("profile.invalidLinkFormat"), "err");
      return;
    }
    setSaving(true);
    try {
      await api("/api/trade-link", { method: "POST", body: JSON.stringify({ tradeLink: link || null }) });
      setUser((u) => (u ? { ...u, tradeLink: link || null } : u));
      showToast(t("profile.tradeLinkSaved"), "ok");
    } catch (e) {
      showToast(e.error || t("common.genericError"), "err");
    } finally {
      setSaving(false);
    }
  }

  async function connectSteam() {
    try {
      const r = await api("/api/steam-login-url");
      if (tg?.openLink) tg.openLink(r.url);
      else window.open(r.url, "_blank");
    } catch (e) {
      showToast(e.error || t("common.genericError"), "err");
    }
  }

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); } catch {}
    location.href = "/";
  }

  const wonAuctions = (wins || []).slice(-5).reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {user.steamAvatar ? (
          <img src={user.steamAvatar} alt={user.name} className="size-14 shrink-0 border border-border shadow-panel clip-tactical object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center bg-accent/20 font-heading text-xl font-bold text-accent shadow-panel clip-tactical">
            {initials}
          </span>
        )}
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">{t("profile.title")}</h1>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            {user.name}
            {user.steamUsername && (
              <span className="inline-flex items-center gap-1">
                · <SteamLogo className="size-3.5" /> {user.steamUsername}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          <div className="corner-brackets surface-grid relative overflow-hidden border border-border bg-[linear-gradient(120deg,var(--hero-a),var(--hero-b))] p-6 shadow-panel-lg sm:p-8">
            <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_80%_30%,color-mix(in_oklch,var(--primary)_20%,transparent),transparent_60%)]" />
            <div className="absolute bottom-0 left-0 h-2/3 w-1/3 bg-[radial-gradient(circle_at_10%_100%,color-mix(in_oklch,var(--accent)_14%,transparent),transparent_65%)]" />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <Wallet className="size-4 text-primary" />
                  {t("profile.currentBalance")}
                </p>
                <p className="mt-2 font-heading text-4xl font-bold tracking-tight text-foreground text-glow-primary sm:text-5xl">{fmtMoney(user.balance ?? 0)}</p>
              </div>
              <button
                type="button"
                onClick={() => navigate("balance")}
                className="inline-flex items-center justify-center gap-2 bg-primary px-5 py-3 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-[0_10px_28px_-10px_color-mix(in_oklch,var(--primary)_75%,transparent)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90"
              >
                <Plus className="size-4" />
                {t(FEATURES.topup ? "profile.topUp" : "nav.balanceOnly")}
              </button>
            </div>
          </div>

          <div className="border border-border bg-card shadow-panel">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">{t("profile.links")}</h2>
            </div>
            <div className="divide-y divide-border">
              {[
                { icon: BarChart3, labelKey: "profile.bidHistory", page: "bid-history" },
                { icon: CreditCard, labelKey: "profile.balHistory", page: "bal-history" },
                { icon: Trophy, labelKey: "profile.leaderboard", page: "leaderboard" },
                { icon: Bell, labelKey: "profile.notifications", page: "notifications" },
              ].map((l) => {
                const Icon = l.icon;
                return (
                  <button
                    key={l.page}
                    type="button"
                    onClick={() => navigate(l.page)}
                    className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center bg-accent/10 text-accent transition-colors group-hover:bg-accent/20">
                      <Icon className="size-4" />
                    </span>
                    <span className="flex-1 text-sm font-medium text-foreground">{t(l.labelKey)}</span>
                    <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent">›</span>
                  </button>
                );
              })}
            </div>
          </div>

          {!initData && (
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 border border-border bg-secondary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-destructive"
            >
              <LogOut className="size-4" />
              {t("profile.logout")}
            </button>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <div className="border border-border bg-card p-5 shadow-panel">
            <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide text-foreground">
              <Link2 className="size-4 text-accent" />
              {t("profile.tradeLink")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("profile.tradeLinkDesc")}</p>
            <textarea
              value={tradeLink}
              onChange={(e) => setTradeLink(e.target.value)}
              rows={3}
              className="mt-3 w-full resize-none border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              placeholder="https://steamcommunity.com/tradeoffer/new/?partner=..."
            />
            <div className="mt-2 flex items-center justify-between">
              <span className={"inline-flex items-center gap-1 text-xs font-semibold " + (user.tradeLink ? "text-success" : "text-muted-foreground")}>
                <CheckCircle2 className="size-4" />
                {user.tradeLink ? t("profile.confirmed") : t("profile.notSet")}
              </span>
              <button
                type="button"
                onClick={saveTradeLink}
                disabled={saving}
                className="inline-flex items-center gap-1.5 bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-accent-foreground transition-colors hover:opacity-90 disabled:opacity-50"
              >
                <Save className="size-3.5" />
                {saving ? "..." : t("common.save")}
              </button>
            </div>
          </div>

          <div className="border border-border bg-card p-5 shadow-panel">
            <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide text-foreground">
              <SteamLogo className="size-4 text-accent" />
              {t("profile.steamAccount")}
            </h2>
            <div className="mt-3 flex items-center justify-between">
              <span className={"inline-flex items-center gap-1.5 text-xs font-semibold " + (user.steamId64 ? "text-success" : "text-muted-foreground")}>
                {user.steamId64 && <CheckCircle2 className="size-3.5" />}
                {user.steamId64 ? t("profile.connected") : t("profile.notConnected")}
              </span>
              {!user.steamId64 && (
                <button
                  type="button"
                  onClick={connectSteam}
                  className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-accent"
                >
                  {t("profile.connect")}
                </button>
              )}
            </div>
          </div>

          <div className="border border-border bg-card shadow-panel">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Gavel className="size-4 text-primary" />
              <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">{t("profile.activeBids")}</h2>
            </div>
            {activeBids === null ? (
              <div className="p-4 text-xs text-muted-foreground">{t("common.loading")}</div>
            ) : activeBids.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">{t("profile.noActiveBids")}</div>
            ) : (
              <ul className="divide-y divide-border">
                {activeBids.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => navigate("auction-detail", a.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
                    >
                      <div className="relative size-12 shrink-0 overflow-hidden bg-secondary">
                        {a.image && <img src={imgSrc(a.image)} alt={a.name} className="size-full object-contain p-1" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                        <p className="font-heading text-sm font-bold text-primary">{fmtMoney(a.price)}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-border bg-card shadow-panel">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Trophy className="size-4 text-warning" />
              <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">{t("profile.wonSkins")}</h2>
            </div>
            {wins === null ? (
              <div className="p-4 text-xs text-muted-foreground">{t("common.loading")}</div>
            ) : wonAuctions.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">{t("profile.noWinsYet")}</div>
            ) : (
              <ul className="divide-y divide-border">
                {wonAuctions.map((w, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{w.lotName}</p>
                      <p className="text-xs text-muted-foreground">{fmtMoney(w.price)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
