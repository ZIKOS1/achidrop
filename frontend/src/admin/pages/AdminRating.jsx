import { useEffect, useState } from "react";
import { Trophy, Flame, TrendingUp, Plus, Square, Trash2, Save, Minus, Users, Gift } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { hap, confirmTg } from "../../utils";
import { cn } from "../../lib/cn";
import BackLink from "../../components/BackLink";
import { TextCardsSkeleton } from "../../components/Skeleton";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("ru-RU").replace(/,/g, " ");
const INPUT = "w-full border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary";
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const BTN = "flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-50";

const TIERS = ["Bronza", "Kumush", "Oltin", "Platina", "Olmos", "Afsona"];
const TIER_KEYS = ["bronze", "silver", "gold", "platinum", "diamond", "legend"];
const TIER_COLORS = ["#CD7F46", "#A9ADB4", "#E8B04B", "#3FC1A5", "#7B83F0", "#FF2A35"];
const STATE_LABEL = { active: "Faol", upcoming: "Rejalashtirilgan", finished: "Yakunlangan" };
const STATE_CLS = { active: "bg-primary text-primary-foreground", upcoming: "bg-warning/20 text-warning", finished: "bg-secondary text-muted-foreground" };

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 16);
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

function Section({ title, icon: Icon, children, right }) {
  return (
    <section className="space-y-3 border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide text-foreground">
          {Icon && <Icon className="size-4 text-primary" />} {title}
        </p>
        {right}
      </div>
      {children}
    </section>
  );
}

function XpFields({ v, set }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label>
        <span className={LABEL}>Har sotuv uchun XP</span>
        <input type="number" min="0" className={INPUT} value={v.xpPerSale} onChange={(e) => set({ ...v, xpPerSale: e.target.value })} />
      </label>
      <label>
        <span className={LABEL}>Har 1000 so'm uchun XP</span>
        <input type="number" min="0" step="0.1" className={INPUT} value={v.xpPer1000Som} onChange={(e) => set({ ...v, xpPer1000Som: e.target.value })} />
      </label>
    </div>
  );
}

function GeneralSettings({ general, onSaved }) {
  const { showToast } = useApp();
  const [v, setV] = useState(general);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(general), [general]);
  async function save() {
    setBusy(true);
    try {
      await api("/api/admin/rating/general", { method: "POST", body: JSON.stringify({ xpPerSale: Number(v.xpPerSale), xpPer1000Som: Number(v.xpPer1000Som), tierMins: v.tierMins.map(Number) }) });
      hap("notif", "success");
      showToast("Saqlandi", "ok");
      onSaved();
    } catch (e) { showToast(e.error || "Xato", "err"); } finally { setBusy(false); }
  }
  const ex = Number(v.xpPerSale || 0) + Math.floor(100 * Number(v.xpPer1000Som || 0));
  return (
    <Section title="Umumiy reyting — XP sozlamalari" icon={TrendingUp}>
      <p className="text-xs text-muted-foreground">Butun vaqt davomidagi barcha tasdiqlangan sotuvlar sanaladi. O'zgartirsangiz, hammaning XP'si yangi qoidaga ko'ra qayta hisoblanadi.</p>
      <XpFields v={v} set={setV} />
      <div>
        <span className={LABEL}>Darajalar (minimal XP)</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TIERS.map((name, i) => (
            <label key={name} className="flex items-center border border-border bg-background">
              <span className="w-[70px] shrink-0 px-2 text-[11px] font-bold uppercase" style={{ color: TIER_COLORS[i] }}>{name}</span>
              <input type="number" min="0" disabled={i === 0} className="w-full min-w-0 bg-transparent px-2 py-2.5 text-sm text-foreground outline-none disabled:opacity-50"
                value={v.tierMins?.[i] ?? 0} onChange={(e) => setV({ ...v, tierMins: v.tierMins.map((x, j) => (j === i ? e.target.value : x)) })} />
            </label>
          ))}
        </div>
        <span className="mt-1 block text-[11px] text-muted-foreground">Avatar ramkasi shu darajaga qarab beriladi (umumiy XP bo'yicha). O'sish tartibida bo'lishi kerak.</span>
      </div>
      <p className="text-[11px] text-muted-foreground">Misol: 100 000 so'mlik sotuv = <b className="text-foreground">{fmt(ex)} XP</b></p>
      <button type="button" disabled={busy} onClick={save} className={cn(BTN, "bg-primary text-primary-foreground")}>
        <Save className="size-3.5" /> Saqlash
      </button>
    </Section>
  );
}

function ContestForm({ contest, onDone, onCancel }) {
  const { showToast } = useApp();
  const editing = !!contest;
  const [v, setV] = useState(() => ({
    title: contest?.title || "",
    prizes: contest?.prizes?.length ? contest.prizes : ["", "", ""],
    startAt: "",
    endAt: toLocalInput(contest?.endAt),
    xpPerSale: contest?.xpPerSale ?? 10,
    xpPer1000Som: contest?.xpPer1000Som ?? 1,
  }));
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        title: v.title, prizes: v.prizes,
        endAt: fromLocalInput(v.endAt),
        xpPerSale: Number(v.xpPerSale), xpPer1000Som: Number(v.xpPer1000Som),
      };
      if (!editing && v.startAt) body.startAt = fromLocalInput(v.startAt);
      await api(editing ? `/api/admin/rating/contests/${contest.id}` : "/api/admin/rating/contests", { method: "POST", body: JSON.stringify(body) });
      hap("notif", "success");
      showToast(editing ? "Saqlandi" : "Konkurs ochildi", "ok");
      onDone();
    } catch (e) { showToast(e.error || "Xato", "err"); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3 border border-primary/40 bg-card p-4 sm:p-5">
      <p className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">{editing ? "Konkursni tahrirlash" : "Yangi konkurs"}</p>
      {!editing && <p className="text-xs text-muted-foreground">Konkurs ochilganda hamma <b className="text-foreground">0 XP</b> dan boshlaydi — faqat boshlanish vaqtidan keyingi sotuvlar sanaladi.</p>}
      <label className="block">
        <span className={LABEL}>Nomi</span>
        <input className={INPUT} value={v.title} maxLength={80} placeholder="Masalan: Noyabr konkursi" onChange={(e) => setV({ ...v, title: e.target.value })} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {!editing && (
          <label>
            <span className={LABEL}>Boshlanish (bo'sh — hozir)</span>
            <input type="datetime-local" className={INPUT} value={v.startAt} onChange={(e) => setV({ ...v, startAt: e.target.value })} />
          </label>
        )}
        <label>
          <span className={LABEL}>Tugash (bo'sh — qo'lda yopiladi)</span>
          <input type="datetime-local" className={INPUT} value={v.endAt} onChange={(e) => setV({ ...v, endAt: e.target.value })} />
        </label>
      </div>
      <XpFields v={v} set={setV} />
      <div className="space-y-2">
        <span className={LABEL}>Sovrinlar (o'rin bo'yicha)</span>
        {v.prizes.map((p, i) => (
          <div key={i} className="flex gap-2">
            <span className="flex w-10 shrink-0 items-center justify-center border border-border font-heading text-sm font-bold text-foreground">#{i + 1}</span>
            <input className={INPUT} value={p} maxLength={120} placeholder="Masalan: AK-47 | Redline" onChange={(e) => setV({ ...v, prizes: v.prizes.map((x, j) => (j === i ? e.target.value : x)) })} />
            <button type="button" aria-label="O'chirish" onClick={() => setV({ ...v, prizes: v.prizes.filter((_, j) => j !== i) })} className="flex w-10 shrink-0 items-center justify-center border border-border text-muted-foreground hover:text-destructive">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {v.prizes.length < 10 && (
          <button type="button" onClick={() => setV({ ...v, prizes: [...v.prizes, ""] })} className="text-xs font-semibold text-primary">+ Sovrin qo'shish</button>
        )}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={cn(BTN, "flex-1 bg-primary text-primary-foreground")}>
          {editing ? <><Save className="size-3.5" /> Saqlash</> : <><Flame className="size-3.5" /> Konkursni ochish</>}
        </button>
        <button type="button" onClick={onCancel} className={cn(BTN, "border border-border text-muted-foreground")}>Bekor</button>
      </div>
    </form>
  );
}

function Ranking({ data, scope, onChanged }) {
  const { showToast } = useApp();
  const [adj, setAdj] = useState({ userId: "", delta: "" });
  const [busy, setBusy] = useState(false);

  async function adjust(userId, delta) {
    if (!userId || !delta) return;
    setBusy(true);
    try {
      await api("/api/admin/rating/adjust", { method: "POST", body: JSON.stringify({ scope, userId: Number(userId), delta: Number(delta) }) });
      hap("notif", "success");
      showToast(`${delta > 0 ? "+" : ""}${delta} XP`, "ok");
      setAdj({ userId: "", delta: "" });
      onChanged();
    } catch (e) { showToast(e.error || "Xato", "err"); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 border border-border bg-secondary/30 p-3">
        <label className="min-w-[140px] flex-1">
          <span className={LABEL}>User ID</span>
          <input className={INPUT} value={adj.userId} onChange={(e) => setAdj({ ...adj, userId: e.target.value })} />
        </label>
        <label className="w-32">
          <span className={LABEL}>XP (+/−)</span>
          <input type="number" className={INPUT} value={adj.delta} placeholder="100 yoki -50" onChange={(e) => setAdj({ ...adj, delta: e.target.value })} />
        </label>
        <button type="button" disabled={busy} onClick={() => adjust(adj.userId, Number(adj.delta))} className={cn(BTN, "bg-primary text-primary-foreground")}>Qo'llash</button>
      </div>

      {data.ranking.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Hali hech kim XP to'plamagan</p>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-secondary/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Foydalanuvchi</th>
                <th className="px-3 py-2 text-right">Sotuv</th>
                <th className="px-3 py-2 text-right">Hajm</th>
                <th className="px-3 py-2 text-right">XP</th>
                <th className="px-3 py-2 text-right">Qo'lda</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.ranking.map((r) => {
                const manual = Number(data.adjustments?.[r.id] || 0);
                return (
                  <tr key={r.id} className="hover:bg-secondary/30">
                    <td className="px-3 py-2 font-heading font-bold text-foreground">{r.rank}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-foreground">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground">ID {r.id}{r.tier ? <> · <span style={{ color: TIER_COLORS[TIER_KEYS.indexOf(r.tier)] }}>{TIERS[TIER_KEYS.indexOf(r.tier)]}</span></> : null}</p>
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">{r.sales}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{fmt(r.volume)} so'm</td>
                    <td className="px-3 py-2 text-right font-heading font-bold text-foreground">{fmt(r.xp)}</td>
                    <td className={cn("px-3 py-2 text-right text-xs", manual > 0 ? "text-success" : manual < 0 ? "text-destructive" : "text-muted-foreground")}>{manual ? (manual > 0 ? "+" : "") + manual : "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button type="button" disabled={busy} aria-label="-10 XP" onClick={() => adjust(r.id, -10)} className="flex size-8 items-center justify-center border border-border text-muted-foreground hover:text-destructive"><Minus className="size-3.5" /></button>
                        <button type="button" disabled={busy} aria-label="+10 XP" onClick={() => adjust(r.id, 10)} className="flex size-8 items-center justify-center border border-border text-muted-foreground hover:text-success"><Plus className="size-3.5" /></button>
                        <button type="button" onClick={() => setAdj({ userId: String(r.id), delta: "" })} className="border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground">Boshqa</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminRating() {
  const { navigate, showToast } = useApp();
  const [scope, setScope] = useState("general");
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [form, setForm] = useState(null); // null | "new" | contest

  function load(s = scope) {
    api(`/api/admin/rating?scope=${encodeURIComponent(s)}`).then(setData).catch(() => setError(true));
  }
  useEffect(() => { load(scope); }, [scope]);

  async function close(c) {
    if (!(await confirmTg(`"${c.title}" konkursini yakunlaysizmi? Natijalar shu paytda qotib qoladi.`))) return;
    try { await api(`/api/admin/rating/contests/${c.id}/close`, { method: "POST" }); hap("notif", "success"); showToast("Yakunlandi", "ok"); load(); }
    catch (e) { showToast(e.error || "Xato", "err"); }
  }
  async function remove(c) {
    if (!(await confirmTg(`"${c.title}" konkursini butunlay o'chirasizmi?`))) return;
    try {
      await api(`/api/admin/rating/contests/${c.id}`, { method: "DELETE" });
      showToast("O'chirildi", "ok");
      if (String(scope) === String(c.id)) setScope("general"); else load();
    } catch (e) { showToast(e.error || "Xato", "err"); }
  }

  const hasOpen = data?.contests.some((c) => c.state !== "finished");
  const scopeContest = data?.contests.find((c) => String(c.id) === String(scope));

  return (
    <div className="space-y-6">
      <BackLink onClick={() => navigate("admin")} label="Admin panelga qaytish" />
      <h1 className="flex items-center gap-2 font-heading text-xl font-bold uppercase tracking-wide text-foreground sm:text-2xl">
        <Trophy className="size-6 text-primary" /> Reyting
      </h1>

      {!data && !error && <TextCardsSkeleton />}
      {error && !data && <p className="text-sm text-destructive">Yuklab bo'lmadi</p>}

      {data && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <GeneralSettings general={data.general} onSaved={() => load()} />

            <Section
              title="Konkurslar"
              icon={Flame}
              right={!form && !hasOpen && (
                <button type="button" onClick={() => setForm("new")} className={cn(BTN, "bg-primary px-3 py-2 text-primary-foreground")}>
                  <Plus className="size-3.5" /> Yangi
                </button>
              )}
            >
              {form && <ContestForm contest={form === "new" ? null : form} onCancel={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
              {data.contests.length === 0 && !form && <p className="py-4 text-sm text-muted-foreground">Hali konkurs ochilmagan.</p>}
              <ul className="space-y-2">
                {data.contests.map((c) => (
                  <li key={c.id} className={cn("border p-3", String(scope) === String(c.id) ? "border-primary" : "border-border")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button type="button" onClick={() => setScope(String(c.id))} className="min-w-0 text-left">
                        <p className="truncate font-semibold text-foreground">{c.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(c.startAt).toLocaleString()} → {c.closedAt ? new Date(c.closedAt).toLocaleString() : c.endAt ? new Date(c.endAt).toLocaleString() : "∞"}
                        </p>
                      </button>
                      <span className={cn("px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", STATE_CLS[c.state])}>{STATE_LABEL[c.state]}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="size-3" /> {c.participants}</span>
                      <span>{c.xpPerSale} XP/sotuv · {c.xpPer1000Som} XP/1000 so'm</span>
                      {c.prizes?.length > 0 && <span className="flex items-center gap-1"><Gift className="size-3" /> {c.prizes.length} sovrin</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => setScope(String(c.id))} className="border border-border px-2.5 py-1 text-[11px] font-semibold uppercase text-foreground">Reyting</button>
                      {c.state !== "finished" && <button type="button" onClick={() => setForm(c)} className="border border-border px-2.5 py-1 text-[11px] font-semibold uppercase text-foreground">Tahrirlash</button>}
                      {c.state !== "finished" && <button type="button" onClick={() => close(c)} className="flex items-center gap-1 border border-border px-2.5 py-1 text-[11px] font-semibold uppercase text-warning"><Square className="size-3" /> Yakunlash</button>}
                      <button type="button" onClick={() => remove(c)} className="flex items-center gap-1 border border-border px-2.5 py-1 text-[11px] font-semibold uppercase text-destructive"><Trash2 className="size-3" /> O'chirish</button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <Section
            title={scope === "general" ? "Umumiy reyting" : `Konkurs: ${scopeContest?.title || ""}`}
            icon={Trophy}
            right={scope !== "general" && (
              <button type="button" onClick={() => setScope("general")} className="text-xs font-semibold text-primary">Umumiyga o'tish</button>
            )}
          >
            <Ranking data={data} scope={scope} onChanged={() => load()} />
          </Section>
        </>
      )}
    </div>
  );
}
