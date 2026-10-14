import { useEffect, useRef, useState } from "react";
import {
  Gavel,
  Wallet,
  CreditCard,
  Package,
  Repeat,
  ShoppingBag,
  Crosshair,
  Menu,
  X,
  LogIn,
  Sun,
  Moon,
  PlusCircle,
  Banknote,
} from "lucide-react";
import { cn } from "../lib/cn";
import { useApp } from "../context";
import { LANGS, t } from "../i18n";
import { openWithdrawModal } from "../utils";
import { TelegramLogo } from "./BrandIcons";
import { FEATURES } from "../features";

// `feature` — features.js'da o'chirilgan bo'lsa menyuda ko'rinmaydi.
const NAV = [
  { key: "sell", labelKey: "nav.sell", icon: Banknote, group: ["sell"] },
  { key: "auctions", labelKey: "nav.auctions", icon: Gavel, group: ["auctions", "auction-detail", "leaderboard"], feature: "auctions" },
  { key: "inventory", labelKey: "nav.inventory", icon: Package, group: ["inventory"] },
  { key: "trade", labelKey: "nav.trade", icon: Repeat, group: ["trade", "trade-detail"], feature: "trade" },
  { key: "market", labelKey: "nav.market", icon: ShoppingBag, group: ["market", "market-sell", "market-detail"], feature: "market" },
  { key: "profile", labelKey: "nav.profile", icon: Wallet, group: ["profile", "bid-history", "bal-history", "notifications"] },
  { key: "balance", labelKey: "nav.balance", icon: CreditCard, group: ["balance"] },
].filter((item) => !item.feature || FEATURES[item.feature]);
const HOME = FEATURES.auctions ? "auctions" : "sell";

function Brand({ onClick, compact }) {
  return (
    <button type="button" onClick={onClick} className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center bg-primary text-primary-foreground shadow-[0_0_18px_-4px_color-mix(in_oklch,var(--primary)_65%,transparent)] clip-tactical">
        <Crosshair className="size-5" strokeWidth={2.5} />
      </span>
      <span className="flex min-w-0 flex-col items-start leading-none">
        <span className="truncate font-heading text-lg font-bold uppercase tracking-wider text-foreground">
          Ziko<span className="text-primary">Auction</span>
        </span>
        {!compact && (
          <span className="truncate text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {t("nav.tagline")}
          </span>
        )}
      </span>
    </button>
  );
}

// Balans tugmasini bosganda to'ldirish/yechish tanlovi chiqadigan dropdown —
// tashqariga bosilsa yopiladi. "Yechish" alohida modal oynani ochadi
// (openWithdrawModal, Balans sahifasidagi karta bilan bir xil oqim).
function BalanceOrLogin({ user, navigate, compact }) {
  const { openModal, closeModal, showToast, refreshMe } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => navigate("login")}
        className={cn(
          "inline-flex items-center gap-2 bg-primary font-heading font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90",
          compact ? "px-3 py-1.5 text-xs" : "px-3 py-1.5 text-sm"
        )}
      >
        <LogIn className="size-4" />
        {t("common.login")}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 border border-border bg-card px-3 py-1.5 shadow-panel transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_10px_24px_-10px_color-mix(in_oklch,var(--primary)_45%,transparent)]"
      >
        <Wallet className="size-4 text-primary" />
        <span className="font-heading text-sm font-bold text-foreground">
          {(user.balance ?? 0).toLocaleString()} {t("common.somWithAmount")}
        </span>
      </button>
      {open && (
        <div className="animate-fade-up absolute right-0 top-[calc(100%+6px)] z-40 w-56 border border-border bg-card shadow-panel-lg">
          <button
            type="button"
            onClick={() => { setOpen(false); navigate("balance"); }}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <PlusCircle className="size-4 text-primary" />
            {t("balance.topUpAction")}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); openWithdrawModal({ openModal, closeModal, showToast, refreshMe }); }}
            className="flex w-full items-center gap-2.5 border-t border-border px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Banknote className="size-4 text-accent" />
            {t("balance.withdrawAction")}
          </button>
        </div>
      )}
    </div>
  );
}

function LangSwitcher({ lang, setLang }) {
  return (
    <div className="flex border border-border">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          className={cn(
            "px-2 py-1.5 font-heading text-xs font-bold transition-colors",
            lang === l.code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function ThemeToggle({ theme, toggleTheme }) {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? t("common.switchToLight") : t("common.switchToDark")}
      className="flex size-9 shrink-0 items-center justify-center border border-border text-foreground transition-colors hover:border-primary/50 hover:text-primary"
    >
      {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

function Avatar({ user, initials }) {
  if (user?.steamAvatar) {
    return <img src={user.steamAvatar} alt={user.name} className="size-9 shrink-0 object-cover" />;
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center bg-accent/20 font-heading font-bold text-accent">
      {initials}
    </span>
  );
}

function NavLinks({ page, navigate, onNavigate }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.group.includes(page);
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => { navigate(item.key); onNavigate?.(); }}
            className={cn(
              "group flex items-center gap-3 border-l-2 px-3 py-2.5 text-left text-sm font-medium uppercase tracking-wide transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground"
            )}
          >
            <Icon className="size-[18px] shrink-0" />
            <span className="font-heading text-[15px]">{t(item.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function AppShell({ page, children }) {
  const { navigate, user, theme, toggleTheme, lang, setLang } = useApp();
  const [open, setOpen] = useState(false);
  const initials = user?.name ? user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  return (
    <div className="min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-sidebar shadow-panel-lg lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Brand onClick={() => navigate(HOME)} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks page={page} navigate={navigate} />
        </div>
        <div className="border-t border-border p-3">
          {user ? (
            <button type="button" onClick={() => navigate("profile")} className="hover-lift flex w-full items-center gap-3 border border-transparent bg-secondary/60 p-3 text-left shadow-panel transition-colors hover:border-primary/30 clip-tactical">
              <Avatar user={user} initials={initials} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                <p className="truncate text-xs text-accent">{(user.balance ?? 0).toLocaleString()} {t("common.somWithAmount")}</p>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate("login")}
              className="flex w-full items-center justify-center gap-2 bg-primary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground"
            >
              <LogIn className="size-4" />
              {t("common.login")}
            </button>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-sidebar/95 px-3 shadow-[0_8px_24px_-16px_var(--shadow-color)] backdrop-blur lg:hidden">
        <Brand onClick={() => navigate(HOME)} compact />
        <div className="flex shrink-0 items-center gap-2">
          <BalanceOrLogin user={user} navigate={navigate} compact />
          <button
            type="button"
            aria-label={t("common.menu")}
            onClick={() => setOpen(true)}
            className="flex size-9 shrink-0 items-center justify-center border border-border text-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-sidebar">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <Brand onClick={() => { navigate(HOME); setOpen(false); }} compact />
              <button type="button" aria-label={t("common.close")} onClick={() => setOpen(false)} className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <LangSwitcher lang={lang} setLang={setLang} />
              <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavLinks page={page} navigate={navigate} onNavigate={() => setOpen(false)} />
            </div>
            {user && (
              <div className="border-t border-border p-3">
                <button
                  type="button"
                  onClick={() => { navigate("profile"); setOpen(false); }}
                  className="flex w-full items-center gap-3 bg-secondary/60 p-3 text-left clip-tactical"
                >
                  <Avatar user={user} initials={initials} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                    <p className="truncate text-xs text-accent">{(user.balance ?? 0).toLocaleString()} {t("common.somWithAmount")}</p>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 hidden h-16 items-center justify-end border-b border-border bg-background/85 px-6 shadow-[0_1px_0_0_var(--border),0_8px_24px_-16px_var(--shadow-color)] backdrop-blur lg:flex">
          <div className="flex items-center gap-3">
            <a
              href="https://t.me"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <TelegramLogo className="size-4" />
              {t("nav.telegramBot")}
            </a>
            <LangSwitcher lang={lang} setLang={setLang} />
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
            <BalanceOrLogin user={user} navigate={navigate} />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
