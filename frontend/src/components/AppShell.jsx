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
  Megaphone,
  MessagesSquare,
  ChevronRight,
  Menu,
} from "lucide-react";
import { cn } from "../lib/cn";
import { useApp } from "../context";
import { LANGS, t } from "../i18n";
import { api } from "../api";
import { fmtMoney, openWithdrawModal, TG_LINKS, openTgUser } from "../utils";
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
      { key: "tg", labelKey: "menu.tgHelp", icon: TelegramLogo, external: TG_LINKS.support },
      { key: "tgChannel", labelKey: "menu.tgChannel", icon: Megaphone, external: TG_LINKS.channel },
      { key: "tgChat", labelKey: "menu.tgChat", icon: MessagesSquare, external: TG_LINKS.chat },
    ],
  },
].map((s) => ({ ...s, items: s.items.filter((i) => !i.feature || FEATURES[i.feature]) }));

// Logo: "ACHI" qizil + "DROP". Kumush menyuda DROP doim to'q (dizayn bo'yicha);
// `badge` — telefon yuqori panelidagi kumush yorliq ko'rinishi.
function Brand({ onClick, size = 36, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("font-logo flex min-w-0 items-center gap-[0.22em] rounded-[9px]", badge && "logo-badge px-[9px] pb-[5px] pt-1.5")}
      style={{ fontSize: size }}
    >
      <span className="text-[#E3141F]">ACHI</span><span className="text-[#0E0E10]">DROP</span>
    </button>
  );
}

// Yuqori paneldagi dumaloq (pill) tugmalar uchun umumiy ko'rinish
const PILL = "flex h-10 items-center rounded-full border border-[var(--ad-line)] bg-[var(--row-hov)] transition-colors";

function LangPill({ lang, setLang }) {
  return (
    <div className={cn(PILL, "gap-0.5 p-1")}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          className={cn(
            "flex h-[30px] items-center rounded-full px-2.5 text-sm font-semibold transition-colors",
            lang === l.code ? "bg-[rgba(227,20,31,.18)] text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function ThemeToggle({ theme, toggleTheme, className }) {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? t("common.switchToLight") : t("common.switchToDark")}
      className={cn(PILL, "w-10 shrink-0 justify-center text-foreground hover:border-ring/60 hover:text-primary", className)}
    >
      {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

function Avatar({ user, initials, className }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,#E9E9EC,#A9ACB3)] text-[#1A1A1E]", className)}>
      {user?.steamAvatar ? (
        <img src={user.steamAvatar} alt="" className="size-full rounded-none object-cover" />
      ) : user ? (
        <span className="font-heading text-sm font-bold">{initials}</span>
      ) : (
        <User className="size-5" />
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
        className="btn-grad inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
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
      className={cn(PILL, "whitespace-nowrap px-4 text-[15px] font-bold tabular-nums text-foreground hover:border-ring/60")}
    >
      {fmtMoney(user.balance ?? 0)}
    </button>
  );
}

// Kumush menyu qatori: oddiy holatda to'q matn, faol bo'lsa to'q-qizil gradient.
function MenuItem({ item, active, count, onClick }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border px-2.5 py-1.5 text-left text-[15.5px] font-medium transition-colors",
        active
          ? "border-white/[.18] bg-[linear-gradient(90deg,rgba(120,20,28,.85),rgba(70,30,36,.75))] text-white shadow-[inset_3px_0_0_#E3141F,0_6px_16px_rgba(0,0,0,.3)]"
          : "border-transparent text-[#121216] hover:bg-[rgba(20,20,24,.28)]"
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-[9px]",
          active ? "bg-[#E3141F] text-white" : item.external ? "bg-[rgba(18,18,22,.55)] text-[#3AA8F0]" : "bg-[rgba(18,18,22,.55)] text-[#FF3B45]"
        )}
      >
        <Icon className="size-[17px]" />
      </span>
      <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
      {count > 0 ? (
        <span className="flex h-5 min-w-[22px] items-center justify-center rounded-full bg-[#E3141F] px-1.5 text-[11px] font-bold text-white">{count}</span>
      ) : item.pill ? (
        <span className="shrink-0 rounded-full border border-[#E3141F] bg-black/25 px-[7px] py-0.5 text-[10.5px] font-bold tracking-wider text-[#E3141F]">{t(item.pill)}</span>
      ) : !active ? (
        <ChevronRight className="size-3.5 text-[#1E1F23] transition-transform group-hover:translate-x-0.5" />
      ) : null}
    </button>
  );
}

function MenuSections({ page, user, counts, onItem }) {
  return (
    <nav className="stagger relative">
      {SECTIONS.filter((s) => !s.auth || user).map((s) => (
        <div key={s.key} className="mb-1.5 flex flex-col gap-0.5">
          <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1E1F23]">{t(`menu.sec.${s.key}`)}</p>
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

// Menyu pastidagi foydalanuvchi kartasi (to'q, yarim shaffof)
function UserCard({ user, initials, onClick }) {
  return (
    <button type="button" onClick={onClick} className="relative flex w-full items-center gap-3 rounded-[14px] border border-white/[.12] bg-[rgba(14,14,18,.55)] px-3 py-2.5 text-left transition-colors hover:bg-[rgba(14,14,18,.7)]">
      <Avatar user={user} initials={initials} className="size-10" />
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate text-[14.5px] font-semibold text-white">{user.name}</span>
        <span className="truncate text-[13px] tabular-nums text-[#FF3B45]">{fmtMoney(user.balance ?? 0)}</span>
      </span>
    </button>
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
    if (item.external) return openTgUser(tg, item.external);
    navigate(item.page || item.key);
    if (item.section) {
      // Sahifa yuklanayotganda (inventar, so'rovlar) balandligi o'zgaradi va
      // birinchi aylantirish "uchib ketadi" — shu sabab bir necha marta tekshiramiz.
      [350, 1000, 2000].forEach((ms, i) => setTimeout(() => {
        const el = document.getElementById(item.section);
        if (el && Math.abs(el.getBoundingClientRect().top - 72) > 40) el.scrollIntoView({ behavior: i ? "auto" : "smooth", block: "start" });
      }, ms));
    } else {
      window.scrollTo({ top: 0 });
    }
  }

  function withdraw() {
    setOpen(false);
    openWithdrawModal({ openModal, closeModal, showToast, refreshMe });
  }

  // Kumush menyuning ichi — kompyuterda doimiy, telefonda chapdan chiqadigan panel.
  const sidebar = (mobile) => (
    <>
      <div className="relative flex items-center justify-between px-2 pb-[18px]">
        <Brand onClick={() => onItem({ key: HOME })} size={36} />
        {mobile && (
          <button type="button" aria-label={t("common.close")} onClick={() => setOpen(false)} className="flex size-9 items-center justify-center rounded-[10px] border border-black/25 bg-black/25 text-white">
            <X className="size-[18px]" />
          </button>
        )}
      </div>

      {mobile && user && (
        <div className="relative mb-2 rounded-[14px] border border-white/[.12] bg-[rgba(14,14,18,.6)] p-3.5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">{t("menu.balance")}</p>
          <div className="mt-1 flex items-end justify-between gap-2">
            <span className="font-heading text-[26px] font-bold leading-none tabular-nums text-white">
              {Math.round(user.balance ?? 0).toLocaleString("ru-RU")} <span className="text-sm text-[#FF3B45]">{t("common.somWithAmount")}</span>
            </span>
            <button type="button" onClick={withdraw} className="btn-grad shrink-0 rounded-[11px] px-3 py-2 text-xs font-semibold">{t("menu.withdraw")}</button>
          </div>
          {hold && (hold.available > 0 || hold.frozen > 0) && (
            <p className="mt-1.5 text-[11px] text-white/60">
              {t("menu.holdLine", { a: Math.round(hold.available || 0).toLocaleString("ru-RU"), f: Math.round(hold.frozen || 0).toLocaleString("ru-RU") })}
            </p>
          )}
        </div>
      )}

      <div className="relative -mx-1 flex-1 overflow-y-auto px-1">
        <MenuSections page={page} user={user} counts={counts} onItem={onItem} />
      </div>

      <div className="relative mt-2 space-y-2">
        {mobile && (
          <div className="flex items-center justify-between gap-2 rounded-[14px] bg-[rgba(14,14,18,.55)] p-1.5">
            <div className="flex gap-0.5">
              {LANGS.map((l) => (
                <button key={l.code} type="button" onClick={() => setLang(l.code)} className={cn("h-[30px] rounded-full px-2.5 text-sm font-semibold", lang === l.code ? "bg-[rgba(227,20,31,.35)] text-white" : "text-white/60")}>
                  {l.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? t("common.switchToLight") : t("common.switchToDark")} className="flex size-[30px] items-center justify-center rounded-full text-white/80">
              {theme === "dark" ? <Sun className="size-[17px]" /> : <Moon className="size-[17px]" />}
            </button>
          </div>
        )}
        {user ? (
          <UserCard user={user} initials={initials} onClick={() => onItem({ key: "profile" })} />
        ) : (
          <button type="button" onClick={() => onItem({ key: "login" })} className="btn-grad flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-sm font-semibold">
            <LogIn className="size-4" />
            {t("common.login")}
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="main-stripes relative isolate min-h-screen">
      {/* Yon menyu (kompyuter) — kumush */}
      <aside className="side-metal fixed inset-y-0 left-0 z-40 hidden w-66 flex-col overflow-hidden px-3 pb-3 pt-[18px] lg:flex">
        {sidebar(false)}
      </aside>

      {/* Telefon: chapdan chiqadigan kumush menyu */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="scrim-in absolute inset-0 bg-[rgba(5,5,8,.6)] backdrop-blur-[3px]" onClick={() => setOpen(false)} aria-hidden />
          <div className="side-metal drawer-in absolute inset-y-0 left-0 flex w-[290px] max-w-[86vw] flex-col overflow-hidden px-3 pb-3 pt-[18px]">
            {sidebar(true)}
          </div>
        </div>
      )}

      {/* Asosiy qism */}
      <div className="lg:pl-66">
        <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-[var(--ad-line)] bg-[var(--ad-header)] px-3.5 py-3 backdrop-blur-[10px] lg:px-8 lg:py-[18px]">
          <button
            type="button"
            aria-label={t("common.menu")}
            onClick={() => setOpen(true)}
            className="relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--ad-line)] bg-[var(--row-hov)] text-foreground lg:hidden"
          >
            <Menu className="size-5" />
            {counts.notif > 0 && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-[#E3141F] shadow-[0_0_0_2px_var(--background)]" />}
          </button>
          <span className="lg:hidden"><Brand onClick={() => navigate(HOME)} size={24} badge /></span>
          <span className="flex-1" />
          <div className="hidden items-center gap-2.5 lg:flex">
            <button type="button" onClick={openTg} className={cn(PILL, "gap-2 whitespace-nowrap px-4 text-[14.5px] font-medium text-foreground hover:border-[#2AABEE]/60")}>
              <TelegramLogo className="size-[18px]" />
              {t("nav.telegramBot")}
            </button>
            {[["channel", Megaphone, "nav.tgChannel"], ["chat", MessagesSquare, "nav.tgChat"]].map(([k, Icon, label]) => (
              <button key={k} type="button" onClick={() => openTgUser(tg, TG_LINKS[k])} title={`@${TG_LINKS[k]}`} className={cn(PILL, "gap-2 whitespace-nowrap px-3 text-[14.5px] font-medium text-foreground hover:border-[#2AABEE]/60 xl:px-4")}>
                <Icon className="size-[17px] text-[#3AA8F0]" />
                <span className="hidden xl:inline">{t(label)}</span>
              </button>
            ))}
            <LangPill lang={lang} setLang={setLang} />
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          </div>
          <BalancePill user={user} navigate={navigate} />
        </header>
        <main className="mx-auto max-w-[1500px] px-3.5 py-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
      </div>
    </div>
  );
}
