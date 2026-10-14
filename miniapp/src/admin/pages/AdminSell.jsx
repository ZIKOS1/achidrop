import { useCallback, useEffect, useState } from "react";
import { Banknote, CheckCircle2, Clock, Package, RefreshCw, Settings2, XCircle } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { fmtMoney, hap, imgSrc } from "../../utils";
import Empty from "../../components/Empty";

// Skin sotish — sozlamalar (marja, kurs, bizning trade link) va so'rovlar.
// Asosiy tasdiqlash yo'li — Telegram'dagi "✅ Oldim" tugmasi; bu sahifa
// zaxira yo'l (server bir xil tranzaksiyali funksiyani chaqiradi, ikki
// marta bosilsa ham pul ikki marta tushmaydi).
const FILTERS = [
  { key: "awaiting_admin", label: "Kutilmoqda" },
  { key: "credited", label: "Olingan" },
  { key: "rejected", label: "Rad etilgan" },
  { key: "", label: "Hammasi" },
];

function SettingsCard() {
  const { showToast } = useApp();
  const [s, setS] = useState(null);
  const [form, setForm] = useState({ margin: "", rate: "", url: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/api/admin/settings").then((r) => {
      setS(r);
      setForm({ margin: String(r.instantSellMarginPercent ?? 12), rate: String(r.usdToSomRate ?? 12700), url: r.botTradeUrl || "" });
    }).catch(() => {});
  }, []);

  async function save() {
    const margin = Number(form.margin), rate = Number(form.rate);
    if (!Number.isFinite(margin) || margin < 0 || margin >= 100) return showToast("Marja 0–99% bo'lishi kerak", "err");
    if (!Number.isFinite(rate) || rate <= 0) return showToast("Kurs musbat raqam bo'lishi kerak", "err");
    setSaving(true);
    try {
      const r = await api("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ instantSellMarginPercent: margin, usdToSomRate: rate, botTradeUrl: form.url.trim() }),
      });
      setS(r);
      hap("notif", "success");
      showToast("Saqlandi", "ok");
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setSaving(false);
    }
  }

  if (!s) return <div className="skeleton h-40 w-full" />;
  const input = "w-full border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary";
  return (
    <div className="space-y-3 border border-border bg-card p-5">
      <p className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
        <Settings2 className="size-4 text-accent" />
        Narx sozlamalari
      </p>
      <p className={s.lisConfigured ? "text-xs text-success" : "text-xs text-warning"}>
        {s.lisConfigured ? "✅ Lis-Skins API ulangan — skin sotish ishlayapti" : "⏳ Lis-Skins API kaliti hali yo'q — userlarda \"Tez orada\" ko'rinadi"}
      </p>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Marja (%) — userga Lis narxidan shuncha arzon to'lanadi</span>
        <input type="number" inputMode="decimal" value={form.margin} onChange={(e) => setForm({ ...form, margin: e.target.value })} className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Dollar kursi (1 $ = ? so'm)</span>
        <input type="number" inputMode="numeric" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Bizning Steam trade link (userlar skinni shunga yuboradi)</span>
        <input type="text" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&token=..." className={input} />
      </label>
      <p className="text-xs text-muted-foreground">
        Misol: Lis narxi 10 $ bo'lsa, userga {fmtMoney(Math.floor(10 * (Number(form.rate) || 0) * (1 - (Number(form.margin) || 0) / 100)))} to'lanadi.
      </p>
      <button type="button" disabled={saving} onClick={save} className="w-full bg-primary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-50">
        {saving ? "..." : "Saqlash"}
      </button>
    </div>
  );
}

export default function AdminSell() {
  const { showToast } = useApp();
  const [filter, setFilter] = useState("awaiting_admin");
  const [list, setList] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setList(null);
    api(`/api/admin/instant-sell${filter ? `?status=${filter}` : ""}`).then(setList).catch(() => setList([]));
  }, [filter]);
  useEffect(load, [load]);

  async function act(id, action) {
    if (action === "approve" && !window.confirm(`#${id}: skin(lar) Steam'da kelganini tekshirdingizmi? Pul userning balansiga tushadi.`)) return;
    if (action === "reject" && !window.confirm(`#${id} so'rovini rad etasizmi?`)) return;
    setBusyId(id);
    try {
      await api(`/api/admin/instant-sell/${id}/${action}`, { method: "POST", body: JSON.stringify({}) });
      hap("notif", "success");
      showToast(action === "approve" ? "Pul balansga tushdi" : "Rad etildi", "ok");
      load();
    } catch (e) {
      showToast(e.error === "wrong_state" ? "Bu so'rov allaqachon ko'rib chiqilgan" : (e.error || "Xato"), "err");
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 font-heading text-xl font-bold uppercase tracking-wide text-foreground">
        <Banknote className="size-5 text-primary" />
        Skin sotish
      </h1>

      <SettingsCard />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={filter === f.key ? "bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground" : "border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"}
          >
            {f.label}
          </button>
        ))}
        <button type="button" onClick={load} className="ml-auto flex items-center gap-1 border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
          <RefreshCw className="size-3.5" /> Yangilash
        </button>
      </div>

      {list == null ? (
        <div className="skeleton h-32 w-full" />
      ) : !list.length ? (
        <Empty icon={Package} title="So'rovlar yo'q" />
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <div key={r.id} className="space-y-3 border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-heading text-sm font-bold text-foreground">#{r.id} · {r.userName || r.userId}</p>
                  <p className="text-[11px] text-muted-foreground">
                    ID {r.userId}{r.steamId64 ? ` · Steam ${r.steamId64}` : ""} · {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-xs font-semibold">
                  {r.status === "awaiting_admin" ? <><Clock className="size-3.5 text-warning" /> Kutilmoqda</>
                    : r.status === "credited" ? <><CheckCircle2 className="size-3.5 text-success" /> Olingan</>
                    : <><XCircle className="size-3.5 text-destructive" /> {r.status}</>}
                </span>
              </div>
              <ul className="divide-y divide-border border border-border">
                {(r.items || []).map((it) => (
                  <li key={it.assetId} className="flex items-center gap-3 p-2">
                    <span className="flex size-9 shrink-0 items-center justify-center bg-secondary">
                      {it.imageUrl ? <img src={imgSrc(it.imageUrl)} alt="" className="max-h-full max-w-full object-contain" /> : <Package className="size-4 text-muted-foreground" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {it.marketHashName}{it.float != null ? ` · ${it.float.toFixed(4)}` : ""}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-foreground">{fmtMoney(it.priceSom)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-heading text-sm font-bold text-success">Jami: {fmtMoney(r.totalSom ?? r.priceSom)}</span>
                {r.status === "awaiting_admin" && (
                  <div className="flex gap-2">
                    <button type="button" disabled={busyId === r.id} onClick={() => act(r.id, "reject")} className="border border-destructive/50 px-3 py-2 text-xs font-bold text-destructive disabled:opacity-50">
                      ❌ Rad etish
                    </button>
                    <button type="button" disabled={busyId === r.id} onClick={() => act(r.id, "approve")} className="bg-success px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                      ✅ Oldim
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
