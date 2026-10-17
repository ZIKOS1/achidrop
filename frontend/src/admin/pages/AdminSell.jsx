import { useCallback, useEffect, useState } from "react";
import { Banknote, CheckCircle2, Clock, Package, Plus, RefreshCw, Settings2, Trash2, XCircle } from "lucide-react";
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

// Server lisSkinsPrice.SELL_PRICE_RATIO bilan bir xil: narx Lis × shu son dan boshlanadi.
const SELL_PRICE_RATIO = 0.89;

// Server lisSkinsPrice.marginPercentForUsd bilan bir xil: usd <= maxUsd
// bo'lgan birinchi pog'ona, oxirgisi cheksiz.
function marginFor(usd, tiers) {
  const tier = tiers.find((t) => t.maxUsd === "" || t.maxUsd == null || usd <= Number(t.maxUsd)) || tiers[tiers.length - 1];
  return Number(tier?.percent) || 0;
}

// Saqlangan pog'onalar formaga. Hali bitta (eski) marja bo'lsa — 10 $ / 50 $ /
// qolgani pog'onalari o'sha foiz bilan taklif qilinadi (saqlanmaguncha narx
// o'zgarmaydi).
function tiersToForm(tiers) {
  const list = Array.isArray(tiers) && tiers.length ? tiers : [{ maxUsd: null, percent: 12 }];
  if (list.length === 1) {
    const p = String(list[0].percent);
    return [{ maxUsd: "10", percent: p }, { maxUsd: "50", percent: p }, { maxUsd: "", percent: p }];
  }
  return list.map((t) => ({ maxUsd: t.maxUsd == null ? "" : String(t.maxUsd), percent: String(t.percent) }));
}

function SettingsCard() {
  const { showToast } = useApp();
  const [s, setS] = useState(null);
  const [form, setForm] = useState({ rate: "", url: "" });
  const [tiers, setTiers] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/api/admin/settings").then((r) => {
      setS(r);
      setForm({ rate: String(r.usdToSomRate ?? 12700), url: r.botTradeUrl || "" });
      setTiers(tiersToForm(r.instantSellMarginTiers));
    }).catch(() => {});
  }, []);

  function setTier(i, key, value) {
    setTiers((list) => list.map((t, j) => (j === i ? { ...t, [key]: value } : t)));
  }
  function addTier() {
    // Oxirgi (cheksiz) pog'onadan oldin qo'shiladi.
    setTiers((list) => {
      const prev = list.length > 1 ? Number(list[list.length - 2].maxUsd) || 0 : 0;
      return [...list.slice(0, -1), { maxUsd: String(prev + 50), percent: list[list.length - 1].percent }, list[list.length - 1]];
    });
  }
  function removeTier(i) {
    setTiers((list) => list.filter((_, j) => j !== i));
  }

  async function save() {
    const rate = Number(form.rate);
    if (!Number.isFinite(rate) || rate <= 0) return showToast("Kurs musbat raqam bo'lishi kerak", "err");
    for (const [i, t] of tiers.entries()) {
      const p = Number(t.percent);
      if (t.percent === "" || !Number.isFinite(p) || p < 0 || p >= 100) return showToast("Marja 0–99% bo'lishi kerak", "err");
      if (i < tiers.length - 1) {
        const m = Number(t.maxUsd);
        if (!Number.isFinite(m) || m <= 0) return showToast("Narx chegarasi musbat bo'lishi kerak", "err");
        if (i > 0 && m <= Number(tiers[i - 1].maxUsd)) return showToast("Narx chegaralari o'sib borishi kerak (masalan 10, 50, ...)", "err");
      }
    }
    const payloadTiers = tiers.map((t, i) => ({ maxUsd: i === tiers.length - 1 ? null : Number(t.maxUsd), percent: Number(t.percent) }));
    setSaving(true);
    try {
      const r = await api("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ instantSellMarginTiers: payloadTiers, usdToSomRate: rate, botTradeUrl: form.url.trim() }),
      });
      setS(r);
      setTiers(tiersToForm(r.instantSellMarginTiers));
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
      <div className="space-y-2">
        <span className="block text-xs text-muted-foreground">Marja (%) — userga Lis narxidan shuncha arzon to'lanadi. Skin narxiga qarab pog'onali:</span>
        {tiers.map((t, i) => {
          const last = i === tiers.length - 1;
          const from = i === 0 ? 0 : Number(tiers[i - 1].maxUsd) || 0;
          return (
            <div key={i} className="flex items-center gap-2">
              {last ? (
                <span className="w-32 shrink-0 text-xs text-foreground">{tiers.length > 1 ? `${from} $ dan qimmat` : "Hamma narxlar"}</span>
              ) : (
                <span className="flex w-32 shrink-0 items-center gap-1 text-xs text-foreground">
                  <input type="number" inputMode="decimal" value={t.maxUsd} onChange={(e) => setTier(i, "maxUsd", e.target.value)} className={input + " !w-16 !px-2 !py-1.5"} />
                  $ gacha
                </span>
              )}
              <input type="number" inputMode="decimal" value={t.percent} onChange={(e) => setTier(i, "percent", e.target.value)} className={input + " !py-1.5"} />
              <span className="text-xs text-muted-foreground">%</span>
              {!last ? (
                <button type="button" onClick={() => removeTier(i)} className="shrink-0 p-1.5 text-muted-foreground hover:text-destructive" aria-label="O'chirish">
                  <Trash2 className="size-4" />
                </button>
              ) : <span className="w-7 shrink-0" />}
            </div>
          );
        })}
        <button type="button" onClick={addTier} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
          <Plus className="size-3.5" /> Pog'ona qo'shish
        </button>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Dollar kursi (1 $ = ? so'm)</span>
        <input type="number" inputMode="numeric" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Bizning Steam trade link (userlar skinni shunga yuboradi)</span>
        <input type="text" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&token=..." className={input} />
      </label>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        {[5, 30, 100].map((usd) => (
          <p key={usd}>
            Misol: Lis narxi {usd} $ bo'lsa (× {SELL_PRICE_RATIO}, {marginFor(usd, tiers)}% marja), userga {fmtMoney(Math.floor(usd * SELL_PRICE_RATIO * (Number(form.rate) || 0) * (1 - marginFor(usd, tiers) / 100)))} to'lanadi.
          </p>
        ))}
      </div>
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
