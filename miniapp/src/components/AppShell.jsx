import { useCallback, useEffect, useState } from "react";
import {
  Gavel,
  Wallet,
  CreditCard,
  Package,
  Repeat,
  ShoppingBag,
  X,
  LogIn,
  Sun,
  Moon,
  Banknote,
  User,
  ListChecks,
  History,
  Bell,
  Gift,
  HelpCircle,
  MessageCircleQuestion,
  ChevronRight,
} from "lucide-react";
import { cn } from "../lib/cn";
import { useApp } from "../context";
import { LANGS, t } from "../i18n";
import { api } from "../api";
import { fmtMoney, openWithdrawModal } from "../utils";
import { TelegramLogo } from "./BrandIcons";
import { FEATURES } from "../features";

const HOME = FEATURES.auctions ? "auctions" : "sell";

// Menyu bo'limlari. `feature` — features.js'da o'chirilgan bo'lsa ko'rinmaydi.
// `section` — sahifa ochilgach shu id'li blokka aylantiriladi.
// `badge` — "requests" (admin kutayotgan so'rovlar) yoki "notif" (o'qilmagan xabarlar).
const SECTIONS = [
  {
    key: "main",
    items: [
      { key: "sell", labelKey: "nav.sell", icon: Banknote, group: ["sell"] },
      { key: "auctions", labelKey: "nav.auctions", icon: Gavel, group: ["auctions", "auction-detail", "leaderboard"], feature: "auctions" },
      { key: "inventory", labelKey: "nav.inventory", icon: Package, group: ["inventory"], feature: "inventory" },
      { key: "trade", labelKey: "nav.trade", icon: Repeat, group: ["trade", "trade-detail"], feature: "trade" },
      { key: "market", labelKey: "nav.market", icon: ShoppingBag, group: ["market", "market-sell", "market-detail"], feature: "market" },
      { key: "profile", labelKey: "nav.profile", icon: User, group: ["profile"] },
      { key: "balance", labelKey: FEATURES.topup ? "nav.balance" : "nav.balanceOnly", icon: CreditCard, group: ["balance"] },
    ],
  },
  {
    key: "account",
    auth: true,
    items: [
      { key: "requests", page: "sell", section: "my-requests", labelKey: "menu.requests", icon: ListChecks, badge: "requests" },
      { key: "bal-history", labelKey: "profile.balHistory", icon: History, group: ["bal-history"] },
      { key: "notifications", labelKey: "profile.notifications", icon: Bell, group: ["notifications"], badge: "notif" },
      { key: "invite", page: "balance", section: "referral", labelKey: "menu.invite", icon: Gift, pill: "menu.bonus" },
    ],
  },
  {
    key: "help",
    items: [
      { key: "how", page: "sell", section: "how", labelKey: "menu.how", icon: HelpCircle },
      { key: "faq", page: "sell", section: "faq", labelKey: "menu.faq", icon: MessageCircleQuestion },
      { key: "tg", labelKey: "menu.tgHelp", icon: TelegramLogo, external: true },
    ],
  },
].map((s) => ({ ...s, items: s.items.filter((i) => !i.feature || FEATURES[i.feature]) }));

function Brand({ onClick, compact }) {
  return (
    <button type="button" onClick={onClick} className="flex min-w-0 items-center gap-2.5">
      <span className="flex min-w-0 flex-col items-start leading-none">
        <span className={cn("truncate font-heading font-bold uppercase tracking-wider", compact ? "text-[19px]" : "text-[22px]")}>
          <span className="text-[var(--heading)]">Achi</span><span className="text-grad">Drop</span>
        </span>
        {!compact && (
          <span className="mt-1 truncate text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {t("nav.tagline")}
          </span>
        )}
      </span>
    </button>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <div className="flex rounded-xl border border-border bg-card p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-center gap-1 rounded-[9px] px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
            value === o.value ? "bg-[var(--row-sel)] text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LangSeg({ lang, setLang }) {
  return <Seg value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l.code, label: l.label }))} />;
}

function ThemeSeg({ theme, toggleTheme }) {
  return (
    <Seg
      value={theme}
      onChange={(v) => v !== theme && toggleTheme()}
      options={[
        { value: "dark", label: t("menu.dark"), icon: <Moon className="size-3" /> },
        { value: "light", label: t("menu.light"), icon: <Sun className="size-3" /> },
      ]}
    />
  );
}

function ThemeToggle({ theme, toggleTheme }) {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? t("common.switchToLight") : t("common.switchToDark")}
      className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:border-ring/60 hover:text-primary"
    >
      {theme === "dark" ? <Sun className="size-[17px]" /> : <Moon className="size-[17px]" />}
    </button>
  );
}

function Avatar({ user, initials, className }) {
  return (
    <span className={cn("block shrink-0 rounded-2xl bg-grad p-[2px]", className)}>
      {user?.steamAvatar ? (
        <img src={user.steamAvatar} alt="" className="size-full rounded-[14px] object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center rounded-[14px] bg-[#1F1C17] font-heading font-bold text-[#E9D3A0]">{initials}</span>
      )}
    </span>
  );
}

function BalancePill({ user, navigate }) {
  if (!user) {
    return (
      <button
        type="button"
        onClick={() => navigate("login")}
        className="btn-grad inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold"
      >
        <LogIn className="size-4" />
        {t("common.login")}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => navigate("balance")}
      className="whitespace-nowrap rounded-full border border-border bg-card px-3.5 py-[7px] text-xs font-semibold tabular-nums text-foreground transition-colors hover:border-ring/60"
    >
      {fmtMoney(user.balance ?? 0)}
    </button>
  );
}

function MenuItem({ item, active, count, onClick }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-[13px] px-2.5 py-[7px] text-left text-[13.5px] transition-colors",
        active ? "bg-[var(--row-sel)] font-semibold text-[var(--heading)] shadow-[inset_2px_0_0_var(--primary)]" : "text-foreground hover:bg-[var(--row-hov)]"
      )}
    >
      <span
        className={cn(
          "flex size-[30px] shrink-0 items-center justify-center rounded-[10px]",
          active ? "bg-grad" : item.key === "tg" ? "bg-[rgba(111,169,210,.1)] text-[#6FA9D2]" : "bg-[var(--row-sel)] text-primary"
        )}
      >
        <Icon className="size-[15px]" />
      </span>
      <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
      {count > 0 ? (
        <span
          className={cn(
            "flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[10px] font-bold",
            item.badge === "notif" ? "bg-[#C9392F] text-white" : "border border-primary/30 bg-[var(--row-sel)] text-primary"
          )}
        >
          {count}
        </span>
      ) : item.pill ? (
        <span className="shrink-0 rounded-full border border-primary/25 bg-[var(--row-sel)] px-[7px] py-0.5 text-[9.5px] font-bold tracking-wider text-primary">{t(item.pill)}</span>
      ) : !active ? (
        <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      ) : null}
    </button>
  );
}

function MenuSections({ page, user, counts, onItem }) {
  return (
    <nav className="stagger">
      {SECTIONS.filter((s) => !s.auth || user).map((s) => (
        <div key={s.key}>
          <p className="mx-2.5 mb-1 mt-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t(`menu.sec.${s.key}`)}</p>
          {s.items.map((item) => (
            <MenuItem
              key={item.key}
              item={item}
              active={!item.section && !item.external && (item.group || [item.key]).includes(page)}
              count={item.badge ? counts[item.badge] : 0}
              onClick={() => onItem(item)}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

export default function AppShell({ page, children }) {
  const { navigate, user, theme, toggleTheme, lang, setLang, tg, openModal, closeModal, showToast, refreshMe } = useApp();
  const [open, setOpen] = useState(false);
  const [botUsername, setBotUsername] = useState(null);
  const [counts, setCounts] = useState({ notif: 0, requests: 0 });
  const [hold, setHold] = useState(null);
  const initials = user?.name ? user.name.replace(/^#/, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  useEffect(() => {
    api("/api/bot-info").then((r) => setBotUsername(r.username)).catch(() => {});
  }, []);

  // Belgilar: o'qilmagan xabarlar va admin kutayotgan so'rovlar. Kirishda,
  // sahifa almashganda va menyu ochilganda yangilanadi (yengil so'rovlar).
  const loadCounts = useCallback(() => {
    if (!user) return;
    api("/api/notifications").then((l) => setCounts((c) => ({ ...c, notif: l.filter((n) => !n.read).length }))).catch(() => {});
    api("/api/instant-sell-mine").then((l) => setCounts((c) => ({ ...c, requests: l.filter((r) => r.status === "awaiting_admin").length }))).catch(() => {});
  }, [user?.id]);
  useEffect(() => { loadCounts(); }, [loadCounts, page]);
  useEffect(() => {
    if (!open || !user) return;
    loadCounts();
    api("/api/trade-hold-summary").then(setHold).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const tgUrl = botUsername ? `https://t.me/${botUsername}` : "https://t.me";
  function openTg() {
    if (tg?.openTelegramLink && botUsername) tg.openTelegramLink(tgUrl);
    else window.open(tgUrl, "_blank", "noopener");
  }

  function onItem(item) {
    setOpen(false);
    if (item.external) return openTg();
    navigate(item.page || item.key);
    if (item.section) {
      setTimeout(() => document.getElementById(item.section)?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
    } else {
      window.scrollTo({ top: 0 });
    }
  }

  function withdraw() {
    setOpen(false);
    openWithdrawModal({ openModal, closeModal, showToast, refreshMe });
  }

  return (
    <div className="min-h-screen">
      <div className="aurora" aria-hidden />

      {/* Yon menyu (kompyuter) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-sidebar/80 backdrop-blur lg:flex">
        <div className="px-5 pb-2 pt-[22px]">
          <Brand onClick={() => navigate(HOME)} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <MenuSections page={page} user={user} counts={counts} onItem={onItem} />
        </div>
        <div className="p-3">
          {user ? (
            <button type="button" onClick={() => navigate("profile")} className="grad-card block w-full text-left transition-transform hover:-translate-y-0.5">
              <span className="grad-in flex items-center gap-2.5 p-3">
                <Avatar user={user} initials={initials} className="size-9 rounded-xl [&>*]:rounded-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-[var(--heading)]">{user.name}</span>
                  <span className="block truncate text-xs font-semibold tabular-nums text-primary">{fmtMoney(user.balance ?? 0)}</span>
                </span>
              </span>
            </button>
          ) : (
            <button type="button" onClick={() => navigate("login")} className="btn-grad flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold">
              <LogIn className="size-4" />
              {t("common.login")}
            </button>
          )}
        </div>
      </aside>

      {/* Telefon: yuqori panel */}
      <div className="sticky top-0 z-40 lg:hidden">
        <div className="flex h-14 items-center justify-between gap-2 bg-background/70 px-4 backdrop-blur-xl">
          <Brand onClick={() => navigate(HOME)} compact />
          <div className="flex shrink-0 items-center gap-2">
            <BalancePill user={user} navigate={navigate} />
            <button
              type="button"
              aria-label={t("common.menu")}
              onClick={() => setOpen(true)}
              className="relative flex size-9 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card transition-colors hover:border-ring/60"
            >
              <span className="h-[1.6px] w-[15px] rounded bg-foreground" />
              <span className="h-[1.6px] w-[15px] rounded bg-foreground" />
              <span className="-ml-[5px] h-[1.6px] w-[10px] rounded bg-foreground" />
              {counts.notif > 0 && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[#C9392F] shadow-[0_0_0_2px_var(--background)]" />}
            </button>
          </div>
        </div>
        <div className="grad-line" />
      </div>

      {/* Telefon: burger menyu */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="scrim-in absolute inset-0 bg-black/55" onClick={() => setOpen(false)} aria-hidden />
          <div className="drawer-in absolute inset-y-0 left-0 flex w-[322px] max-w-[86vw] flex-col overflow-hidden border-r border-border bg-sidebar shadow-[30px_0_60px_-30px_rgba(0,0,0,.6)]">
            <div className="pointer-events-none absolute -right-24 -top-16 h-44 w-56 rounded-full bg-[var(--orb-a)] blur-[50px]" />
            <div className="relative flex items-center justify-between px-4 pb-2.5 pt-[18px]">
              <Brand onClick={() => onItem({ key: HOME })} compact />
              <button type="button" aria-label={t("common.close")} onClick={() => setOpen(false)} className="flex size-8 items-center justify-center rounded-[11px] border border-border text-muted-foreground transition-colors hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>

            {user && (
              <div className="relative px-3.5 pt-1">
                <div className="grad-card">
                  <div className="grad-in p-3.5">
                    <button type="button" onClick={() => onItem({ key: "profile" })} className="flex w-full items-center gap-3 text-left">
                      <Avatar user={user} initials={initials} className="size-[42px] [&>*]:text-[15px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-[var(--heading)]">{user.name}</span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">● {t(user.steamId64 ? "menu.steamOn" : "menu.steamOff")}</span>
                      </span>
                    </button>
                    <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("menu.balance")}</p>
                    <div className="mt-0.5 flex items-end justify-between gap-2">
                      <span className="font-heading text-[28px] font-semibold leading-none tabular-nums text-[var(--heading)]">
                        {Math.round(user.balance ?? 0).toLocaleString("ru-RU")} <span className="text-sm text-primary">{t("common.somWithAmount")}</span>
                      </span>
                      <button type="button" onClick={withdraw} className="btn-grad shrink-0 rounded-[11px] px-3 py-2 text-xs font-semibold">{t("menu.withdraw")}</button>
                    </div>
                    {hold && (hold.available > 0 || hold.frozen > 0) && (
                      <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                        {t("menu.holdLine", { a: Math.round(hold.available || 0).toLocaleString("ru-RU"), f: Math.round(hold.frozen || 0).toLocaleString("ru-RU") })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="relative flex-1 overflow-y-auto px-2 pb-2">
              <MenuSections page={page} user={user} counts={counts} onItem={onItem} />
              {!user && (
                <button type="button" onClick={() => onItem({ key: "login" })} className="btn-grad mx-2 mt-4 flex w-[calc(100%-1rem)] items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold">
                  <LogIn className="size-4" />
                  {t("common.login")}
                </button>
              )}
            </div>

            <div className="relative px-3.5 pb-[18px] pt-2">
              <div className="grad-line -mx-3.5 mb-3" />
              <div className="flex items-center justify-between gap-2">
                <LangSeg lang={lang} setLang={setLang} />
                <ThemeSeg theme={theme} toggleTheme={toggleTheme} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Asosiy qism */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 hidden lg:block">
          <div className="flex h-16 items-center justify-end gap-2.5 bg-background/70 px-8 backdrop-blur-xl">
            <button
              type="button"
              onClick={openTg}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-[7px] text-xs font-medium text-[#8FC3E8] transition-colors hover:border-[#8FC3E8]/50"
            >
              <TelegramLogo className="size-3.5" />
              {t("nav.telegramBot")}
            </button>
            <LangSeg lang={lang} setLang={setLang} />
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
            <BalancePill user={user} navigate={navigate} />
          </div>
          <div className="grad-line" />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
