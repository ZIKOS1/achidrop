// Ro'yxat sahifalarida (Leaderboard, Notifications, BalHistory, BidHistory,
// Admin foydalanuvchilar/inventar ro'yxatlari) spinner o'rniga ko'rsatiladigan
// skeleton qatorlar — haqiqiy `divide-y` ro'yxat bilan bir xil joy egallaydi,
// shu sabab yuklangach sakrash bo'lmaydi.
export function ListSkeleton({ rows = 6, showValue = true }) {
  return (
    <div className="border border-border bg-card shadow-panel-lg">
      <ul className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <span className="skeleton size-9 shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="skeleton h-3.5 w-2/5" />
              <div className="skeleton h-3 w-1/4" />
            </div>
            {showValue && <div className="skeleton h-4 w-14 shrink-0" />}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Inventory/Trade kabi "rasm + ikki qator matn" kartochkali ro'yxatlar uchun.
export function CardRowsSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border border-border bg-card p-3 shadow-panel">
          <span className="skeleton size-14 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-3.5 w-3/5" />
            <div className="skeleton h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Admin Auksionlar/Promolar kabi "rasm-siz, ikki qator matnli" kartochka
// ro'yxatlari uchun (AdminAuctions, AdminPromos).
export function TextCardsSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="skeleton h-4 w-2/5" />
            <div className="skeleton h-4 w-16 shrink-0" />
          </div>
          <div className="skeleton mt-2 h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}

// AdminHome'dagi statistika kartalari uchun (ikonka + katta raqam + label).
export function StatCardsSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-border bg-card p-4">
          <span className="skeleton block size-5" />
          <div className="skeleton mt-3 h-6 w-2/3" />
          <div className="skeleton mt-2 h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

// Bitta profil/forma panelini almashtiradigan umumiy "blok" skeleton —
// AdminUserDetail (profil kartasi), AdminAuctionForm (forma), AdminHome
// (sozlamalar paneli) kabi bitta elementni kutayotgan joylarda.
export function BlockSkeleton({ avatar = false, lines = 3 }) {
  return (
    <div className="border border-border bg-card p-6">
      {avatar && <div className="skeleton mx-auto mb-3 size-16 rounded-full" />}
      <div className={avatar ? "space-y-2 text-center" : "space-y-3"}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className={"skeleton h-4" + (avatar ? " mx-auto w-1/2" : i === 0 ? " w-2/5" : " w-full")} />
        ))}
      </div>
    </div>
  );
}
