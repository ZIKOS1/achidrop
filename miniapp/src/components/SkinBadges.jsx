import { cn } from "../lib/cn";
import { wearClasses, wearCode, wearName } from "../utils";

export function WearBadge({ float, short }) {
  if (float == null) return null;
  return (
    <span className={cn("inline-flex items-center border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide backdrop-blur-sm", wearClasses(float))}>
      {short ? wearCode(float) : wearName(float)}
    </span>
  );
}

// Steam'ning market_hash_name'i StatTrak™ itemlar uchun har doim "StatTrak™ "
// prefiksi bilan boshlanadi — shu prefiksni nomning o'zi ichida olov rangida
// (text-warning) ajratib ko'rsatamiz, alohida badge shart emas.
const STATTRAK_PREFIX_RE = /^(StatTrak™?\s*)/;

export function SkinName({ name, className = "" }) {
  const m = STATTRAK_PREFIX_RE.exec(name || "");
  if (!m) return <span className={className}>{name}</span>;
  return (
    <span className={className}>
      <span className="text-warning">{m[1]}</span>
      {name.slice(m[1].length)}
    </span>
  );
}

export function RarityBar({ color, rarity }) {
  // Rang — darajani (rarity) ko'rsatadigan yagona belgi bo'lib qolmasligi
  // uchun ekran o'quvchilari va sichqoncha bosib turganda ko'rinadigan
  // matnli nom ham beriladi (title + aria-label). Endi ozgina "glow" bilan —
  // shu rang faqat ingichka chiziq emas, kartaning yuqori qirrasiga nur
  // beradi (rarity qanchalik yuqori bo'lsa, shuncha "qimmat" ko'rinadi).
  return (
    <span
      className="relative block h-[3px] w-full"
      style={{ backgroundColor: color, boxShadow: `0 0 14px 0 ${color}66` }}
      role={rarity ? "img" : undefined}
      aria-label={rarity || undefined}
      title={rarity || undefined}
    />
  );
}
