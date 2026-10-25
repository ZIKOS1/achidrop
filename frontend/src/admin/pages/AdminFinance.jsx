import { useEffect, useMemo, useState } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Wallet, Clock, Package } from "lucide-react";
import { api } from "../api";
import { fmtMoney } from "../../utils";
import { StatCardsSkeleton, BlockSkeleton } from "../../components/Skeleton";

const CARD = "rounded-xl border border-border bg-card p-4 shadow-panel";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit" }) + " " +
    d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(key) {
  const [, m, d] = key.split("-");
  return `${d}.${m}`;
}
function signed(n) {
  return (n > 0 ? "+" : n < 0 ? "−" : "") + fmtMoney(Math.abs(n));
}

export default function AdminFinance() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState("date");

  async function load() {
    setLoading(true);
    setError(false);
    try { setData(await api("/api/admin/finance")); }
    catch { setError(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const items = useMemo(() => {
    if (!data) return [];
    const list = [...data.items];
    if (sort === "profit") list.sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity));
    if (sort === "loss") list.sort((a, b) => (a.profit ?? Infinity) - (b.profit ?? Infinity));
    return list;
  }, [data, sort]);

  if (error && !data) {
    return (
      <div className={CARD + " text-center text-sm text-muted-foreground"}>
        Ma'lumot yuklanmadi.{" "}
        <button type="button" onClick={load} className="font-bold text-primary">Qayta urinish</button>
      </div>
    );
  }
  if (!data) {
    return <div className="space-y-4"><StatCardsSkeleton /><BlockSkeleton /></div>;
  }

  const owed = data.owed;
  const maxDay = Math.max(1, ...data.daily.map((d) => Math.abs(d.profit)));
  const profitUp = data.profit >= 0;

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">Moliya</h1>
          <p className="text-xs text-muted-foreground">
            Skin sotish · Lis avtobuy = Lis narxi × {data.ratio} · kurs {fmtMoney(data.rate)} / $
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={"size-3.5" + (loading ? " animate-spin" : "")} />
          Yangilash
        </button>
      </div>

      {!data.lisConfigured && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          LIS_SKINS_API_KEY sozlanmagan — Lis narxlari va foyda hisoblanmaydi.
        </div>
      )}

      {/* Lis − To'langan = Foyda */}
      <div className={CARD}>
        <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <div>
            <div className={LABEL}>Lis avtobuy (taxminiy)</div>
            <div className="font-heading text-2xl font-bold text-foreground">{fmtMoney(data.lisTotal)}</div>
          </div>
          <div className="hidden font-heading text-2xl text-muted-foreground sm:block">−</div>
          <div>
            <div className={LABEL}>To'langan (Lis narxi bor skinlar)</div>
            <div className="font-heading text-2xl font-bold text-foreground">{fmtMoney(data.pricedPaid)}</div>
          </div>
          <div className="hidden font-heading text-2xl text-muted-foreground sm:block">=</div>
          <div className={"rounded-lg p-3 " + (profitUp ? "bg-success/10" : "bg-destructive/10")}>
            <div className={LABEL}>Taxminiy foyda</div>
            <div className={"flex items-center gap-2 font-heading text-3xl font-bold " + (profitUp ? "text-success" : "text-destructive")}>
              {profitUp ? <TrendingUp className="size-6" /> : <TrendingDown className="size-6" />}
              {signed(data.profit)}
            </div>
            {data.marginPercent != null && (
              <div className="text-xs text-muted-foreground">marja {data.marginPercent > 0 ? "+" : ""}{data.marginPercent}%</div>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm sm:grid-cols-4">
          <Mini label="Olingan skinlar" value={data.skins} />
          <Mini label="So'rovlar" value={data.requests} />
          <Mini label="Jami to'langan" value={fmtMoney(data.paid)} />
          <Mini label="Kutmoqda (admin)" value={data.awaiting} />
        </div>
        {data.missingLis > 0 && (
          <p className="mt-2 text-xs text-warning">Lis narxi topilmagan: {data.missingLis} ta skin (foydaga qo'shilmagan)</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* To'lanishi kerak */}
        <div className={CARD}>
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-primary" />
            <span className={LABEL}>To'lanishi kerak</span>
          </div>
          <div className="mt-1 font-heading text-3xl font-bold text-foreground">{fmtMoney(owed.total)}</div>
          <div className="text-xs text-muted-foreground">{owed.users} kishi</div>
          <OwedBar owed={owed} />
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <Legend color="bg-muted-foreground" label="Hold (muzlatilgan)" value={owed.frozen} />
            <Legend color="bg-success" label="Yechsa bo'ladi" value={owed.available} />
            <Legend color="bg-warning" label="So'rov jarayonida" value={owed.pending} />
          </div>
          {owed.nextUnlockAt && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> Eng yaqin ochilish: {fmtDate(owed.nextUnlockAt)}
            </div>
          )}
        </div>

        {/* Kunlik foyda */}
        <div className={CARD}>
          <span className={LABEL}>Kunlik foyda</span>
          {data.daily.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">Hali ma'lumot yo'q</p>
          ) : (
            <div className="mt-3 flex h-40 items-end gap-1.5 overflow-x-auto">
              {data.daily.map((d) => {
                const h = Math.max(4, Math.round((Math.abs(d.profit) / maxDay) * 120));
                return (
                  <div key={d.date} className="flex min-w-7 flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.items} skin, to'langan ${fmtMoney(d.paid)}, foyda ${signed(d.profit)}`}>
                    <div className={"w-full rounded-t-md " + (d.profit >= 0 ? "bg-success/80" : "bg-destructive/80")} style={{ height: h }} />
                    <span className="text-[10px] text-muted-foreground">{fmtDay(d.date)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Kimga to'lanadi */}
      {owed.list.length > 0 && (
        <div className={CARD}>
          <span className={LABEL}>Kimga to'lanadi</span>
          <div className="mt-2 divide-y divide-border">
            {owed.list.map((u) => (
              <div key={u.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{u.name || `#${u.userId}`}</div>
                  <div className="text-xs text-muted-foreground">
                    {u.available > 0 && <span className="text-success">yechsa bo'ladi {fmtMoney(u.available)} · </span>}
                    {u.pending > 0 && <span className="text-warning">so'rovda {fmtMoney(u.pending)} · </span>}
                    {u.frozen > 0 && <>hold {fmtMoney(u.frozen)}{u.nextUnlockAt ? ` (${fmtDate(u.nextUnlockAt)})` : ""}</>}
                  </div>
                </div>
                <div className="shrink-0 font-heading font-bold text-foreground">{fmtMoney(u.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skinlar jadvali */}
      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2"><Package className="size-4 text-primary" /><span className={LABEL}>Olingan skinlar</span></span>
          <div className="flex gap-1">
            {[["date", "Sana"], ["profit", "Foyda"], ["loss", "Zarar"]].map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={"rounded-lg px-2.5 py-1 text-xs font-medium uppercase " + (sort === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/60")}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-medium">Skin</th>
                <th className="py-2 font-medium">Sana</th>
                <th className="py-2 text-right font-medium">To'langan</th>
                <th className="py-2 text-right font-medium">Lis avtobuy</th>
                <th className="py-2 text-right font-medium">Foyda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it, i) => (
                <tr key={it.requestId + "-" + i}>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2">
                      {it.imageUrl && <img src={it.imageUrl} alt="" className="size-9 shrink-0 rounded-md bg-secondary object-contain" loading="lazy" />}
                      <div className="min-w-0">
                        <div className="truncate text-foreground">{it.name}{it.phase ? ` · ${it.phase}` : ""}</div>
                        <div className="truncate text-xs text-muted-foreground">{it.userName || `#${it.userId}`}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2 text-xs text-muted-foreground">{fmtDate(it.at)}</td>
                  <td className="whitespace-nowrap py-2 text-right">{fmtMoney(it.paid)}</td>
                  <td className="whitespace-nowrap py-2 text-right">{it.lis == null ? <span className="text-xs text-warning">Lis narxi yo'q</span> : fmtMoney(it.lis)}</td>
                  <td className={"whitespace-nowrap py-2 text-right font-bold " + (it.profit == null ? "text-muted-foreground" : it.profit >= 0 ? "text-success" : "text-destructive")}>
                    {it.profit == null ? "—" : signed(it.profit)}
                    {it.profit != null && it.paid > 0 && (
                      <div className="text-[10px] font-normal">{Math.round((it.profit / it.paid) * 100)}%{it.profit < 0 ? " · Zarar" : ""}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Hali skin olinmagan</p>}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-heading text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}

function OwedBar({ owed }) {
  const total = owed.total || 1;
  const seg = (v, c) => v > 0 && <div className={c} style={{ width: `${(v / total) * 100}%` }} />;
  return (
    <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-secondary">
      {seg(owed.available, "bg-success")}
      {seg(owed.pending, "bg-warning")}
      {seg(owed.frozen, "bg-muted-foreground/60")}
    </div>
  );
}

function Legend({ color, label, value }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted-foreground"><span className={"size-2 rounded-full " + color} />{label}</div>
      <div className="font-heading font-bold text-foreground">{fmtMoney(value)}</div>
    </div>
  );
}
