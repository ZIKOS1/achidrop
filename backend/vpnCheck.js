// VPN/proksi orqali kirishni bloklash (admin Sozlamalar → `settings.vpnBlockEnabled`).
// IP proxycheck.io orqali tekshiriladi (env PROXYCHECK_KEY — kalitsiz kuniga
// 100 ta, kalit bilan 1000 ta so'rov). Natija xotirada keshlanadi. Xizmat
// javob bermasa yoki limit tugasa — userni BLOKLAMAYMIZ (fail-open).
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 20000;
const TIMEOUT_MS = 2500;

const cache = new Map(); // ip -> { vpn, at }

function isPrivateIp(ip) {
    return !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip.replace(/^::ffff:/, ""));
}

async function lookup(ip, deps) {
    const key = process.env.PROXYCHECK_KEY;
    const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1${key ? `&key=${encodeURIComponent(key)}` : ""}`;
    const r = await deps.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const json = await r.json();
    if (json.status === "error" || json.status === "denied") throw new Error(json.message || json.status);
    return json[ip]?.proxy === "yes";
}

// true — IP VPN/proksi. Xato bo'lsa false (keshlanmaydi, keyingi so'rovda qayta urinadi).
async function isVpnIp(ip, deps = { fetch, now: Date.now }) {
    ip = String(ip || "").replace(/^::ffff:/, "");
    if (isPrivateIp(ip)) return false;
    const hit = cache.get(ip);
    if (hit && deps.now() - hit.at < CACHE_TTL_MS) return hit.vpn;
    let vpn;
    try { vpn = await lookup(ip, deps); }
    catch (err) { console.log("VPN CHECK ERROR:", err.message); return false; }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(ip, { vpn, at: deps.now() });
    return vpn;
}

module.exports = { isVpnIp, _cache: cache };
