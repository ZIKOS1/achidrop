import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";

const POLL_MS = 5000;

// Avtomatik skin-yuborish takror muvaffaqiyatsiz bo'lgandan keyin
// ("Xatolik bo'lyapti" tugmasi) ochiladigan admin bilan chat — Obmen/Market
// chatidan mustaqil, alohida "supportTickets" ustida ishlaydi (server.js).
export default function SupportChat({ lotId, onClose }) {
  const [ticket, setTicket] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    api("/api/support/withdraw-issue", { method: "POST", body: JSON.stringify({ lotId }) }).then(setTicket);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotId]);

  useEffect(() => {
    if (!ticket) return;
    clearInterval(pollRef.current);
    if (ticket.status !== "closed") {
      pollRef.current = setInterval(() => {
        api(`/api/support/${ticket.id}`).then(setTicket).catch(() => {});
      }, POLL_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [ticket?.id, ticket?.status]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [ticket?.messages?.length]);

  async function send() {
    const value = text.trim();
    if (!value || !ticket) return;
    setText("");
    setBusy(true);
    try {
      const r = await api(`/api/support/${ticket.id}/message`, { method: "POST", body: JSON.stringify({ text: value }) });
      setTicket(r);
    } finally {
      setBusy(false);
    }
  }

  function label(m) {
    if (m.by === "system") return t("support.system");
    if (m.by === "admin") return m.name || t("support.admin");
    return t("support.you");
  }

  return (
    <div className="mt-3 animate-fade-up border-t border-border pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-heading text-xs font-bold uppercase tracking-wide text-foreground">{t("support.title")}</h4>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {!ticket && <p className="text-xs text-muted-foreground">...</p>}

      {ticket && (
        <>
          {ticket.messages.length > 0 && (
            <div ref={listRef} className="mb-2 max-h-48 space-y-2 overflow-y-auto">
              {ticket.messages.map((m, i) => (
                <div key={i} className={"max-w-[85%] " + (m.by === "user" ? "ml-auto" : "")}>
                  <p className={"mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground " + (m.by === "user" ? "text-right" : "text-left")}>
                    {label(m)}
                  </p>
                  <div className={"px-3 py-2 text-xs " + (m.by === "user" ? "bg-primary/15 text-foreground" : "bg-secondary/60 text-foreground")}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
          )}

          {ticket.status === "closed" ? (
            <p className="border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">{t("support.closed")}</p>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-muted-foreground">{t("support.waiting")}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder={t("support.placeholder")}
                  className="flex-1 border border-border bg-secondary px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                />
                <button
                  type="button"
                  disabled={busy || !text.trim()}
                  onClick={send}
                  className="flex items-center justify-center bg-primary px-3 text-primary-foreground disabled:opacity-50"
                >
                  <Send className="size-3.5" />
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
