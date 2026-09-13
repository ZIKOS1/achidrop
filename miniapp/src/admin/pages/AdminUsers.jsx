import { useEffect, useState } from "react";
import { Search, Users } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { fmtMoney } from "../../utils";
import BackLink from "../../components/BackLink";
import Empty from "../../components/Empty";
import { ListSkeleton } from "../../components/Skeleton";

export default function AdminUsers() {
  const { navigate } = useApp();
  const [list, setList] = useState(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    api("/api/admin/users").then(setList).catch(() => setError(true));
  }, []);

  const filtered = list
    ? list.filter((u) => {
        const s = q.trim().toLowerCase();
        if (!s) return true;
        return String(u.id).includes(s) || (u.name || "").toLowerCase().includes(s) || (u.username || "").toLowerCase().includes(s);
      })
    : [];

  return (
    <div className="space-y-4">
      <BackLink onClick={() => navigate("admin")} label="Admin panelga qaytish" />
      <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">Foydalanuvchilar</h1>

      <div className="flex items-center gap-2 border border-border bg-secondary px-3 py-2.5 focus-within:border-primary">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ID, ism yoki username bo'yicha qidirish..."
          className="w-full bg-transparent text-sm text-foreground outline-none"
        />
      </div>

      {list === null && !error && <ListSkeleton />}
      {error && <Empty title="Xato yuz berdi" />}
      {list && filtered.length === 0 && <Empty icon={Users} title="Hech kim topilmadi" />}

      {filtered.length > 0 && (
        <div className="border border-border bg-card">
          <ul className="divide-y divide-border">
            {filtered.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => navigate("admin-user-detail", u.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
                >
                  <span
                    className={"size-2 shrink-0 rounded-full " + (u.blocked ? "bg-destructive" : "bg-success")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {u.name}{u.username ? ` (@${u.username})` : ""}
                  </span>
                  {u.blocked && (
                    <span className="shrink-0 border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                      Bloklangan
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtMoney(u.balance || 0)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
