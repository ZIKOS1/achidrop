import { useCallback, useEffect, useRef, useState } from "react";
import { Gavel, Package, Plus, Users, Ticket, Image as ImageIcon, LogOut, Crosshair, Crown, BookOpen, LifeBuoy, ShoppingCart, Banknote, CircleDollarSign, ChartColumn, Menu, X, Trophy } from "lucide-react";
import { api } from "./api";
import { AdminContext } from "./context";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import AdminLogin from "./AdminLogin";
import AdminHome from "./pages/AdminHome";
import AdminAuctions from "./pages/AdminAuctions";
import AdminAuctionForm from "./pages/AdminAuctionForm";
import AdminMarket from "./pages/AdminMarket";
import AdminUsers from "./pages/AdminUsers";
import AdminUserDetail from "./pages/AdminUserDetail";
import AdminPromos from "./pages/AdminPromos";
import AdminBanners from "./pages/AdminBanners";
import AdminGuides from "./pages/AdminGuides";
import AdminSupport from "./pages/AdminSupport";
import CeoAccounts from "./pages/CeoAccounts";
import AdminSell from "./pages/AdminSell";
import AdminLisAutosell from "./pages/AdminLisAutosell";
import AdminFinance from "./pages/AdminFinance";
import AdminRating from "./pages/AdminRating";

const PAGES = {
  home: () => <AdminHome />,
  "admin-sell": () => <AdminSell />,
  "admin-lis": () => <AdminLisAutosell />,
  "admin-finance": () => <AdminFinance />,
  "admin-rating": () => <AdminRating />,
  "admin-auctions": () => <AdminAuctions />,
  "admin-auction-form": (data) => <AdminAuctionForm id={data} />,
  "admin-market": () => <AdminMarket />,
  "admin-users": () => <AdminUsers />,
  "admin-user-detail": (data) => <AdminUserDetail id={data} />,
  "admin-promos": () => <AdminPromos />,
  "admin-banners": () => <AdminBanners />,
  "admin-guides": () => <AdminGuides />,
  "admin-support": () => <AdminSupport />,
  "ceo-accounts": () => <CeoAccounts />,
};

// AdminHome'dagi "Boshqaruv" ro'yxati "admin" nomi bilan navigate qiladi
// (asosiy sahifaga qaytish nomi client ilovasidagi bilan bir xil bo'lishi
// uchun) — shu yerda "home"ga moslaymiz.
const PAGE_ALIAS = { admin: "home" };

const NAV_ITEMS = [
  { key: "home", label: "Bosh sahifa", icon: Gavel },
  { key: "admin-finance", label: "Moliya", icon: ChartColumn },
  { key: "admin-sell", label: "Skin sotish", icon: Banknote },
  { key: "admin-rating", label: "Reyting", icon: Trophy },
  { key: "admin-lis", label: "Lis avtosell", icon: CircleDollarSign },
  { key: "admin-auctions", label: "Auksionlar", icon: Package },
  { key: "admin-auction-form", label: "Yangi auksion", icon: Plus, navData: null },
  { key: "admin-market", label: "Market", icon: ShoppingCart },
  { key: "admin-users", label: "Foydalanuvchilar", icon: Users },
  { key: "admin-promos", label: "Promo kodlar", icon: Ticket },
  { key: "admin-banners", label: "Bannerlar", icon: ImageIcon },
  { key: "admin-guides", label: "Yo'riqnomalar", icon: BookOpen },
  { key: "admin-support", label: "Qo'llab-quvvatlash", icon: LifeBuoy },
];

// Faqat role:"ceo" bo'lganlarga ko'rinadigan qo'shimcha nav — boshqa admin
// akkauntlarini boshqarish.
const CEO_NAV_ITEM = { key: "ceo-accounts", label: "CEO", icon: Crown };

function initialPage() {
  const params = new URLSearchParams(location.search);
  const page = params.get("page");
  if (page && PAGES[page]) return { name: page, data: null };
  return { name: "home", data: null };
}

export default function AdminApp() {
  const [loggedIn, setLoggedIn] = useState(null); // null = tekshirilmoqda
  const [role, setRole] = useState(null);
  const [page, setPage] = useState(initialPage);
  const [toast, setToast] = useState({ msg: "", type: "", show: false });
  const [modal, setModal] = useState({ open: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const toastTimer = useRef(null);

  useEffect(() => {
    api("/api/admin/session").then((r) => { setLoggedIn(!!r.loggedIn); setRole(r.role || null); }).catch(() => setLoggedIn(false));
  }, []);

  const navigate = useCallback((name, data = null) => {
    const real = PAGE_ALIAS[name] || name;
    setPage({ name: real, data });
    const params = new URLSearchParams();
    params.set("page", real);
    try { history.pushState({ name: real, data }, "", `${location.pathname}?${params.toString()}`); } catch {}
  }, []);

  useEffect(() => {
    const onPopState = () => setPage(initialPage());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const showToast = useCallback((msg, type = "") => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type, show: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 3000);
  }, []);
  const openModal = useCallback((config) => setModal({ ...config, open: true }), []);
  const closeModal = useCallback(() => setModal((m) => ({ ...m, open: false })), []);

  // Telefon menyusi ochiq turganda orqa sahifa aylanmasin, Escape yopsin.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function logout() {
    try { await api("/api/admin/logout", { method: "POST" }); } catch {}
    setLoggedIn(false);
    setRole(null);
  }

  if (loggedIn === null) {
    return (
      <div style={{ minHeight: "100vh" }} className="bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="skeleton h-12 w-full" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="border border-border bg-card p-4">
                <span className="skeleton block size-5" />
                <div className="skeleton mt-3 h-6 w-2/3" />
                <div className="skeleton mt-2 h-3 w-4/5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (!loggedIn) {
    return <AdminLogin onLoggedIn={(r) => { setLoggedIn(true); setRole(r); }} />;
  }

  const ctx = { navigate, showToast, openModal, closeModal, tg: null };
  const canSeeCeoPage = page.name !== "ceo-accounts" || role === "ceo";
  const render = canSeeCeoPage ? (PAGES[page.name] || PAGES.home) : PAGES.home;
  const navItems = role === "ceo" ? [...NAV_ITEMS, CEO_NAV_ITEM] : NAV_ITEMS;
  const currentLabel = (navItems.find((i) => i.key === (page.name === "admin-user-detail" ? "admin-users" : page.name)) || navItems[0]).label;

  return (
    <AdminContext.Provider value={ctx}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
          {/* Telefon: menyu tugmasi + joriy sahifa nomi */}
          <div className="flex h-14 items-center gap-2.5 px-3.5 lg:hidden">
            <button type="button" aria-label="Menyu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="flex size-10 shrink-0 items-center justify-center border border-border text-foreground">
              <Menu className="size-5" />
            </button>
            <span className="min-w-0 truncate font-heading text-sm font-bold uppercase tracking-wide text-foreground">{currentLabel}</span>
          </div>

          {/* Kompyuter */}
          <div className="mx-auto hidden max-w-6xl flex-wrap items-center gap-2 px-4 py-3 lg:flex">
            <span className="mr-2 flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide text-foreground">
              <Crosshair className="size-4 text-primary" />
              Admin
            </span>
            <nav className="flex flex-1 flex-wrap gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = page.name === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => navigate(item.key, "navData" in item ? item.navData : undefined)}
                    className={
                      "flex items-center gap-1.5 px-3 py-2 text-xs font-medium uppercase tracking-wide transition-colors " +
                      (active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")
                    }
                  >
                    <Icon className="size-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 border border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
            >
              <LogOut className="size-3.5" />
              Chiqish
            </button>
          </div>
        </header>

        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="scrim-in absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} aria-hidden />
            <div role="dialog" aria-modal="true" aria-label="Menyu" className="drawer-in absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-border bg-card">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-border pl-4 pr-2">
                <span className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide text-foreground">
                  <Crosshair className="size-4 text-primary" />
                  Admin
                </span>
                <button type="button" aria-label="Yopish" onClick={() => setMenuOpen(false)} className="flex size-11 items-center justify-center text-muted-foreground">
                  <X className="size-5" />
                </button>
              </div>
              <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = page.name === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => { setMenuOpen(false); navigate(item.key, "navData" in item ? item.navData : undefined); window.scrollTo({ top: 0 }); }}
                      className={"flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm font-medium transition-colors " + (active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary/60")}
                    >
                      <Icon className="size-[18px] shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
              <div className="shrink-0 border-t border-border p-2 pb-[max(.5rem,env(safe-area-inset-bottom))]">
                <button type="button" onClick={logout} className="flex min-h-11 w-full items-center gap-3 px-3 text-sm font-medium text-destructive">
                  <LogOut className="size-[18px] shrink-0" />
                  Chiqish
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="mx-auto max-w-6xl p-3.5 sm:p-6">{render(page.data)}</main>
      </div>
      <Modal modal={modal} onClose={closeModal} />
      <Toast toast={toast} />
    </AdminContext.Provider>
  );
}
