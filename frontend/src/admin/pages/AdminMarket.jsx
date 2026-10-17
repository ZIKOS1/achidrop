import { useEffect, useState } from "react";
import { ShoppingCart, RefreshCw, Wand2, PackageOpen } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { fmtMoney, hap, imgSrc, rarityColor } from "../../utils";
import BackLink from "../../components/BackLink";
import Empty from "../../components/Empty";
import { TextCardsSkeleton } from "../../components/Skeleton";

const MIN_PRICE = 999;
const inputCls = "w-full border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary";
const labelCls = "mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground";

export default function AdminMarket() {
  const { navigate, showToast } = useApp();
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [price, setPrice] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [busy, setBusy] = useState(false);

  function load(force = false) {
    if (force) setRefreshing(true);
    api(`/api/admin/steam-inventory-grouped${force ? "?refresh=1" : ""}`)
      .then((g) => { setGroups(g); setError(false); })
      .catch(() => setError(true))
      .finally(() => setRefreshing(false));
  }
  useEffect(load, []);

  function selectGroup(g) {
    hap("impact");
    setSelected(g);
    setPrice("");
  }

  async function suggestPrice() {
    setSuggesting(true);
    try {
      const r = await api(`/api/admin/list-price?marketHashName=${encodeURIComponent(selected.marketHashName)}`);
      if (r.priceSom != null) {
        setPrice(String(Math.round(r.priceSom)));
        hap("notif", "success");
      } else {
        showToast("Lis-Skins'da narx topilmadi", "err");
      }
    } catch (e) {
      showToast(e.error || "Narx taklifini olishda xato", "err");
      hap("notif", "error");
    } finally {
      setSuggesting(false);
    }
  }

  async function submitBulkList() {
    const numPrice = Number(price);
    if (!Number.isFinite(numPrice) || numPrice < MIN_PRICE) {
      return showToast(`Minimal narx ${fmtMoney(MIN_PRICE)}`, "err");
    }
    setBusy(true);
    try {
      const r = await api("/api/admin/market-bulk-list", {
        method: "POST",
        body: JSON.stringify({ assetIds: selected.items.map((i) => i.assetId), price: numPrice }),
      });
      hap("notif", "success");
      showToast(`${r.created?.length ?? 0} ta e'lon yaratildi!`, "ok");
      setSelected(null);
      setPrice("");
      load();
    } catch (e) {
      showToast(e.error || "Sotuvga qo'yishda xato", "err");
      hap("notif", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <BackLink onClick={() => navigate("admin")} label="Admin panelga qaytish" />
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
          Market — bot inventaridan sotuvga qo'yish
        </h1>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => load(true)}
          className="inline-flex items-center gap-1.5 border border-border bg-secondary px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={"size-3.5" + (refreshing ? " animate-spin" : "")} />
          Yangilash
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Bot Steam akkauntidagi bir xil nom + wear'ga ega skinlar guruhlab ko'rsatiladi — bittasiga narx
        belgilab, hammasini birdaniga Market'ga sotuvga chiqarishingiz mumkin.
      </p>

      {groups === null && !error && <TextCardsSkeleton />}
      {error && <Empty title="Steam inventarni olishda xato" />}
      {groups && groups.length === 0 && <Empty icon={PackageOpen} title="Bot inventarida sotiladigan item yo'q" />}

      {groups && groups.length > 0 && (
        <div className="space-y-3">
          {groups.map((g, i) => {
            const active = selected === g;
            const rarity = g.items?.[0]?.rarity;
            const image = g.items?.[0]?.image;
            return (
              <button
                key={i}
                type="button"
                onClick={() => selectGroup(g)}
                className={
                  "flex w-full items-center gap-3 border p-3 text-left transition-colors " +
                  (active ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-secondary/40")
                }
              >
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: rarityColor(rarity) }} title={rarity || "Noma'lum rarity"} />
                {image && (
                  <img src={imgSrc(image)} alt="" className="size-10 shrink-0 border border-border bg-background object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {g.name} {g.wear ? `(${g.wear})` : ""}
                  </span>
                </span>
                <span className="shrink-0 border border-border bg-secondary px-2 py-0.5 text-xs font-bold text-foreground">
                  {g.count} ta
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="max-w-lg space-y-4 border border-border bg-card p-5">
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              {selected.name} {selected.wear ? `(${selected.wear})` : ""}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{selected.count} ta nusxa birdaniga sotuvga chiqariladi</p>
          </div>

          <div>
            <label className={labelCls}>Narx (har bir nusxa uchun, so'm)</label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Masalan: 150000"
                className={inputCls + " flex-1"}
              />
              <button
                type="button"
                disabled={suggesting}
                onClick={suggestPrice}
                className="inline-flex shrink-0 items-center gap-1.5 border border-border bg-secondary px-3 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <Wand2 className={"size-3.5" + (suggesting ? " animate-pulse" : "")} />
                Lis narxidan taklif qil
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Minimal narx: {fmtMoney(MIN_PRICE)}</p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(null)}
              className="border border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              disabled={busy || !price}
              onClick={submitBulkList}
              className="flex flex-1 items-center justify-center gap-2 bg-primary py-3 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-40"
            >
              <ShoppingCart className="size-4" />
              {busy ? "..." : `Hammasini sotuvga qo'yish (${selected.count} ta)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
