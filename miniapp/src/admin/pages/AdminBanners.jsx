import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Trash2, GripVertical, Plus, Link2, Save } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { hap, imgSrc, confirmTg } from "../../utils";
import BackLink from "../../components/BackLink";
import Empty from "../../components/Empty";
import { CardRowsSkeleton } from "../../components/Skeleton";

const LINK_PAGES = [
  { value: "", label: "Havola yo'q" },
  { value: "auctions", label: "Auksionlar sahifasi" },
  { value: "trade", label: "Obmen (P2P Savdo) sahifasi" },
  { value: "balance", label: "Balans sahifasi" },
  { value: "leaderboard", label: "Reyting sahifasi" },
  { value: "inventory", label: "Inventar sahifasi" },
  { value: "auction-detail", label: "Muayyan auksion (Lot ID)" },
  { value: "trade-detail", label: "Muayyan obmen (Trade ID)" },
];
const LINK_NEEDS_DATA = ["auction-detail", "trade-detail"];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readImageSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export default function AdminBanners() {
  const { navigate, showToast } = useApp();
  const [banners, setBanners] = useState(null);
  const [requiredSize, setRequiredSize] = useState(null);
  const [error, setError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [savingLinkId, setSavingLinkId] = useState(null);
  const [linkDrafts, setLinkDrafts] = useState({});
  const dragFrom = useRef(null);
  const fileRef = useRef(null);

  function load() {
    api("/api/admin/banners").then((r) => {
      setBanners(r.banners || []);
      setRequiredSize(r.requiredSize);
      const drafts = {};
      for (const b of r.banners || []) drafts[b.id] = { linkPage: b.linkPage || "", linkData: b.linkData ?? "" };
      setLinkDrafts(drafts);
    }).catch(() => setError(true));
  }
  useEffect(load, []);

  function setDraft(id, patch) {
    setLinkDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  async function saveLink(id) {
    const draft = linkDrafts[id] || { linkPage: "", linkData: "" };
    setSavingLinkId(id);
    try {
      const r = await api(`/api/admin/banners/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ linkPage: draft.linkPage || null, linkData: draft.linkData }),
      });
      setBanners(r.banners);
      hap("notif", "success");
      showToast("Havola saqlandi", "ok");
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setSavingLinkId(null);
    }
  }

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return showToast("Faqat rasm fayl tanlang", "err");
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const size = await readImageSize(dataUrl);
      if (requiredSize && (size.width !== requiredSize.width || size.height !== requiredSize.height)) {
        showToast(`Rasm o'lchami ${size.width}x${size.height} — kerakli o'lcham: ${requiredSize.width}x${requiredSize.height}`, "err");
        return;
      }
      const up = await api("/api/admin/upload-image", { method: "POST", body: JSON.stringify({ image: dataUrl }) });
      const r = await api("/api/admin/banners", { method: "POST", body: JSON.stringify({ image: up.fileId }) });
      setBanners(r.banners);
      hap("notif", "success");
      showToast("Banner qo'shildi", "ok");
    } catch (e2) {
      showToast(e2.error || "Yuklashda xato", "err");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id) {
    if (!(await confirmTg("Bu bannerni o'chirmoqchimisiz?"))) return;
    setBusyId(id);
    try {
      const r = await api(`/api/admin/banners/${id}`, { method: "DELETE" });
      setBanners(r.banners);
      hap("notif", "success");
      showToast("O'chirildi", "ok");
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function persistOrder(next) {
    setBanners(next);
    try {
      await api("/api/admin/banners/reorder", { method: "POST", body: JSON.stringify({ order: next.map((b) => b.id) }) });
    } catch (e) {
      showToast(e.error || "Tartibni saqlashda xato", "err");
      load();
    }
  }

  function onDragStart(i) {
    dragFrom.current = i;
  }
  function onDragOver(e) {
    e.preventDefault();
  }
  function onDrop(i) {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from == null || from === i) return;
    const next = banners.slice();
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    persistOrder(next);
  }

  return (
    <div className="space-y-6">
      <BackLink onClick={() => navigate("admin")} label="Admin panelga qaytish" />
      <div>
        <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">Reklama bannerlari</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {requiredSize ? `Rasm o'lchami aynan ${requiredSize.width}x${requiredSize.height} bo'lishi kerak.` : ""} Hech qanday banner bo'lmasa, standart banner ko'rsatiladi. Bir nechta banner bo'lsa, ular navbat bilan aylanadi (nuqtalar bilan). Tartibni o'zgartirish uchun kartani ushlab, boshqa joyga sudrab qo'ying.
        </p>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-border bg-secondary/30 py-4 font-heading text-sm font-bold uppercase tracking-wide text-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
      >
        <Plus className="size-4" />
        {uploading ? "Yuklanmoqda..." : "Yangi banner qo'shish"}
      </button>

      {banners === null && !error && <CardRowsSkeleton rows={2} />}
      {error && <Empty title="Xato yuz berdi" />}
      {banners && banners.length === 0 && (
        <Empty icon={ImageIcon} title="Hozircha banner yo'q" desc="Standart banner ko'rsatilmoqda." />
      )}

      {banners && banners.length > 0 && (
        <div className="space-y-2">
          {banners.map((b, i) => {
            const draft = linkDrafts[b.id] || { linkPage: "", linkData: "" };
            const needsData = LINK_NEEDS_DATA.includes(draft.linkPage);
            return (
              <div
                key={b.id}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={onDragOver}
                onDrop={() => onDrop(i)}
                className="space-y-2 border border-border bg-card p-3 shadow-panel"
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                  <span className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden border border-border bg-secondary/40">
                    <img src={imgSrc(b.image)} alt="" className="size-full object-cover" />
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">{i + 1}-o'rin</span>
                  <button
                    type="button"
                    disabled={busyId === b.id}
                    onClick={() => remove(b.id)}
                    className="flex items-center gap-1.5 bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/25 disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                    O'chirish
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                  <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <select
                    value={draft.linkPage}
                    onChange={(e) => setDraft(b.id, { linkPage: e.target.value })}
                    className="border border-border bg-secondary px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                  >
                    {LINK_PAGES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  {needsData && (
                    <input
                      type="number"
                      inputMode="numeric"
                      value={draft.linkData}
                      onChange={(e) => setDraft(b.id, { linkData: e.target.value })}
                      placeholder={draft.linkPage === "auction-detail" ? "Lot ID" : "Trade ID"}
                      className="w-28 border border-border bg-secondary px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                    />
                  )}
                  <button
                    type="button"
                    disabled={savingLinkId === b.id || (needsData && !draft.linkData)}
                    onClick={() => saveLink(b.id)}
                    className="ml-auto flex items-center gap-1.5 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                  >
                    <Save className="size-3.5" />
                    Saqlash
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
