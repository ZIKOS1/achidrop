import { useEffect, useState } from "react";
import { Plus, Minus, ShieldOff, ShieldCheck, ExternalLink, CheckCircle2, XCircle, Package } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { confirmTg, fmtMoney, hap, imgSrc } from "../../utils";
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

          <Activity u={u} />

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

const SELL_STATUS = {
  awaiting_admin: ["Kutilmoqda", "border-amber-500/40 bg-amber-500/10 text-amber-500"],
  credited: ["Pul tushgan", "border-success/40 bg-success/10 text-success"],
  rejected: ["Rad etilgan", "border-destructive/40 bg-destructive/10 text-destructive"],
};
const WD_STATUS = {
  pending: ["Kutilmoqda", "border-amber-500/40 bg-amber-500/10 text-amber-500"],
  approved: ["To'langan", "border-success/40 bg-success/10 text-success"],
  rejected: ["Rad etilgan", "border-destructive/40 bg-destructive/10 text-destructive"],
};
const OFFER_TEXT = {
  queued: "offer navbatda", sending: "offer yuborilmoqda", sent: "offer yuborildi", accepted: "offer qabul qilindi",
  escrow: "offer hold'da", declined: "offer rad etildi", canceled: "offer bekor", expired: "offer muddati o'tdi",
  invalid: "skin topilmadi", failed: "offer yuborilmadi", unknown: "offer holati noma'lum",
};
const fmtDate = (d) => (d ? new Date(d).toLocaleString("uz-UZ", { dateStyle: "short", timeStyle: "short" }) : "—");

function Badge({ map, status }) {
  const [label, cls] = map[status] || [status, "border-border text-muted-foreground"];
  return <span className={"shrink-0 border px-2 py-0.5 text-[11px] font-semibold " + cls}>{label}</span>;
}

// Foydalanuvchi faoliyati: qaysi skinni qachon sotgan, pul yechishlar, balans tarixi.
function Activity({ u }) {
  const [tab, setTab] = useState("sells");
  const sells = u.sells || [];
  const wds = u.withdrawals || [];
  const hist = u.balanceHistory || [];
  const credited = sells.filter((r) => r.status === "credited");
  const soldSom = credited.reduce((n, r) => n + (r.totalSom || 0), 0);
  const paidSom = wds.filter((w) => w.status === "approved").reduce((n, w) => n + (w.amount || 0), 0);
  const tabs = [["sells", `Sotuvlar (${sells.length})`], ["wds", `Pul yechish (${wds.length})`], ["hist", `Balans tarixi (${hist.length})`]];
  return (
    <div className="border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">Faoliyat</h2>
      </div>
      <div className="grid grid-cols-3 gap-px bg-border text-center">
        <div className="bg-card p-3"><p className="font-heading font-bold text-foreground">{credited.reduce((n, r) => n + r.items.length, 0)}</p><p className="text-[11px] text-muted-foreground">Sotilgan skin</p></div>
        <div className="bg-card p-3"><p className="font-heading font-bold text-success">{fmtMoney(soldSom)}</p><p className="text-[11px] text-muted-foreground">Sotuvdan tushgan</p></div>
        <div className="bg-card p-3"><p className="font-heading font-bold text-foreground">{fmtMoney(paidSom)}</p><p className="text-[11px] text-muted-foreground">Yechib olingan</p></div>
      </div>
      <div className="flex border-y border-border text-xs">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={"flex-1 px-2 py-2.5 font-semibold transition-colors " + (tab === k ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "sells" && (sells.length ? (
        <ul className="divide-y divide-border">
          {sells.map((r) => (
            <li key={r.id} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">#{r.groupId} · {fmtDate(r.createdAt)}</span>
                <Badge map={SELL_STATUS} status={r.status} />
              </div>
              {r.items.map((it, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center bg-secondary">
                    {it.imageUrl ? <img src={imgSrc(it.imageUrl)} alt="" className="max-h-full max-w-full object-contain" /> : <Package className="size-4 text-muted-foreground" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{it.name}{it.float != null ? <span className="text-muted-foreground"> · {Number(it.float).toFixed(4)}</span> : null}</span>
                  <span className="shrink-0 font-heading text-sm font-bold text-primary">{fmtMoney(it.priceSom || 0)}</span>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                {r.tradeOffer ? OFFER_TEXT[r.tradeOffer.state] || r.tradeOffer.state : "qo'lda yuborish"}
                {r.resolvedAt ? ` · hal qilingan: ${fmtDate(r.resolvedAt)}` : ""}
                {r.rejectReason ? ` · sabab: ${r.rejectReason}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : <p className="p-4 text-center text-sm text-muted-foreground">Sotuvlar yo'q</p>)}

      {tab === "wds" && (wds.length ? (
        <ul className="divide-y divide-border">
          {wds.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block font-heading font-bold text-foreground">{fmtMoney(w.amount || 0)}</span>
                <span className="block text-[11px] text-muted-foreground">{w.card || "—"} · {fmtDate(w.requestedAt)}{w.rejectComment ? ` · ${w.rejectComment}` : ""}</span>
              </span>
              <Badge map={WD_STATUS} status={w.status} />
            </li>
          ))}
        </ul>
      ) : <p className="p-4 text-center text-sm text-muted-foreground">Pul yechish so'rovlari yo'q</p>)}

      {tab === "hist" && (hist.length ? (
        <ul className="divide-y divide-border">
          {hist.map((h, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-foreground">{h.reason || "—"}</span>
                <span className="block text-[11px] text-muted-foreground">{fmtDate(h.date)}</span>
              </span>
              <span className={"shrink-0 font-heading font-bold " + ((h.amount || 0) >= 0 ? "text-success" : "text-destructive")}>
                {(h.amount || 0) >= 0 ? "+" : ""}{fmtMoney(h.amount || 0)}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="p-4 text-center text-sm text-muted-foreground">Balans tarixi bo'sh</p>)}
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
