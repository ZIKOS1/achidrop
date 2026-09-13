import { useCallback, useEffect, useRef, useState } from "react";
import { api, tg, initData } from "./api";
import { AppContext } from "./context";
import { applyTheme, getInitialTheme } from "./theme";
import { getCurrentLang, setCurrentLang } from "./i18n";
import AppShell from "./components/AppShell";
import Modal from "./components/Modal";
import Toast from "./components/Toast";
import Login from "./pages/Login";
import Auctions from "./pages/Auctions";
import LotDetail from "./pages/LotDetail";
import Profile from "./pages/Profile";
import Balance from "./pages/Balance";
import Trade from "./pages/Trade";
import TradeDetail from "./pages/TradeDetail";
import Market from "./pages/Market";
import MarketSell from "./pages/MarketSell";
import MarketDetail from "./pages/MarketDetail";
import Inventory from "./pages/Inventory";
import Leaderboard from "./pages/Leaderboard";
import BidHistory from "./pages/BidHistory";
import BalHistory from "./pages/BalHistory";
import Notifications from "./pages/Notifications";

// Nav'ning asosiy (top-level) sahifalari — shulardan boshqasi ochilganda
// Telegram BackButton ko'rsatiladi va "orqaga" shu xaritaga qarab boradi.
const TOP_LEVEL_PAGES = ["auctions", "inventory", "profile", "balance", "trade", "market", "login"];

function parentOf(page) {
  if (page === "auction-detail") return "auctions";
  if (page === "leaderboard") return "auctions";
  if (page === "trade-detail") return "trade";
  if (page === "market-detail") return "market";
  if (page === "market-sell") return "market";
  if (page === "bid-history") return "profile";
  if (page === "bal-history") return "profile";
  if (page === "notifications") return "profile";
  return "auctions";
}

const PAGES = {
  auctions: () => <Auctions />,
  "auction-detail": (data) => <LotDetail id={data} />,
  profile: () => <Profile />,
  balance: () => <Balance />,
  trade: () => <Trade />,
  "trade-detail": (data) => <TradeDetail id={data} />,
  market: () => <Market />,
  "market-sell": () => <MarketSell />,
  "market-detail": (data) => <MarketDetail id={data} />,
  inventory: () => <Inventory />,
  leaderboard: () => <Leaderboard />,
  "bid-history": () => <BidHistory />,
  "bal-history": () => <BalHistory />,
  notifications: () => <Notifications />,
  login: () => <Login />,
};

function initialPage() {
  const params = new URLSearchParams(location.search);
  const lot = params.get("lot");
  if (lot && !isNaN(Number(lot))) return { name: "auction-detail", data: Number(lot) };
  const trade = params.get("trade");
  if (trade && !isNaN(Number(trade))) return { name: "trade-detail", data: Number(trade) };
  const mkt = params.get("mkt");
  if (mkt && !isNaN(Number(mkt))) return { name: "market-detail", data: Number(mkt) };
  const page = params.get("page");
  if (page && PAGES[page]) return { name: page, data: null };
  return { name: "auctions", data: null };
}

export default function App() {
  const [page, setPage] = useState(initialPage);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "", show: false });
  const [modal, setModal] = useState({ open: false });
  const [theme, setTheme] = useState(getInitialTheme);
  const [lang, setLangState] = useState(getCurrentLang);
  const toastTimer = useRef(null);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  const setLang = useCallback((l) => {
    setCurrentLang(l);
    setLangState(l);
  }, []);

  const loadMe = useCallback(() => {
    return api("/api/me").then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    loadMe().finally(() => setAuthChecked(true));
  }, [loadMe]);

  const navigate = useCallback((name, data = null) => {
    setPage({ name, data });
    // Brauzer manzilini ham yangilaymiz — orqaga/oldinga tugmalari va sahifani
    // yangilash (F5) joriy sahifani saqlab qolishi uchun. Telegram ichida bu
    // shunchaki e'tiborsiz qoldiriladi (URL Telegram tomonidan boshqariladi).
    const params = new URLSearchParams();
    if (name === "auction-detail" && data != null) params.set("lot", String(data));
    else if (name === "trade-detail" && data != null) params.set("trade", String(data));
    else if (name === "market-detail" && data != null) params.set("mkt", String(data));
    else params.set("page", name);
    try {
      history.pushState({ name, data }, "", `${location.pathname}?${params.toString()}`);
    } catch {}
  }, []);

  useEffect(() => {
    const onPopState = (e) => {
      setPage(e.state?.name ? { name: e.state.name, data: e.state.data ?? null } : initialPage());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const isMain = TOP_LEVEL_PAGES.includes(page.name);
    if (isMain) {
      tg?.BackButton?.hide();
    } else {
      const handler = () => navigate(parentOf(page.name));
      tg?.BackButton?.show();
      tg?.BackButton?.onClick(handler);
      return () => tg?.BackButton?.offClick(handler);
    }
  }, [page.name, navigate]);

  const showToast = useCallback((msg, type = "") => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type, show: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 3000);
  }, []);

  const openModal = useCallback((config) => setModal({ ...config, open: true }), []);
  const closeModal = useCallback(() => setModal((m) => ({ ...m, open: false })), []);

  const ctx = { navigate, user, setUser, showToast, openModal, closeModal, tg, refreshMe: loadMe, theme, toggleTheme, lang, setLang };
  const render = PAGES[page.name] || PAGES.auctions;

  // Telegram Mini App ichida (initData bor) — auth tekshiruvi darhol tugaydi.
  // Tashqarida (websaytdan to'g'ridan-to'g'ri) auth tekshirilayotganda ham
  // ilova qobig'ini (About/Auksionlar) ko'rsatamiz — mehmon sifatida ko'rish
  // kirishni talab qilmaydi, faqat login/bid/balans kabi amallar talab qiladi.
  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh" }} className="bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="skeleton h-14 w-full" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="skeleton aspect-[16/10] w-full" />
                <div className="skeleton h-4 w-4/5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={ctx}>
      <AppShell page={page.name}>{render(page.data)}</AppShell>
      <Modal modal={modal} onClose={closeModal} />
      <Toast toast={toast} />
    </AppContext.Provider>
  );
}
