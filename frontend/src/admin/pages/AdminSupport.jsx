import { useEffect, useRef, useState } from "react";
import { LifeBuoy, Send, CheckCircle2 } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { confirmTg } from "../../utils";
import BackLink from "../../components/BackLink";
import Empty from "../../components/Empty";
import { CardRowsSkeleton } from "../../components/Skeleton";

const POLL_MS = 6000;

function TicketThread({ ticket, onUpdate }) {
  const { showToast } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [ticket.messages.length]);

  async function send() {
    const value = text.trim();
    if (!value) return;
    setText("");
    setBusy(true);
    try {
      const r = await api(`/api/admin/support/${ticket.id}/message`, { method: "POST", body: JSON.stringify({ text: value }) });
      onUpdate(r);
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!(await confirmTg("Bu murojaatni yopmoqchimisiz?"))) return;
    try {
      const r = await api(`/api/admin/support/${ticket.id}/close`, { method: "POST" });
      onUpdate(r);
      showToast("Yopildi", "ok");
    } catch (e) {
      showToast(e.error || "Xato", "err");
    }
  }

  return (
    <div className="space-y-3 border border-border bg-card p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-heading text-sm font-bold text-foreground">{ticket.userName || ticket.userId} — {ticket.lotName}</p>
          <p className="text-[11px] text-muted-foreground">Ticket #{ticket.id} · {ticket.status === "open" ? "Ochiq" : "Yopilgan"}</p>
        </div>
        {ticket.status === "open" && (
          <button type="button" onClick={close} className="flex items-center gap-1.5 bg-success/15 px-3 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/25">
            <CheckCircle2 className="size-3.5" />
            Yopish
          </button>
        )}
      </div>

      {ticket.messages.length > 0 && (
        <div ref={listRef} className="max-h-64 space-y-2 overflow-y-auto border-t border-border pt-2">
          {ticket.messages.map((m, i) => (
            <div key={i} className={"max-w-[85%] " + (m.by === "admin" ? "ml-auto" : "")}>
              <p className={"mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground " + (m.by === "admin" ? "text-right" : "text-left")}>
                {m.by === "system" ? "Tizim" : m.by === "admin" ? (m.name || "Admin") : (ticket.userName || "Foydalanuvchi")}
              </p>
              <div className={"px-3 py-2 text-xs " + (m.by === "admin" ? "bg-primary/15 text-foreground" : "bg-secondary/60 text-foreground")}>
                {m.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {ticket.status === "open" && (
        <div className="flex gap-2 border-t border-border pt-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Javob yozing..."
            className="flex-1 border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={send}
            className="flex items-center justify-center bg-primary px-3 text-primary-foreground disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminSupport() {
  const { navigate } = useApp();
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState(false);
  const pollRef = useRef(null);

  function load() {
    api("/api/admin/support").then(setTickets).catch(() => setError(true));
  }
  useEffect(() => {
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, []);

  function updateTicket(updated) {
    setTickets((prev) => prev && prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  const openCount = tickets?.filter((t) => t.status === "open").length ?? 0;

  return (
    <div className="space-y-6">
      <BackLink onClick={() => navigate("admin")} label="Admin panelga qaytish" />
      <div>
        <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">Qo'llab-quvvatlash</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Avtomatik skin yuborish bir necha marta muvaffaqiyatsiz bo'lgan foydalanuvchilarning "Xatolik bo'lyapti" murojaatlari. {openCount > 0 ? `${openCount} ta ochiq.` : ""}
        </p>
      </div>

      {tickets === null && !error && <CardRowsSkeleton rows={3} />}
      {error && <Empty title="Xato yuz berdi" />}
      {tickets && tickets.length === 0 && (
        <Empty icon={LifeBuoy} title="Hozircha murojaat yo'q" desc="Yordam so'rovlari shu yerda ko'rinadi." />
      )}

      {tickets && tickets.length > 0 && (
        <div className="space-y-4">
          {tickets.map((t) => (
            <TicketThread key={t.id} ticket={t} onUpdate={updateTicket} />
          ))}
        </div>
      )}
    </div>
  );
}
