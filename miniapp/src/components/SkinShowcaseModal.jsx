import { X, Package } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { imgSrc, rarityColor } from "../utils";
import { RarityBar, SkinName, WearBadge } from "./SkinBadges";
import FloatStickersDisplay from "./FloatStickersDisplay";

// Obmen (Trade) ichidagi skinga bosilganda — auksion lot sahifasidagi
// "showcase" bilan bir xil ko'rinish (rarity chizig'i, wear/StatTrak belgisi,
// float bar + stikerlar), lekin bidlash paneli yo'q — faqat ko'rish uchun.
export default function SkinShowcaseModal({ skin, onClose }) {
  return (
    <AnimatePresence>
      {skin && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative max-h-[88vh] w-full max-w-md overflow-y-auto border-t border-border bg-card p-5 shadow-panel-lg sm:border"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Yopish"
              className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center border border-border bg-card/90 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>

            <div className="overflow-hidden border border-border bg-card">
              <RarityBar color={rarityColor(skin.rarity)} rarity={skin.rarity} />
              <div
                className="relative aspect-[16/11] bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklch,var(--foreground)_6%,var(--card)),var(--card))]"
                style={{ boxShadow: `inset 0 0 120px -20px ${rarityColor(skin.rarity)}33` }}
              >
                {skin.imageUrl ? (
                  <img
                    src={imgSrc(skin.imageUrl)}
                    alt={skin.name}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                    className="absolute inset-0 size-full object-contain p-8 drop-shadow-[0_18px_30px_rgba(0,0,0,0.35)]"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center"><Package className="size-16 text-muted-foreground" /></div>
                )}
                <div className="absolute left-3 top-3 flex flex-col gap-1.5">
                  <WearBadge float={skin.float} />
                </div>
              </div>
            </div>

            <h2 className="mt-4 font-heading text-lg font-bold text-foreground"><SkinName name={skin.name} /></h2>
            {skin.float != null && (
              <p className="mt-0.5 text-xs text-muted-foreground">Float: <span className="font-semibold text-foreground">{skin.float.toFixed(4)}</span></p>
            )}

            {(skin.float != null || skin.stickers?.length > 0) && (
              <div className="mt-3 border border-border bg-card p-4">
                <FloatStickersDisplay
                  floatValue={skin.float}
                  stickers={(skin.stickers || []).map((s) => ({
                    icon: s.icon,
                    wearPercent: s.wear == null ? 100 : Math.round((1 - s.wear) * 100),
                  }))}
                />
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
