import { useEffect, useState } from "react";
import { ArrowRight, Bell, ChevronRight, History, LogOut, Wallet } from "lucide-react";
import { FEATURES } from "../features";
import { api, initData } from "../api";
import { useApp } from "../context";
import { t } from "../i18n";
import { cn } from "../lib/cn";
import Empty from "../components/Empty";
import { SteamLogo, TelegramLogo } from "../components/BrandIcons";
import { StatusTag, fmtDate, fmtNum, useCountUp } from "../components/MoneyBits";
import ProfileLegacy from "./ProfileLegacy";

function Avatar({ user, size }) {
  const initials = (user.name || "?").replace(/^#/, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className={cn("relative block shrink-0 rounded-[18px] bg-grad p-[2px] lg:rounded-3xl", size)}>
      {user.steamAvatar ? (
        <img src={user.steamAvatar} alt="" className="size-full rounded-2xl object-cover lg:rounded-[22px]" />
      ) : (
        <span className="flex size-full items-center justify-center rounded-2xl bg-[#1F1C17] font-heading text-[22px] font-bold text-[#E9D3A0] lg:rounded-[22px] lg:text-3xl">{initials}</span>
      )}
      {user.steamId64 && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success shadow-[0_0_0_3px_var(--background)] lg:size-3" />}
    </span>
  );
}

function Stat({ label, value, unit, gold, className }) {
  return (
    <div className={cn("min-w-0 rounded-2xl border border-border bg-card p-3 lg:rounded-[18px] lg:px-[18px] lg:py-4", className)}>
      <p className="truncate text-[9px] uppercase tracking-[0.08em] text-muted-foreground lg:text-[10px] lg:tracking-[0.16em]">{label}</p>
      <p className={cn("mt-1 whitespace-nowrap font-heading text-xl font-semibold tabular-nums lg:text-[28px]", gold ? "text-primary" : "text-[var(--heading)]")}>
        {value}
        {unit && <span className="ml-1 font-sans text-[11px] font-normal text-muted-foreground lg:text-[13px]">{unit}</span>}
      </p>
    </div>
  );
}

function MenuRow({ icon: Icon, label, badge, extra, onClick, tgStyle }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 border-b border-border px-4 py-[13px] text-left text-[13px] transition-colors last:border-b-0 hover:bg-[var(--row-hov)] active:bg-[var(--row-sel)]">
      <span className={cn("flex size-[34px] shrink-0 items-center justify-center rounded-[11px]", tgStyle ? "bg-[rgba(111,169,210,.1)] text-[#6FA9D2]" : "bg-[var(--row-sel)] text-primary")}>
        <Icon className="size-4" />
      </span>
      <span className="flex-1 text-foreground">{label}</span>
      {extra && <span className="text-[11px] text-muted-foreground">{extra}</span>}
      {badge > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#C9392F] px-[5px] text-[10px] font-bold text-white">{badge}</span>}
      <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
}

export default function Profile() {
  // Auksion/market yoqilsa — eski to'liq profil (stavkalar, yutuqlar, trade link).
  if (FEATURES.auctions || FEATURES.market || FEATURES.trade) return <ProfileLegacy />;
  return <ProfileView />;
}

function ProfileView() {
  const { navigate, user, showToast, tg } = useApp();
  const [mine, setMine] = useState(null);
  const [hold, setHold] = useState(null);
  const [unread, setUnread] = useState(0);
  const [botUsername, setBotUsername] = useState(null);
  const balance = useCountUp(user?.balance ?? 0);

  useEffect(() => {
    if (!user) return;
    api("/api/instant-sell-mine").then(setMine).catch(() => setMine([]));
    api("/api/trade-hold-summary").then(setHold).catch(() => {});
    api("/api/notifications").then((l) => setUnread(l.filter((n) => !n.read).length)).catch(() => {});
    api("/api/bot-info").then((r) => setBotUsername(r.username)).catch(() => {});
  }, [user?.id]);

  if (!user) {
    return (
      <Empty icon={Wallet} title={t("common.loginRequired")}>
        <button type="button" onClick={() => navigate("login")} className="btn-grad rounded-2xl px-5 py-2.5 text-sm font-semibold">
          {t("common.login")}
        </button>
      </Empty>
    );
  }

  const credited = (mine || []).filter((r) => r.status === "credited");
  const soldSkins = credited.reduce((n, r) => n + (r.items?.length || 0), 0);
  const paid = credited.reduce((n, r) => n + (r.totalSom || 0), 0);
  const waiting = (mine || []).filter((r) => r.status === "awaiting_admin").length;

  async function connectSteam() {
    try {
      const r = await api("/api/steam-login-url");
      if (tg?.openLink) tg.openLink(r.url);
      else window.open(r.url, "_blank");
    } catch (e) {
      showToast(e.error || t("common.genericError"), "err");
    }
  }
  function openTg() {
    const url = botUsername ? `https://t.me/${botUsername}` : "https://t.me";
    if (tg?.openTelegramLink && botUsername) tg.openTelegramLink(url);
    else window.open(url, "_blank", "noopener");
  }
  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); } catch {}
    location.href = "/";
  }

  const steamTag = user.steamId64 ? (
    <span className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-success/12 px-2 py-[3px] text-[10px] font-semibold text-success">● {t("menu.steamOn")}</span>
      {user.steamUsername && <span className="text-[11px] text-muted-foreground lg:text-xs">{user.steamUsername}</span>}
    </span>
  ) : (
    <button type="button" onClick={connectSteam} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-primary/40 bg-[var(--row-sel)] px-2.5 py-1 text-[11px] font-semibold text-primary">
      <SteamLogo className="size-3" /> {t("pb.steamConnect")}
    </button>
  );

  const menu = (
    <div className="overflow-hidden rounded-[20px] border border-border bg-card">
      <MenuRow icon={History} label={t("profile.balHistory")} onClick={() => navigate("bal-history")} />
      <MenuRow icon={Bell} label={t("profile.notifications")} badge={unread} onClick={() => navigate("notifications")} />
      <MenuRow icon={TelegramLogo} label={t("menu.tgHelp")} extra={botUsername ? `@${botUsername}` : null} onClick={openTg} tgStyle />
    </div>
  );

  return (
    <div className="stagger space-y-3 lg:space-y-[18px]">
      {/* Bosh karta */}
      <div className="grad-card">
        <div className="grad-in relative flex items-center gap-3.5 overflow-hidden p-4 lg:gap-[22px] lg:px-7 lg:py-[26px]">
          <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-[420px] rounded-full bg-[var(--orb-a)] blur-[50px]" />
          <Avatar user={user} size="size-[60px] lg:size-[84px]" />
          <div className="relative min-w-0 flex-1">
            <p className="hidden text-[10px] uppercase tracking-[0.16em] text-muted-foreground lg:block">{t("profile.title")}</p>
            <h1 className="truncate font-heading text-[22px] font-semibold leading-tight text-[var(--heading)] lg:mt-1 lg:text-[32px]">{user.name}</h1>
            <div className="mt-1.5 lg:mt-2">{steamTag}</div>
          </div>
          <div className="relative hidden text-right lg:block">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("profile.currentBalance")}</p>
            <p className="mt-1 font-heading text-[40px] font-semibold leading-none tabular-nums text-[var(--heading)]">
              {fmtNum(balance)} <span className="text-lg text-primary">{t("common.somWithAmount")}</span>
            </p>
            <button type="button" onClick={() => navigate("balance")} className="btn-grad mt-3 inline-flex items-center gap-2 rounded-[14px] px-5 py-[11px] text-[13px] font-semibold">
              {t("pb.toBalance")} <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Telefon: balans kartasi */}
      <div className="relative overflow-hidden rounded-[22px] border border-border bg-card p-[18px] lg:hidden">
        <div className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-[var(--orb-a)] blur-[40px]" />
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("profile.currentBalance")}</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="font-heading text-[38px] font-semibold leading-none tabular-nums text-[var(--heading)]">{fmtNum(balance)}</span>
          <span className="font-heading text-[17px] text-primary">{t("common.somWithAmount")}</span>
        </p>
        {hold && (hold.available > 0 || hold.frozen > 0) && (
          <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px]">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-[3px] bg-primary" /><span className="text-muted-foreground">{t("pb.short.available")}</span><span className="tabular-nums text-[var(--heading)]">{fmtNum(hold.available)}</span></span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-[3px] bg-[rgba(143,195,232,.6)]" /><span className="text-muted-foreground">{t("pb.short.frozen")}</span><span className="tabular-nums text-[var(--heading)]">{fmtNum(hold.frozen)}</span></span>
          </div>
        )}
        <button type="button" onClick={() => navigate("balance")} className="btn-grad mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] py-[13px] text-[13.5px] font-semibold">
          {t("pb.toBalance")} <ArrowRight className="size-4" />
        </button>
      </div>

      {/* Statistika */}
      <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2 lg:grid-cols-4 lg:gap-3.5">
        <Stat label={<><span className="lg:hidden">{t("pb.soldShort")}</span><span className="hidden lg:inline">{t("pb.sold")}</span></>} value={mine ? soldSkins : "—"} unit={t("pb.skinUnit")} />
        <Stat label={t("pb.paid")} value={mine ? fmtNum(paid) : "—"} unit={<span className="hidden lg:inline">{t("common.somWithAmount")}</span>} />
        <Stat label={<><span className="lg:hidden">{t("pb.waitingShort")}</span><span className="hidden lg:inline">{t("pb.waiting")}</span></>} value={mine ? waiting : "—"} gold />
        <Stat label={t("pb.requests")} value={mine ? mine.length : "—"} className="hidden lg:block" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr] lg:gap-3.5">
        {/* So'rovlar */}
        <div className="order-2 overflow-hidden rounded-[20px] border border-border bg-card lg:order-1">
          <div className="flex items-center justify-between px-5 pb-3 pt-4">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("pb.myRequests")}</span>
            <button type="button" onClick={() => navigate("sell")} className="text-xs text-primary hover:underline">{t("pb.sellMore")} ›</button>
          </div>
          {mine === null ? (
            <div className="space-y-2 px-5 pb-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-9 rounded-lg" />)}</div>
          ) : mine.length === 0 ? (
            <p className="border-t border-border px-5 py-6 text-center text-sm text-muted-foreground">{t("pb.noRequests")}</p>
          ) : (
            <div className="border-t border-border">
              <div className="hidden gap-4 border-b border-border px-5 py-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground lg:flex">
                <span className="w-[70px]">{t("pb.col.req")}</span><span className="flex-1">{t("pb.col.skins")}</span><span className="w-[130px]">{t("pb.col.date")}</span>
                <span className="w-[110px] text-right">{t("pb.col.sum")}</span><span className="w-[120px] text-right">{t("pb.col.status")}</span>
              </div>
              {mine.slice(0, 6).map((r) => {
                const first = r.items?.[0]?.name || "—";
                const more = (r.items?.length || 1) - 1;
                return (
                  <div key={r.id} className="flex items-center gap-3 border-b border-border px-5 py-3 text-[13px] last:border-b-0 lg:gap-4">
                    <span className="w-12 shrink-0 tabular-nums text-muted-foreground lg:w-[70px]">#{r.id}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{first}{more > 0 ? `, +${more}` : ""}</span>
                      <span className="block text-[11px] text-muted-foreground lg:hidden">{fmtDate(r.createdAt)}</span>
                    </span>
                    <span className="hidden w-[130px] shrink-0 text-muted-foreground lg:block">{fmtDate(r.createdAt)}</span>
                    <span className="flex shrink-0 flex-col items-end gap-1 lg:contents">
                      <span className={cn("font-heading text-[15px] font-semibold tabular-nums lg:w-[110px] lg:text-right", r.status === "rejected" ? "text-muted-foreground" : "text-[var(--heading)]")}>{fmtNum(r.totalSom)}</span>
                      <span className="lg:flex lg:w-[120px] lg:justify-end"><StatusTag status={r.status} /></span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Menyu */}
        <div className="order-1 space-y-3.5 lg:order-2">
          {menu}
          {!initData && (
            <button type="button" onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-border py-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-destructive">
              <LogOut className="size-4" />
              {t("profile.logout")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
