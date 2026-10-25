import { useEffect, useState } from "react";
import { Plus, Pause, Play, Trash2, Ticket, Wallet, Repeat, Banknote } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { hap, confirmTg } from "../../utils";
import BackLink from "../../components/BackLink";
import Empty from "../../components/Empty";
import { TextCardsSkeleton } from "../../components/Skeleton";

export default function AdminPromos() {
  const { navigate, showToast } = useApp();
  const [list, setList] = useState(null);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyCode, setBusyCode] = useState(null);
  const [code, setCode] = useState("");
  const [maxUse, setMaxUse] = useState("");
  const [type, setType] = useState("balance");
  const [bonusPercent, setBonusPercent] = useState("15");
  const [perUserLimit, setPerUserLimit] = useState("1");
  const [unlockSom, setUnlockSom] = useState("");

  function load() {
    api("/api/admin/promos").then(setList).catch(() => setError(true));
  }
  useEffect(load, []);

  async function createPromo(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setCreating(true);
    try {
      await api("/api/admin/promos", {
        method: "POST",
        body: JSON.stringify({
          code,
          type,
          maxUse: maxUse ? Number(maxUse) : null,
          bonusPercent: type === "balance" ? Number(bonusPercent) : undefined,
          unlockSom: type === "withdraw" ? Number(unlockSom) : undefined,
          perUserLimit: perUserLimit.trim() ? Number(perUserLimit) : 0,
        }),
      });
      hap("notif", "success");
      showToast("Promo kod yaratildi", "ok");
      setCode("");
      setMaxUse("");
      setBonusPercent("15");
      setPerUserLimit("1");
      setUnlockSom("");
      load();
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(p) {
    setBusyCode(p.code);
    try {
      const r = await api(`/api/admin/promos/${p.code}/toggle`, { method: "POST" });
      setList((l) => l.map((x) => (x.code === p.code ? r.promo : x)));
      hap("notif", "success");
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setBusyCode(null);
    }
  }

  async function remove(p) {
    if (!(await confirmTg(`"${p.code}" kodini o'chirmoqchimisiz?`))) return;
    setBusyCode(p.code);
    try {
      await api(`/api/admin/promos/${p.code}`, { method: "DELETE" });
      hap("notif", "success");
      showToast("O'chirildi", "ok");
      setList((l) => l.filter((x) => x.code !== p.code));
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setBusyCode(null);
    }
  }

  return (
    <div className="space-y-6">
      <BackLink onClick={() => navigate("admin")} label="Admin panelga qaytish" />
      <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">Promo kodlar</h1>

      <form onSubmit={createPromo} className="space-y-3 border border-border bg-card p-5">
        <p className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">Yangi promo kod</p>

        <div className="flex border border-border bg-secondary/30 p-1">
          <button
            type="button"
            onClick={() => setType("balance")}
            className={"flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold uppercase tracking-wide transition-colors " + (type === "balance" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            <Wallet className="size-3.5" />
            Balans bonusi
          </button>
          <button
            type="button"
            onClick={() => setType("trade")}
            className={"flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold uppercase tracking-wide transition-colors " + (type === "trade" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            <Repeat className="size-3.5" />
            Obmen (tekin)
          </button>
          <button
            type="button"
            onClick={() => setType("withdraw")}
            className={"flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold uppercase tracking-wide transition-colors " + (type === "withdraw" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            <Banknote className="size-3.5" />
            Pul yechish
          </button>
        </div>

        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Kod (masalan: SUMMER25)"
          maxLength={15}
          className="w-full border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
        />

        {type === "balance" ? (
          <input
            type="number"
            inputMode="numeric"
            value={bonusPercent}
            onChange={(e) => setBonusPercent(e.target.value)}
            placeholder="Bonus foizi (masalan 15)"
            className="w-full border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
          />
        ) : null}

        {type === "withdraw" ? (
          <div>
            <input
              type="number"
              inputMode="numeric"
              value={unlockSom}
              onChange={(e) => setUnlockSom(e.target.value)}
              placeholder="Holdsiz ochiladigan summa, so'm (masalan 2000000)"
              className="w-full border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">Kod kiritilsa, muzlatilgan puldan shu summagacha darhol yechib olsa bo'ladigan bo'ladi.</p>
          </div>
        ) : null}

        <input
          type="number"
          inputMode="numeric"
          value={maxUse}
          onChange={(e) => setMaxUse(e.target.value)}
          placeholder={type === "trade" ? "Nechta obmen tekin bo'ladi (majburiy)" : "Maksimal foydalanish soni (bo'sh — cheksiz)"}
          className="w-full border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
        />
        <div>
          <input
            type="number"
            inputMode="numeric"
            value={perUserLimit}
            onChange={(e) => setPerUserLimit(e.target.value)}
            placeholder="Bir kishi nechi marta ishlata oladi (default 1)"
            className="w-full border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">0 yoki bo'sh — bitta kishi cheksiz marta ishlatishi mumkin.</p>
        </div>
        <button
          type="submit"
          disabled={creating || !code.trim()}
          className="flex w-full items-center justify-center gap-2 bg-primary py-3 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-40"
        >
          <Plus className="size-4" />
          {creating ? "..." : "Yaratish"}
        </button>
      </form>

      {list === null && !error && <TextCardsSkeleton />}
      {error && <Empty title="Xato yuz berdi" />}
      {list && list.length === 0 && <Empty icon={Ticket} title="Hozircha promo kod yo'q" />}

      {list && list.length > 0 && (
        <div className="space-y-3">
          {list.map((p) => (
            <div key={p.code} className="border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 font-heading text-base font-bold text-foreground">
                  {p.type === "trade" ? <Repeat className="size-3.5 shrink-0" /> : p.type === "withdraw" ? <Banknote className="size-3.5 shrink-0" /> : <Wallet className="size-3.5 shrink-0" />}
                  {p.code}
                </p>
                <span className={"shrink-0 border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " + (p.active ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground")}>
                  {p.active ? "Aktiv" : "Nofaol"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.type === "trade"
                  ? `Tekin obmenlar: ${p.usedCount ?? 0}/${p.maxUse} ishlatilgan`
                  : p.type === "withdraw"
                  ? `Pul yechish: ${(p.unlockSom ?? 0).toLocaleString()} so'mgacha holdsiz · Ishlatilgan: ${p.usedCount ?? 0} marta · Limit: ${p.maxUse ? `${p.maxUse} ta` : "Cheksiz"}`
                  : `Bonus: ${p.bonus}% · Ishlatilgan: ${(p.usedBy || []).length} marta · Limit: ${p.maxUse ? `${p.maxUse} ta` : "Cheksiz"}`}
                {" · "}Bir kishi: {p.perUserLimit > 0 ? `${p.perUserLimit} marta` : "cheksiz"}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busyCode === p.code}
                  onClick={() => toggle(p)}
                  className="flex flex-1 items-center justify-center gap-1.5 border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {p.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  {p.active ? "Pauza" : "Yoqish"}
                </button>
                <button
                  type="button"
                  disabled={busyCode === p.code}
                  onClick={() => remove(p)}
                  className="flex flex-1 items-center justify-center gap-1.5 bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/25 disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                  O'chirish
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
