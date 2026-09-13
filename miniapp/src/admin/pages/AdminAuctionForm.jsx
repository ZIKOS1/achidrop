import { useEffect, useRef, useState } from "react";
import { Target, RefreshCw, ImagePlus, X, PackageOpen, Lock, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { hap, imgSrc, rarityColor, wearName } from "../../utils";
import BackLink from "../../components/BackLink";
import { BlockSkeleton, ListSkeleton } from "../../components/Skeleton";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputCls = "w-full border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary";
const labelCls = "mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground";

export default function AdminAuctionForm({ id }) {
  const { navigate, showToast } = useApp();
  const isEdit = !!id;
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ name: "", price: "", minBid: "1000", image: "", endTime: "", earlyAccessMinutes: "", tradeBanDays: "", statTrak: false });
  const [earlyAccessEnabled, setEarlyAccessEnabled] = useState(true);
  const fileRef = useRef(null);

  const [steamPanelOpen, setSteamPanelOpen] = useState(false);
  const [steamItems, setSteamItems] = useState(null);
  const [steamLoading, setSteamLoading] = useState(false);
  const [steamQuery, setSteamQuery] = useState("");
  const [steamSelected, setSteamSelected] = useState(null);
  const [floatData, setFloatData] = useState(null);
  const [floatError, setFloatError] = useState("");

  useEffect(() => {
    api("/api/admin/settings").then((s) => setEarlyAccessEnabled(s.earlyAccessEnabled)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api("/api/admin/auctions").then((list) => {
      const a = list.find((x) => x.id === id);
      if (a) {
        setForm({ name: a.name, price: String(a.price), minBid: String(a.minBid ?? 1000), image: a.image || "", endTime: toLocalInput(a.endTime), earlyAccessMinutes: "", tradeBanDays: a.tradeBanDays ? String(a.tradeBanDays) : "", statTrak: !!a.statTrak });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function pickFromGallery(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return showToast("Faqat rasm fayl tanlang", "err");
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const r = await api("/api/admin/upload-image", { method: "POST", body: JSON.stringify({ image: dataUrl }) });
      set("image", r.fileId);
      hap("notif", "success");
      showToast("Rasm yuklandi!", "ok");
    } catch (e2) {
      showToast(e2.error || "Rasm yuklashda xato", "err");
      hap("notif", "error");
    } finally {
      setUploading(false);
    }
  }

  async function loadSteamInventory(force = false) {
    setSteamLoading(true);
    try {
      setSteamItems(await api(`/api/admin/steam-inventory${force ? "?refresh=1" : ""}`));
    } catch (e) {
      showToast(e.error || "Steam inventarni olishda xato", "err");
    } finally {
      setSteamLoading(false);
    }
  }

  function toggleSteamPanel() {
    const next = !steamPanelOpen;
    setSteamPanelOpen(next);
    if (next && steamItems === null) loadSteamInventory();
  }

  function pickSteamItem(item) {
    set("name", item.name);
    set("image", item.image);
    setSteamSelected({ assetId: item.assetId, inspectLink: item.inspectLink, rarity: item.rarity ?? null });
    setSteamPanelOpen(false);
    if (item.float != null) {
      setFloatData({ float: item.float, paintSeed: item.paintSeed, stickers: item.stickers });
      setFloatError("");
    } else {
      setFloatData(null);
      setFloatError("Bu item uchun float ma'lumoti mavjud emas (eski format)");
    }
  }

  const filteredSteamItems = steamItems
    ? steamItems.filter((it) => !steamQuery.trim() || it.name.toLowerCase().includes(steamQuery.trim().toLowerCase()))
    : [];

  async function submit() {
    if (!form.name.trim()) return showToast("Nom kiriting", "err");
    if (!form.price || Number(form.price) <= 0) return showToast("Narxni to'g'ri kiriting", "err");
    if (!form.minBid || Number(form.minBid) <= 0) return showToast("Minimal bidni to'g'ri kiriting", "err");

    const payload = {
      name: form.name.trim(),
      price: Number(form.price),
      minBid: Number(form.minBid),
      image: form.image.trim() || null,
      endTime: form.endTime ? new Date(form.endTime).toISOString() : null,
      tradeBanDays: form.tradeBanDays ? Number(form.tradeBanDays) : null,
      statTrak: form.statTrak,
    };

    setBusy(true);
    try {
      if (isEdit) {
        await api(`/api/admin/auctions/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        payload.earlyAccessMinutes = form.earlyAccessMinutes ? Number(form.earlyAccessMinutes) : null;
        if (steamSelected) {
          payload.assetId = steamSelected.assetId;
          payload.inspectLink = steamSelected.inspectLink;
          payload.float = floatData?.float ?? null;
          payload.paintSeed = floatData?.paintSeed ?? null;
          payload.paintIndex = floatData?.paintIndex ?? null;
          payload.stickers = floatData?.stickers ?? [];
          payload.rarity = steamSelected.rarity ?? null;
        }
        await api("/api/admin/auctions", { method: "POST", body: JSON.stringify(payload) });
      }
      hap("notif", "success");
      showToast(isEdit ? "Yangilandi!" : "Yaratildi!", "ok");
      navigate("admin-auctions");
    } catch (e) {
      showToast(e.error || "Xato", "err");
      hap("notif", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <BackLink onClick={() => navigate("admin-auctions")} label="Auksionlarga qaytish" />
      <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
        {isEdit ? "Auctionni tahrirlash" : "Yangi auction"}
      </h1>

      {loading ? (
        <BlockSkeleton lines={5} />
      ) : (
        <div className="max-w-2xl space-y-5 border border-border bg-card p-5">
          {!isEdit && (
            <div>
              <label className={labelCls}>Steam inventar (ixtiyoriy)</label>
              <button
                type="button"
                onClick={toggleSteamPanel}
                className="flex w-full items-center justify-center gap-2 border border-border bg-secondary py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
              >
                <Target className="size-4" />
                {steamPanelOpen ? "Yopish" : "Steam inventardan tanlash"}
              </button>

              {steamPanelOpen && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <input value={steamQuery} onChange={(e) => setSteamQuery(e.target.value)} placeholder="Skin nomi bo'yicha qidirish..." className={inputCls + " flex-1"} />
                    <button type="button" disabled={steamLoading} onClick={() => loadSteamInventory(true)} className="shrink-0 border border-border bg-secondary px-3 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
                      <RefreshCw className={"size-4" + (steamLoading ? " animate-spin" : "")} />
                    </button>
                  </div>

                  {steamLoading && <ListSkeleton rows={4} showValue={false} />}
                  {!steamLoading && steamItems && filteredSteamItems.length === 0 && (
                    <div className="flex flex-col items-center gap-2 border border-dashed border-border py-8 text-center">
                      <PackageOpen className="size-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Item topilmadi</p>
                    </div>
                  )}
                  {!steamLoading && filteredSteamItems.length > 0 && (
                    <div className="max-h-72 overflow-y-auto border border-border">
                      {filteredSteamItems.map((it) => (
                        <button
                          key={it.assetId}
                          type="button"
                          onClick={() => pickSteamItem(it)}
                          className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-secondary/40"
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: rarityColor(it.rarity) }} title={it.rarity || "Noma'lum rarity"} />
                          <img
                            src={it.image}
                            alt=""
                            className="size-8 shrink-0 border border-border bg-background object-cover"
                            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                          />
                          <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm text-foreground">
                            {!it.tradable && <Lock className="size-3 shrink-0" />}
                            {it.name}
                            {it.float != null && <span className="text-muted-foreground"> · {it.float.toFixed(4)}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {steamSelected && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {floatData ? (
                    <>
                      <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                      {wearName(floatData.float)} · Float {floatData.float.toFixed(4)} · Seed #{floatData.paintSeed}{floatData.stickers?.length ? ` · ${floatData.stickers.length} ta stiker` : ""}{steamSelected?.rarity ? ` · ${steamSelected.rarity}` : ""}
                    </>
                  ) : floatError ? (
                    <>
                      <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                      {floatError}
                    </>
                  ) : null}
                </p>
              )}
            </div>
          )}

          <div>
            <label className={labelCls}>Nomi</label>
            <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Masalan: AK-47 | Redline" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Boshlang'ich narx (so'm)</label>
              <input className={inputCls} type="number" inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="100000" />
            </div>
            <div>
              <label className={labelCls}>Minimal bid qadami</label>
              <input className={inputCls} type="number" inputMode="numeric" value={form.minBid} onChange={(e) => set("minBid", e.target.value)} placeholder="1000" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Rasm (ixtiyoriy)</label>
            {form.image && (
              <div className="relative mb-2">
                <img
                  src={imgSrc(form.image)}
                  alt="preview"
                  className="h-44 w-full border border-border bg-background object-contain"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
                <button type="button" onClick={() => set("image", "")} className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center bg-background/80 text-muted-foreground hover:text-destructive">
                  <X className="size-4" />
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFromGallery} />
            <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 border border-dashed border-border bg-secondary/30 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/60 disabled:opacity-50">
              <ImagePlus className="size-4" />
              {uploading ? "Yuklanmoqda..." : "Galereyadan tanlash"}
            </button>
            <input className={inputCls + " mt-2"} value={form.image} onChange={(e) => set("image", e.target.value)} placeholder="yoki rasm URL manzilini kiriting..." />
          </div>

          <div>
            <label className={labelCls}>Tugash vaqti (ixtiyoriy, bo'sh — cheksiz)</label>
            <input className={inputCls} type="datetime-local" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
          </div>

          <label className="flex items-center gap-2.5 border border-border bg-secondary/30 px-3 py-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.statTrak}
              onChange={(e) => set("statTrak", e.target.checked)}
              className="size-4 accent-primary"
            />
            StatTrak™
          </label>

          <div>
            <label className={labelCls + " flex items-center gap-1"}><Lock className="size-3" /> Trade Ban (kun, ixtiyoriy)</label>
            <input
              className={inputCls}
              type="number"
              inputMode="numeric"
              value={form.tradeBanDays}
              onChange={(e) => set("tradeBanDays", e.target.value)}
              placeholder="Masalan: 7 — bu skinda Steam trade ban bor"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Agar skinda Steam trade-ban bo'lsa, kun sonini kiriting — g'olib Inventarda shuncha kun band ekanini ko'radi.
            </p>
          </div>

          {!isEdit && earlyAccessEnabled && (
            <div>
              <label className={labelCls + " flex items-center gap-1"}><Lock className="size-3" /> Erta kirish (daqiqa, ixtiyoriy)</label>
              <input
                className={inputCls}
                type="number"
                inputMode="numeric"
                value={form.earlyAccessMinutes}
                onChange={(e) => set("earlyAccessMinutes", e.target.value)}
                placeholder="Masalan: 30 — shuncha daqiqa faqat VIP+ bid qo'ya oladi"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Kamida 5 ta yutuqqa ega foydalanuvchilar boshqalardan {form.earlyAccessMinutes || "N"} daqiqa oldin bid qo'ya oladi.
              </p>
            </div>
          )}
          {!isEdit && !earlyAccessEnabled && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5 shrink-0" /> Erta kirish funksiyasi hozir o'chirilgan. Yoqish uchun Admin Panel &gt; Sozlamalarga o'ting.</p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="flex w-full items-center justify-center gap-2 bg-primary py-3 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-40"
          >
            {busy ? "..." : isEdit ? "Saqlash" : "Yaratish"}
          </button>
        </div>
      )}
    </div>
  );
}
