import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CircleDollarSign, Package, RefreshCw } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { fmtMoney } from "../../utils";
import Empty from "../../components/Empty";

// Lis avtosell — Lis o'z inventaringizdagi skinlarga qancha to'lashi.
// Narxlarni egasining kompyuteridagi lisAutosellSync.js (lis-sync.bat) har
// 3 daqiqada Mongo'ga yozadi; sayt Lis'ga o'zi ulana olmaydi (Cloudflare).
const OFFLINE_MS = 10 * 60 * 1000;

const REASONS = {
  unavailable: "Sotib bo'lmaydi",
  trade_ban: "Trade bloklangan",
  trade_lock: "Trade qulfda",
};

function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} soniya oldin`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} daqiqa oldin`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} soat oldin`;
  return `${Math.round(h / 24)} kun oldin`;
}

function usd(n) {
  return n == null ? "—" : `$${Number(n).toFixed(2)}`;
}

export default function AdminLisAutosell() {
  const { showToast } = useApp();
  const [data, setData] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const waitTimer = useRef(null);

  const load = useCallback(() => api("/api/admin/lis-autosell").then((r) => { setData(r); return r; }), []);
  useEffect(() => {
    load().catch(() => setData({ state: null }));
    const t = setInterval(() => load().catch(() => {}), 30000);
    return () => { clearInterval(t); clearInterval(waitTimer.current); };
  }, [load]);

  async function refresh() {
    const before = data?.state?.aliveAt || 0;
    setWaiting(true);
    try {
      await api("/api/admin/lis-autosell/refresh", { method: "POST", body: JSON.stringify({}) });
    } catch (e) {
      setWaiting(false);
      return showToast(e.error || "Xato", "err");
    }
    // Kompyuterdagi dastur so'rovni ~5 soniyada ko'radi; 40 soniya kutamiz.
    let tries = 0;
    clearInterval(waitTimer.current);
    waitTimer.current = setInterval(async () => {
      tries++;
      const r = await load().catch(() => null);
      if ((r?.state?.aliveAt || 0) > before) {
        clearInterval(waitTimer.current);
        setWaiting(false);
        showToast(r.state.error ? "Yangilashda xato" : "Yangilandi", r.state.error ? "err" : "ok");
      } else if (tries >= 20) {
        clearInterval(waitTimer.current);
        setWaiting(false);
        showToast("Kompyuterdagi dastur javob bermadi — u ishlab turibdimi?", "err");
      }
    }, 2000);
  }

  if (!data) return <div className="skeleton h-40 w-full" />;
  const s = data.state;
  const rate = data.rate || 0;
  const offline = !s || data.now - (s.aliveAt || 0) > OFFLINE_MS;
  const items = s?.items || [];
  const sellable = items.filter((i) => !i.disabledReason && i.priceUsd > 0);
  const shown = showAll ? items : sellable;
  const minLeft = s?.minOfferUsd != null ? Math.max(0, s.minOfferUsd - (s.totalUsd || 0)) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex flex-1 items-center gap-2 font-heading text-xl font-bold uppercase tracking-wide text-foreground">
          <CircleDollarSign className="size-5 text-primary" />
          Lis avtosell
        </h1>
        <button type="button" disabled={waiting} onClick={refresh} className="flex items-center gap-1 border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
          <RefreshCw className={waiting ? "size-3.5 animate-spin" : "size-3.5"} /> {waiting ? "Kutilmoqda..." : "Yangilash"}
        </button>
      </div>

      {offline && (
        <div className="flex gap-2 border border-warning/50 bg-warning/10 p-3 text-xs text-foreground">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <span>
            {s ? `Kompyuterdagi dastur ${ago(data.now - s.aliveAt)} oxirgi marta ishlagan. ` : "Hali birorta ham ma'lumot kelmagan. "}
            Narxlar yangilanishi uchun kompyuterda <b>lis-sync.bat</b> ishlab turishi kerak.
          </span>
        </div>
      )}
      {s?.error && (
        <div className="flex gap-2 border border-destructive/50 bg-destructive/10 p-3 text-xs text-foreground">
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <span>{s.errorCode === "cookie_expired" ? "Lis cookie eskirgan — brauzerdan yangisini olish kerak." : s.error}</span>
        </div>
      )}

      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Lis to'laydi (jami)" value={usd(s.totalUsd)} sub={rate ? fmtMoney(s.totalUsd * rate) : null} />
          <Stat label="Sotiladigan skinlar" value={`${s.sellableCount ?? 0} ta`} sub={`inventarda ${items.length} ta`} />
          <Stat label="Lis minimal sotuv" value={usd(s.minOfferUsd)} sub={minLeft ? `yana ${usd(minLeft)} kerak` : minLeft === 0 ? "yetarli ✅" : null} />
          <Stat label="Tezkor to'lov limiti" value={usd(s.instantRemainingUsd)} sub={s.fetchedAt ? `yangilangan: ${ago(data.now - s.fetchedAt)}` : null} />
        </div>
      )}

      {s && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowAll(false)} className={!showAll ? "bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground" : "border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"}>
            Sotiladiganlar ({sellable.length})
          </button>
          <button type="button" onClick={() => setShowAll(true)} className={showAll ? "bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground" : "border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"}>
            Hammasi ({items.length})
          </button>
        </div>
      )}

      {!shown.length ? (
        <Empty icon={Package} title="Skinlar yo'q" />
      ) : (
        <ul className="divide-y divide-border border border-border bg-card">
          {shown.map((it) => (
            <li key={it.assetId} className={"flex items-center gap-3 p-2" + (it.disabledReason ? " opacity-50" : "")}>
              <span className="flex size-12 shrink-0 items-center justify-center bg-secondary" style={it.rarityColor ? { borderBottom: `2px solid ${it.rarityColor}` } : undefined}>
                {it.imageUrl ? <img src={it.imageUrl} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /> : <Package className="size-4 text-muted-foreground" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-foreground">{it.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {it.float != null ? `Float ${it.float.toFixed(4)}` : ""}
                  {it.stickers ? ` · ${it.stickers} ta stiker` : ""}
                  {it.disabledReason ? ` · ${REASONS[it.disabledReason] || it.disabledReason}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold text-foreground">{usd(it.priceUsd)}</span>
                {rate > 0 && <span className="block text-[11px] text-muted-foreground">{fmtMoney(it.priceUsd * rate)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-lg font-bold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
