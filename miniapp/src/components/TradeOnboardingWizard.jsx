import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { X, Link2, HelpCircle, ChevronLeft, ChevronRight, AlertTriangle, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { imgSrc } from "../utils";
import { t } from "../i18n";

const TRADE_LINK_PREFIX = "https://steamcommunity.com/tradeoffer/new/";

// Bosqichma-bosqich rasmli yo'riqnoma ko'ruvchi — bitta rasmni to'liq
// ko'rsatadi, prev/next tugmalari va progress ko'rsatkichi bilan. Oxirgi
// rasmga yetganda "Next" tugmasi berilgan `finishLabel`ga almashadi.
function GuideViewer({ images, index, setIndex, onFinish, finishLabel, onBack, backLabel }) {
  if (images === null) {
    return (
      <div className="space-y-3">
        <div className="skeleton aspect-[4/3] w-full" />
        <div className="skeleton mx-auto h-3 w-16" />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="flex size-12 items-center justify-center bg-secondary text-muted-foreground clip-tactical">
          <ImageIcon className="size-6" />
        </span>
        <p className="font-heading text-sm font-bold text-foreground">{t("tradeWizard.guideEmpty")}</p>
        <p className="max-w-xs text-xs text-muted-foreground">{t("tradeWizard.guideEmptyDesc")}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-2 border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          {backLabel}
        </button>
      </div>
    );
  }

  const isLast = index === images.length - 1;
  const current = images[index];

  return (
    <div className="space-y-3">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden border border-border bg-secondary/30">
        <img src={imgSrc(current.image)} alt="" className="size-full object-contain" />
      </div>
      {current.caption && (
        <p className="border border-border bg-secondary/40 px-3 py-2 text-center text-sm text-foreground">{current.caption}</p>
      )}

      <div className="flex items-center justify-center gap-1.5">
        {images.map((im, i) => (
          <span
            key={im.id}
            className={"h-1.5 rounded-full transition-all duration-300 " + (i === index ? "w-6 bg-primary" : "w-1.5 bg-border")}
          />
        ))}
      </div>
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {index + 1} / {images.length}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => (index === 0 ? onBack() : setIndex(index - 1))}
          className="flex flex-1 items-center justify-center gap-1.5 border border-border px-3 py-2.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <ChevronLeft className="size-4" />
          {index === 0 ? backLabel : t("tradeWizard.prev")}
        </button>
        <button
          type="button"
          onClick={() => (isLast ? onFinish() : setIndex(index + 1))}
          className="hover-lift flex flex-1 items-center justify-center gap-1.5 bg-primary px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90"
        >
          {isLast ? finishLabel : t("tradeWizard.next")}
          {!isLast && <ChevronRight className="size-4" />}
        </button>
      </div>
    </div>
  );
}

// Xaridor uchun bir martalik onboarding: Trade Link kiritish + kerak bo'lsa
// qanday olish yo'riqnomasi, so'ng inventar public ekanligini so'rash + kerak
// bo'lsa qanday public qilish yo'riqnomasi. TradeDetail sahifasida inline
// modal sifatida ochiladi (SkinShowcaseModal bilan bir xil "shell" uslubi).
export default function TradeOnboardingWizard({ onDone }) {
  const { showToast } = useApp();
  const [step, setStep] = useState("link");
  const [linkInput, setLinkInput] = useState("");
  const [linkErr, setLinkErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedTradeLink, setSavedTradeLink] = useState(null);

  const [guide1, setGuide1] = useState(null);
  const [guide1Index, setGuide1Index] = useState(0);
  const [guide2, setGuide2] = useState(null);
  const [guide2Index, setGuide2Index] = useState(0);

  useEffect(() => {
    if (step === "guide1" && guide1 === null) {
      api("/api/guides/tradeLink").then((r) => setGuide1(r.images || [])).catch(() => setGuide1([]));
    }
    if (step === "guide2" && guide2 === null) {
      api("/api/guides/publicInventory").then((r) => setGuide2(r.images || [])).catch(() => setGuide2([]));
    }
  }, [step]);

  function close(patch) {
    onDone?.({ tradeLink: savedTradeLink, ...patch });
  }

  async function saveLink() {
    const link = linkInput.trim();
    if (!link.startsWith(TRADE_LINK_PREFIX)) {
      setLinkErr(t("tradeWizard.invalidLink"));
      return;
    }
    setLinkErr("");
    setSaving(true);
    try {
      await api("/api/trade-link", { method: "POST", body: JSON.stringify({ tradeLink: link }) });
      setSavedTradeLink(link);
      setStep("askedReceived");
    } catch (e) {
      showToast(e.error || t("common.genericError"), "err");
    } finally {
      setSaving(false);
    }
  }

  async function confirmPublic() {
    setSaving(true);
    try {
      await api("/api/trade-link", { method: "POST", body: JSON.stringify({ steamPublicConfirmed: true }) });
      close({ steamPublicConfirmed: true });
    } catch (e) {
      showToast(e.error || t("common.genericError"), "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && close({})}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto border-t border-border bg-card p-5 shadow-panel-lg sm:border"
      >
        <button
          type="button"
          onClick={() => close({})}
          aria-label={t("common.close")}
          className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center border border-border bg-card/90 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        {step === "link" && (
          <div className="animate-fade-up space-y-4 pr-8">
            <div className="flex items-center gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center bg-accent/15 text-accent clip-tactical">
                <Link2 className="size-4" />
              </span>
              <h2 className="font-heading text-lg font-bold text-foreground">{t("tradeWizard.linkTitle")}</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{t("tradeWizard.linkDesc")}</p>
            <div>
              <input
                type="text"
                autoFocus
                value={linkInput}
                onChange={(e) => { setLinkInput(e.target.value); setLinkErr(""); }}
                placeholder="https://steamcommunity.com/tradeoffer/new/?partner=..."
                className="w-full border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-accent"
              />
              {linkErr && <p className="mt-1.5 text-xs font-semibold text-destructive">{linkErr}</p>}
            </div>
            <button
              type="button"
              disabled={saving || !linkInput.trim()}
              onClick={saveLink}
              className="hover-lift flex w-full items-center justify-center gap-2 bg-primary py-3 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 disabled:translate-y-0 disabled:opacity-50"
            >
              {saving ? "..." : t("tradeWizard.saveContinue")}
            </button>
            <button
              type="button"
              onClick={() => setStep("guide1")}
              className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-accent underline-offset-2 hover:underline"
            >
              <HelpCircle className="size-3.5" />
              {t("tradeWizard.dontKnowHow")}
            </button>
          </div>
        )}

        {step === "guide1" && (
          <div className="animate-fade-up space-y-3 pr-8">
            <h2 className="font-heading text-base font-bold text-foreground">{t("tradeWizard.guide1Title")}</h2>
            <GuideViewer
              images={guide1}
              index={guide1Index}
              setIndex={setGuide1Index}
              onFinish={() => setStep("link")}
              finishLabel={t("tradeWizard.guide1Done")}
              onBack={() => setStep("link")}
              backLabel={t("tradeWizard.backBtn")}
            />
          </div>
        )}

        {step === "askedReceived" && (
          <div className="animate-fade-up space-y-4 pr-8">
            <div className="flex items-center gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center bg-accent/15 text-accent clip-tactical">
                <CheckCircle2 className="size-4" />
              </span>
              <h2 className="font-heading text-lg font-bold text-foreground">{t("tradeWizard.askedReceivedQ")}</h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={confirmPublic}
                className="hover-lift flex flex-1 items-center justify-center gap-2 bg-success py-3 font-heading text-sm font-bold uppercase tracking-wide text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-success/90 disabled:opacity-50"
              >
                {t("tradeWizard.yes")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setStep("guide2")}
                className="flex flex-1 items-center justify-center gap-2 border border-border py-3 font-heading text-sm font-bold uppercase tracking-wide text-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
              >
                {t("tradeWizard.no")}
              </button>
            </div>
          </div>
        )}

        {step === "guide2" && (
          <div className="animate-fade-up space-y-3 pr-8">
            <h2 className="font-heading text-base font-bold text-foreground">{t("tradeWizard.guide2Title")}</h2>
            <GuideViewer
              images={guide2}
              index={guide2Index}
              setIndex={setGuide2Index}
              onFinish={() => setStep("askedPublic")}
              finishLabel={t("tradeWizard.guide2Done")}
              onBack={() => setStep("askedReceived")}
              backLabel={t("tradeWizard.backBtn")}
            />
          </div>
        )}

        {step === "askedPublic" && (
          <div className="animate-fade-up space-y-4 pr-8">
            <div className="flex items-center gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center bg-accent/15 text-accent clip-tactical">
                <CheckCircle2 className="size-4" />
              </span>
              <h2 className="font-heading text-lg font-bold text-foreground">{t("tradeWizard.askedPublicQ")}</h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={confirmPublic}
                className="hover-lift flex flex-1 items-center justify-center gap-2 bg-success py-3 font-heading text-sm font-bold uppercase tracking-wide text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-success/90 disabled:opacity-50"
              >
                {t("tradeWizard.yes")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setStep("warning")}
                className="flex flex-1 items-center justify-center gap-2 border border-border py-3 font-heading text-sm font-bold uppercase tracking-wide text-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
              >
                {t("tradeWizard.no")}
              </button>
            </div>
          </div>
        )}

        {step === "warning" && (
          <div className="animate-fade-up space-y-4 pr-8">
            <div className="flex items-center gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center bg-warning/15 text-warning clip-tactical">
                <AlertTriangle className="size-4" />
              </span>
              <h2 className="font-heading text-lg font-bold text-warning">{t("tradeWizard.warningTitle")}</h2>
            </div>
            <p className="border border-warning/30 bg-warning/10 p-3 text-sm leading-relaxed text-foreground">
              {t("tradeWizard.warningDesc")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setGuide2Index(0); setStep("guide2"); }}
                className="hover-lift flex flex-1 items-center justify-center gap-2 bg-primary py-3 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90"
              >
                {t("tradeWizard.retry")}
              </button>
              <button
                type="button"
                onClick={() => close({})}
                className="flex flex-1 items-center justify-center gap-2 border border-border py-3 font-heading text-sm font-bold uppercase tracking-wide text-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
              >
                {t("tradeWizard.later")}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
