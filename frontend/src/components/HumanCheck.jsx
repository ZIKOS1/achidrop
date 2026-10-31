import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    let s = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (!s) {
      s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener("load", () => resolve(window.turnstile));
    s.addEventListener("error", reject);
  });
}

// "Odammisiz?" (admin Sozlamalar → humanCheckEnabled). Cloudflare Turnstile
// token oladi, server tekshirib 24 soatlik cookie beradi — keyin sayt ochiladi.
export default function HumanCheck({ siteKey, onPassed }) {
  const box = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let widgetId = null;
    let alive = true;
    loadTurnstile()
      .then((turnstile) => {
        if (!alive || !box.current) return;
        widgetId = turnstile.render(box.current, {
          sitekey: siteKey,
          callback: async (token) => {
            try {
              await api("/api/human-verify", { method: "POST", body: JSON.stringify({ token }) });
              onPassed();
            } catch {
              setError(true);
              turnstile.reset(widgetId);
            }
          },
          "error-callback": () => setError(true),
        });
      })
      .catch(() => setError(true));
    return () => {
      alive = false;
      if (widgetId != null) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, onPassed]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
      <div className="animate-fade-up w-full max-w-sm border border-border bg-card p-6 text-center shadow-panel-lg">
        <span className="mx-auto mb-3 flex size-12 items-center justify-center bg-primary/15 text-primary shadow-panel clip-tactical">
          <ShieldCheck className="size-6" />
        </span>
        <h2 className="font-heading text-lg font-bold uppercase tracking-wide text-foreground">{t("human.title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("human.desc")}</p>
        <div ref={box} className="mt-5 flex min-h-[65px] justify-center" />
        {error && <p className="mt-3 text-xs text-destructive">{t("human.error")}</p>}
      </div>
    </div>
  );
}
