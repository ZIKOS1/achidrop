import { Info, Circle } from "lucide-react";

// Float 0 (Factory New) -> 1 (Battle-Scarred) shkalasidagi CS2/Steam
// marketplace uslubidagi rang bosqichlari (ko'k -> yashil -> sariq -> qizil),
// wearClasses/wearColor (utils.js) bilan bir xil chegaralar.
const FLOAT_GRADIENT =
  "linear-gradient(to right, #1acfdf 0%, #37bb62 15%, #f2a618 38%, #f3680f 45%, #ee343b 100%)";

// lis-skins.com'dagi skin detali sahifasiga mos: "Float" yorlig'i (chap) ->
// gradient bar (o'rtada) -> aniq qiymat (o'ng, oq/qalin) — marker bar
// USTIDA joylashgan, pastga qaragan uchburchak (ular qanday qilgan bo'lsa).
function FloatBar({ floatValue }) {
  const pct = Math.min(100, Math.max(0, (floatValue ?? 0) * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-xs text-gray-400">Float</span>
      <div className="relative h-1.5 flex-1 rounded-full" style={{ background: FLOAT_GRADIENT }}>
        <div
          className="absolute bottom-full size-0 mb-0.5"
          style={{
            left: `${pct}%`,
            transform: "translateX(-50%)",
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "6px solid #e8e8e8",
            filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))",
          }}
        />
      </div>
    </div>
  );
}

function StickerSlot({ sticker }) {
  const filled = !!sticker;
  return (
    <div
      className="flex flex-1 flex-col items-center gap-1 rounded-md px-1.5 py-2"
      style={{ backgroundColor: "#1a1d21" }}
    >
      <span className="flex size-7 items-center justify-center sm:size-8">
        {filled && sticker.icon ? (
          <img src={sticker.icon} alt="" className="size-full object-contain" style={{ opacity: filled ? 1 : 0.35 }} />
        ) : (
          <Circle className="size-5 text-gray-600" strokeWidth={1.5} />
        )}
      </span>
      <span className={"text-[10px] font-medium " + (filled ? "text-white" : "text-gray-500")}>
        {filled ? `${sticker.wearPercent}%` : "0%"}
      </span>
      <span className={"text-[10px] " + (filled ? "text-success" : "text-gray-500")}>
        {!filled ? "Пусто" : sticker.price ? sticker.price : "—"}
      </span>
    </div>
  );
}

// Props: floatValue (number, 0..1), stickers (5 ta {icon, wearPercent, price} yoki null bo'sh uchun),
// charm ({icon, name} yoki null — qurolga taqilgan brelok, faqat bitta bo'ladi).
// ESLATMA: relay hozircha charm/brelok ma'lumotini o'qiy olmaydi (Steam GC
// kutubxonasi bu attributni hali ochib bermaydi) — shu sabab charm doim
// bo'sh joy sifatida ko'rinadi, real rasm chiqmaydi (real stiker rasmlari
// kabi keyinroq ulanishi mumkin bo'lgan tayyor joy).
export default function FloatStickersDisplay({ floatValue, stickers = [], charm = null }) {
  const slots = Array.from({ length: 5 }, (_, i) => stickers[i] || null);
  return (
    <div className="space-y-2.5">
      {floatValue != null && <FloatBar floatValue={floatValue} />}
      <div className="flex items-stretch gap-1.5">
        {slots.map((s, i) => (
          <StickerSlot key={i} sticker={s} />
        ))}
        <StickerSlot sticker={charm} />
        <button
          type="button"
          className="flex shrink-0 items-center justify-center rounded-md px-2 text-gray-500 transition-colors hover:text-gray-300"
          style={{ backgroundColor: "#1a1d21" }}
          title="Float, stikerlar va brelok haqida"
        >
          <Info className="size-4" />
        </button>
      </div>
    </div>
  );
}
