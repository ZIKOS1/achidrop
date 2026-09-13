// Client (../api.js)'dan farqli — bu yerda Telegram initData yo'q, faqat
// login orqali olingan admin_sid cookie (server tomonidan HttpOnly qilib
// o'rnatiladi, shu sabab bu yerda o'qib bo'lmaydi va shart ham emas — fetch
// bir xil origin uchun cookie'ni avtomatik yuboradi).
export async function api(url, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const r = await fetch(url, { ...opts, headers });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw json;
  return json;
}
