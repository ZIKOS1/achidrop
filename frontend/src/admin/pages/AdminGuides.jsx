import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Trash2, GripVertical, Plus, Save } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { hap, imgSrc, confirmTg } from "../../utils";
import BackLink from "../../components/BackLink";
import Empty from "../../components/Empty";
import { CardRowsSkeleton } from "../../components/Skeleton";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Bitta yo'riqnoma galereyasi (tartiblab bo'ladigan rasmlar ketma-ketligi) —
// sahifada ikki marta (tradeLink va publicInventory uchun) ishlatiladi.
function GuideGallery({ guideKey, title, desc }) {
  const { showToast } = useApp();
  const [images, setImages] = useState(null);
  const [error, setError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [captionDrafts, setCaptionDrafts] = useState({});
  const [savingCaptionId, setSavingCaptionId] = useState(null);
  const dragFrom = useRef(null);
  const fileRef = useRef(null);

  function load() {
    api(`/api/admin/guides/${guideKey}`).then((r) => {
      const list = r.images || [];
      setImages(list);
      const drafts = {};
      for (const im of list) drafts[im.id] = im.caption || "";
      setCaptionDrafts(drafts);
    }).catch(() => setError(true));
  }
  useEffect(load, [guideKey]);

  async function saveCaption(id) {
    setSavingCaptionId(id);
    try {
      const r = await api(`/api/admin/guides/${guideKey}/${id}`, { method: "PATCH", body: JSON.stringify({ caption: captionDrafts[id] || "" }) });
      setImages(r.images);
      hap("notif", "success");
      showToast("Izoh saqlandi", "ok");
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setSavingCaptionId(null);
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
      const up = await api("/api/admin/upload-image", { method: "POST", body: JSON.stringify({ image: dataUrl }) });
      const r = await api(`/api/admin/guides/${guideKey}`, { method: "POST", body: JSON.stringify({ image: up.fileId }) });
      setImages(r.images);
      hap("notif", "success");
      showToast("Rasm qo'shildi", "ok");
    } catch (e2) {
      showToast(e2.error || "Yuklashda xato", "err");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id) {
    if (!(await confirmTg("Bu qadamni o'chirmoqchimisiz?"))) return;
    setBusyId(id);
    try {
      const r = await api(`/api/admin/guides/${guideKey}/${id}`, { method: "DELETE" });
      setImages(r.images);
      hap("notif", "success");
      showToast("O'chirildi", "ok");
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function persistOrder(next) {
    setImages(next);
    try {
      await api(`/api/admin/guides/${guideKey}/reorder`, { method: "POST", body: JSON.stringify({ order: next.map((im) => im.id) }) });
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
    const next = images.slice();
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    persistOrder(next);
  }

  return (
    <div className="space-y-3 border border-border bg-card p-4 shadow-panel">
      <div>
        <h2 className="font-heading text-base font-bold uppercase tracking-wide text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-border bg-secondary/30 py-3 font-heading text-xs font-bold uppercase tracking-wide text-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
      >
        <Plus className="size-4" />
        {uploading ? "Yuklanmoqda..." : "Yangi qadam (rasm) qo'shish"}
      </button>

      {images === null && !error && <CardRowsSkeleton rows={2} />}
      {error && <Empty title="Xato yuz berdi" />}
      {images && images.length === 0 && (
        <Empty icon={ImageIcon} title="Hozircha rasm yo'q" desc="Foydalanuvchilarga yo'riqnoma ko'rsatilmaydi." />
      )}

      {images && images.length > 0 && (
        <div className="space-y-2">
          {images.map((im, i) => (
            <div
              key={im.id}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(i)}
              className="space-y-2 border border-border bg-card p-2.5"
            >
              <div className="flex items-center gap-3">
                <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                <span className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden border border-border bg-secondary/40">
                  <img src={imgSrc(im.image)} alt="" className="size-full object-contain" />
                </span>
                <span className="flex-1 text-sm text-muted-foreground">{i + 1}-qadam</span>
                <button
                  type="button"
                  disabled={busyId === im.id}
                  onClick={() => remove(im.id)}
                  className="flex items-center gap-1.5 bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/25 disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                  O'chirish
                </button>
              </div>
              <div className="flex items-center gap-2 border-t border-border pt-2">
                <input
                  type="text"
                  value={captionDrafts[im.id] ?? ""}
                  onChange={(e) => setCaptionDrafts((d) => ({ ...d, [im.id]: e.target.value }))}
                  placeholder="Bu qadam uchun izoh (ixtiyoriy) — masalan: 'Profil sozlamalariga o'ting'"
                  maxLength={300}
                  className="flex-1 border border-border bg-secondary px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                />
                <button
                  type="button"
                  disabled={savingCaptionId === im.id || (captionDrafts[im.id] ?? "") === (im.caption || "")}
                  onClick={() => saveCaption(im.id)}
                  className="flex shrink-0 items-center gap-1.5 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                >
                  <Save className="size-3.5" />
                  Saqlash
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminGuides() {
  const { navigate } = useApp();

  return (
    <div className="space-y-6">
      <BackLink onClick={() => navigate("admin")} label="Admin panelga qaytish" />
      <div>
        <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">Yo'riqnomalar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Xaridorlarga bosqichma-bosqich ko'rsatiladigan skrinshot yo'riqnomalar. Har bir bo'limga rasmlarni qadam-qadam tartibda yuklang — tartibni o'zgartirish uchun kartani ushlab, boshqa joyga sudrab qo'ying.
        </p>
      </div>

      <GuideGallery
        guideKey="tradeLink"
        title="Trade Link olish yo'riqnomasi"
        desc="Xaridor o'z Steam Trade Link'ini qanday topishini bosqichma-bosqich skrinshotlar bilan ko'rsating."
      />
      <GuideGallery
        guideKey="publicInventory"
        title="Steam inventarni ochiq (public) qilish yo'riqnomasi"
        desc="Xaridor Steam profilidagi inventarni qanday ochiq (public) qilishini bosqichma-bosqich skrinshotlar bilan ko'rsating."
      />
    </div>
  );
}
