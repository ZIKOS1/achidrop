// Haqiqiy foydalanuvchi IP'si. Sayt Cloudflare proksisi orqali ochilsa, Vercel
// ulanishni Cloudflare IP'sidan ko'radi — haqiqiy IP `CF-Connecting-IP`da.
// Bu sarlavhaga FAQAT so'rov rostdan Cloudflare IP'sidan kelganda ishonamiz:
// aks holda Cloudflare'ni chetlab (*.vercel.app) soxta IP yuborib, VPN blok va
// IP limitlarini aylanib o'tish mumkin bo'lardi.
const net = require("net");

// https://www.cloudflare.com/ips/ (2026-10-31)
const CF_V4 = ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"];
const CF_V6 = ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"];

const cloudflare = new net.BlockList();
for (const c of CF_V4) { const [a, p] = c.split("/"); cloudflare.addSubnet(a, Number(p), "ipv4"); }
for (const c of CF_V6) { const [a, p] = c.split("/"); cloudflare.addSubnet(a, Number(p), "ipv6"); }

function isCloudflareIp(ip) {
    ip = String(ip || "").replace(/^::ffff:/, "");
    const type = net.isIP(ip);
    return type ? cloudflare.check(ip, type === 6 ? "ipv6" : "ipv4") : false;
}

// peerIp — Express'ning req.ip'si (Vercel x-forwarded-for'idan), cfHeader — CF-Connecting-IP.
function realClientIp(peerIp, cfHeader) {
    const cf = String(cfHeader || "").trim();
    return cf && net.isIP(cf) && isCloudflareIp(peerIp) ? cf : peerIp;
}

module.exports = { realClientIp, isCloudflareIp };
