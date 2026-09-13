export const tg = window.Telegram?.WebApp || null;
tg?.ready();
tg?.expand();
tg?.disableVerticalSwipes?.();

// Telegram Desktop ba'zan 100dvh'ni noto'g'ri hisoblaydi (oyna balandligi
// bilan mos kelmaydi), bu esa .app balandligini buzib scroll'ni yo'qqa
// chiqaradi. Shu sabab haqiqiy balandlikni JS orqali CSS o'zgaruvchisiga yozamiz.
function syncViewportHeight() {
  const h = tg?.viewportStableHeight || tg?.viewportHeight || window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${h}px`);
}
syncViewportHeight();
tg?.onEvent?.("viewportChanged", syncViewportHeight);
window.addEventListener("resize", syncViewportHeight);

export const initData = tg?.initData || "";

// Dev bypass for testing in a plain browser (no Telegram): /?uid=123456&devkey=...
// devkey must match the server's DEV_BYPASS_SECRET (server.js's devBypassAllowed) —
// added when that check gained the extra secret requirement, otherwise this bypass
// silently 401s with no explanation.
const devUid = new URLSearchParams(location.search).get("uid");
const devKey = new URLSearchParams(location.search).get("devkey");

export async function api(url, opts = {}) {
  const headers = {
    "Content-Type": "application/json",
    "x-init-data": initData,
    ...(devUid ? { "x-dev-uid": devUid, "x-dev-secret": devKey || "" } : {}),
    ...(opts.headers || {}),
  };
  const r = await fetch(url, { ...opts, headers });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw json;
  return json;
}
