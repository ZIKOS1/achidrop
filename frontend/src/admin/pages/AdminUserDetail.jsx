import { useEffect, useState } from "react";
import { Plus, Minus, ShieldOff, ShieldCheck, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { confirmTg, fmtMoney, hap } from "../../utils";
import BackLink from "../../components/BackLink";
import Empty from "../../components/Empty";
import { BlockSkeleton } from "../../components/Skeleton";

export default function AdminUserDetail({ id }) {
  const { navigate, showToast, openModal, closeModal } = useApp();
  const [u, setU] = useState(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    api(`/api/admin/users/${id}`).then(setU).catch(() => setError(true));
  }
  useEffect(load, [id]);

  function openAddBalance() {
    openModal({
      title: "Balans qo'shish",
      inputType: "number",
      placeholder: "Summa kiriting...",
      okLabel: "Qo'shish",
      info: <span className="text-muted-foreground">{u.name} ga qo'shiladigan summa (so'm)</span>,
      onSubmit: async (raw) => {
        const amount = Number(raw);
        if (!amount || amount <= 0) return showToast("Musbat raqam kiriting", "err");
        try {
          await api(`/api/admin/users/${id}/balance`, { method: "POST", body: JSON.stringify({ amount }) });
          closeModal();
          hap("notif", "success");
          showToast("Balans qo'shildi!", "ok");
          load();
        } catch (e) {
          showToast(e.error || "Xato", "err");
        }
      },
    });
  }

  function openSubtractBalance() {
    openModal({
      title: "Balans ayirish",
      inputType: "number",
      placeholder: "Summa kiriting...",
      okLabel: "Ayirish",
      info: <span className="text-muted-foreground">{u.name} dan ayiriladigan summa (so'm)</span>,
      onSubmit: async (raw) => {
        const amount = Number(raw);
        if (!amount || amount <= 0) return showToast("Musbat raqam kiriting", "err");
        try {
          await api(`/api/admin/users/${id}/balance-subtract`, { method: "POST", body: JSON.stringify({ amount }) });
          closeModal();
          hap("notif", "success");
          showToast("Balans ayirildi!", "ok");
          load();
        } catch (e) {
          showToast(e.error || "Xato", "err");
        }
      },
    });
  }

  async function toggleBlock() {
    const ok = await confirmTg(u.blocked ? `${u.name} blokdan chiqarilsinmi?` : `${u.name} bloklansinmi?`);
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/admin/users/${id}/block`, { method: "POST" });
      hap("notif", "success");
      load();
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <BackLink onClick={() => navigate("admin-users")} label="Foydalanuvchilarga qaytish" />

      {!u && !error && <BlockSkeleton avatar lines={3} />}
      {error && <Empty title="Xato yuz berdi" />}

      {u && (
        <>
          <div className="border border-border bg-card p-6 text-center">
            <div className="mx-auto mb-3 flex size-16 items-center justify-center bg-primary font-heading text-xl font-bold text-primary-foreground clip-tactical">
              {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <p className="font-heading text-lg font-bold uppercase tracking-wide text-foreground">
              {u.name}{u.username ? ` (@${u.username})` : ""}
            </p>
            <p className="text-xs text-muted-foreground">ID: {u.id}</p>
            <span className={"mt-2 inline-flex border px-3 py-1 text-xs font-semibold uppercase tracking-wide " + (u.blocked ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-success/40 bg-success/10 text-success")}>
              {u.blocked ? "Bloklangan" : "Aktiv"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Balans" value={fmtMoney(u.balance || 0)} />
            <Stat label="Yutishlar" value={(u.wins || []).length} />
            <Stat label="Trade Link" value={u.tradeLink ? <CheckCircle2 className="mx-auto size-5 text-success" /> : <XCircle className="mx-auto size-5 text-destructive" />} />
          </div>

          <div className="border border-border bg-card p-4 text-sm">
            <Row label="Botga qo'shilgan" value={u.joined ? new Date(u.joined).toLocaleString("uz-UZ") : "Noma'lum"} />
            <Row
              label="Steam"
              value={
                u.steamId64 ? (
                  <a href={`https://steamcommunity.com/profiles/${u.steamId64}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                    {u.steamId64} <ExternalLink className="size-3" />
                  </a>
                ) : "Ulanmagan"
              }
            />
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={openAddBalance} className="flex flex-1 items-center justify-center gap-2 bg-primary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground">
              <Plus className="size-4" />
              Qo'shish
            </button>
            <button type="button" onClick={openSubtractBalance} className="flex flex-1 items-center justify-center gap-2 border border-border bg-secondary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-foreground">
              <Minus className="size-4" />
              Ayirish
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={toggleBlock}
            className={"flex w-full items-center justify-center gap-2 py-2.5 font-heading text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-50 " + (u.blocked ? "bg-success/15 text-success hover:bg-success/25" : "bg-destructive/15 text-destructive hover:bg-destructive/25")}
          >
            {u.blocked ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}
            {u.blocked ? "Blokdan chiqarish" : "Bloklash"}
          </button>

          {u.wins?.length > 0 && (
            <div className="border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">Yutishlar</h2>
              </div>
              <ul className="divide-y divide-border">
                {u.wins.map((w, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-foreground">{w.lotName}</span>
                    <span className="font-heading font-bold text-primary">{fmtMoney(w.price || 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="border border-border bg-card p-3 text-center">
      <p className="font-heading text-lg font-bold text-foreground">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
