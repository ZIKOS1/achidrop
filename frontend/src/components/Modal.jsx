import { useEffect, useRef, useState } from "react";

export default function Modal({ modal, onClose }) {
  const inpRef = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!modal.open) return;
    setBusy(false);
    const t = setTimeout(() => inpRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [modal.open]);

  if (!modal.open) return null;

  async function handleOk() {
    const value = inpRef.current?.value ?? "";
    setBusy(true);
    try {
      await modal.onSubmit(value);
    } finally {
      setBusy(false);
    }
  }

  const Icon = modal.icon;
  // "Label: Value" ko'rinishidagi qatorlar (\n bilan ajratilgan) alohida
  // satrlarga bo'lib, label/value'ni vizual ajratib ko'rsatiladi — oddiy
  // paragraf o'rniga skanerlash osonroq bo'lgan "detail row" ko'rinishi.
  const infoLines = typeof modal.info === "string" ? modal.info.split("\n").filter(Boolean) : null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end bg-background/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="animate-fade-up max-h-[85vh] w-full overflow-y-auto border-t border-border bg-card p-5 shadow-panel-lg" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom,0))" }}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/40" />
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          {Icon && (
            <span className="flex size-11 items-center justify-center bg-primary/15 text-primary shadow-[0_0_18px_-4px_color-mix(in_oklch,var(--primary)_60%,transparent)] clip-tactical">
              <Icon className="size-5" />
            </span>
          )}
          <h2 className="font-heading text-lg font-bold uppercase tracking-wide text-foreground">{modal.title}</h2>
        </div>
        {infoLines ? (
          <div className="mb-4 divide-y divide-border border border-border bg-secondary/40">
            {infoLines.map((line, i) => {
              const parts = line.split(/:\s(.+)/);
              const [label, value] = parts.length > 1 ? parts : [null, line];
              return (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  {label ? <span className="text-muted-foreground">{label}</span> : null}
                  <span className={"font-heading font-bold text-foreground" + (label ? "" : " w-full text-center text-muted-foreground")}>{value}</span>
                </div>
              );
            })}
          </div>
        ) : modal.info ? (
          <div className="mb-4 border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">{modal.info}</div>
        ) : null}
        {modal.viewOnly ? (
          <button
            type="button"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 border border-border bg-secondary py-3 font-heading text-sm font-bold uppercase tracking-wide text-foreground"
          >
            Yopish
          </button>
        ) : (
          <>
            {!modal.noInput && <input
              ref={inpRef}
              type={modal.inputType || "text"}
              inputMode={modal.inputType === "number" ? "numeric" : undefined}
              defaultValue={modal.value ?? ""}
              placeholder={modal.placeholder || ""}
              className="mb-3 w-full border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />}
            <button
              type="button"
              disabled={busy}
              onClick={handleOk}
              className="mb-2 flex w-full items-center justify-center gap-2 bg-primary py-3 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
            >
              {busy ? "..." : modal.okLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex w-full items-center justify-center gap-2 border border-border bg-secondary py-3 font-heading text-sm font-bold uppercase tracking-wide text-foreground"
            >
              Bekor qilish
            </button>
          </>
        )}
      </div>
    </div>
  );
}
