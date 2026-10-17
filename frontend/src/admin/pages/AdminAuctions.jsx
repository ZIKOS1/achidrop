import { useEffect, useState } from "react";
import { Plus, Pencil, Ban, Trash2, PackageOpen, Square } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { confirmTg, fmtMoney, hap, imgSrc } from "../../utils";
import BackLink from "../../components/BackLink";
import Empty from "../../components/Empty";
import { TextCardsSkeleton } from "../../components/Skeleton";

const STATUS = {
  active: ["border-success/40 bg-success/10 text-success", "Aktiv"],
  finished: ["border-muted-foreground/40 bg-secondary text-muted-foreground", "Tugagan"],
  cancelled: ["border-destructive/40 bg-destructive/10 text-destructive", "Bekor qilingan"],
};

export default function AdminAuctions() {
  const { navigate, showToast, openModal } = useApp();
  const [list, setList] = useState(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState(null);

  function load() {
    api("/api/admin/auctions").then(setList).catch(() => setError(true));
  }
  useEffect(load, []);

  async function act(id, action) {
    setBusyId(id);
    try {
      await api(`/api/admin/auctions/${id}/${action}`, { method: "POST" });
      hap("notif", "success");
      load();
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function del(id, name) {
    const ok = await confirmTg(`"${name}" o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.`);
    if (!ok) return;
    setBusyId(id);
    try {
      await api(`/api/admin/auctions/${id}`, { method: "DELETE" });
      hap("notif", "success");
      load();
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function openDetail(a) {
    hap("impact");
    const bids = await api(`/api/admin/auctions/${a.id}/bids`).catch(() => []);
    openModal({
      title: a.name,
      viewOnly: true,
      info: (
        <div className="space-y-2">
          {a.image && (
            <img
              src={imgSrc(a.image)}
              alt=""
              className="mb-2 h-40 w-full border border-border bg-background object-contain"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          )}
          <Row label="Yakuniy narx" value={fmtMoney(a.price)} />
          <Row label="G'olib" value={a.lastBidderName || "Yo'q"} />
          <Row label="Holati" value={(STATUS[a.status] || STATUS.finished)[1]} />
          <Row label="Jami stavkalar" value={bids.length} />
          {bids.length > 0 && (
            <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto border-t border-border pt-3">
              {bids.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{b.userName || b.userId}</span>
                  <span className="font-heading font-bold text-foreground">{fmtMoney(b.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    });
  }

  return (
    <div className="space-y-4">
      <BackLink onClick={() => navigate("admin")} label="Admin panelga qaytish" />
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">Auksionlar</h1>
        <button
          type="button"
          onClick={() => navigate("admin-auction-form", null)}
          className="inline-flex items-center gap-1.5 bg-primary px-4 py-2 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground"
        >
          <Plus className="size-4" />
          Yangi
        </button>
      </div>

      {list === null && !error && <TextCardsSkeleton />}
      {error && <Empty title="Xato yuz berdi" />}
      {list && list.length === 0 && <Empty icon={PackageOpen} title="Hozircha auction yo'q" />}

      {list && list.length > 0 && (
        <div className="space-y-3">
          {list.map((a) => {
            const st = STATUS[a.status] || STATUS.finished;
            const disabled = busyId === a.id;
            const clickable = a.status !== "active";
            return (
              <div key={a.id} className="border border-border bg-card p-4">
                <div
                  onClick={clickable ? () => openDetail(a) : undefined}
                  className={clickable ? "cursor-pointer" : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{a.name}</p>
                    <span className={"shrink-0 border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " + st[0]}>{st[1]}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtMoney(a.price)} · min +{fmtMoney(a.minBid ?? 1000)}
                    {clickable && " · Batafsil uchun bosing"}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => navigate("admin-auction-form", a.id)}
                    className="inline-flex items-center gap-1 border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    <Pencil className="size-3.5" />
                    Tahrirlash
                  </button>
                  {a.status === "active" && (
                    <>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => act(a.id, "finish")}
                        className="inline-flex items-center gap-1 bg-warning/15 px-2.5 py-1.5 text-xs font-semibold text-warning transition-colors hover:bg-warning/25 disabled:opacity-50"
                      >
                        <Square className="size-3.5" />
                        Tugatish
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => act(a.id, "cancel")}
                        className="inline-flex items-center gap-1 bg-secondary px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      >
                        <Ban className="size-3.5" />
                        Bekor qilish
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => del(a.id, a.name)}
                    className="inline-flex items-center gap-1 bg-destructive/15 px-2.5 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/25 disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                    O'chirish
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-foreground">{value}</strong>
    </div>
  );
}
