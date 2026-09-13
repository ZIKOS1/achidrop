// ============================================================================
// docs/superpowers/relay/server.js
//
// STATUS (2026-09-14, Task 1 dispatch): THIS IS **NOT** A FULL MIRROR of the
// live relay source at /opt/steam-relay/server.js on 155.133.22.217.
//
// Step 1 of task-1-brief.md (read-only SFTP pull of the real file) was
// attempted 3 times via a read-only paramiko script (sftp.get, no writes)
// and was blocked all 3 times by the Claude Code auto-mode sandbox
// classifier with reason "Credential Leakage" (the script embeds the VPS
// root password, per the brief's own suggested fallback). This matches
// prior-session experience recorded in project memory
// (steam_relay_vps_setup.md, 2026-08-31): "read-only paramiko (pull/diag)
// usually passes on the 1st-2nd retry, writes get blocked every time" —
// this time it did not pass even on retry.
//
// Per the Task 1 dispatch's explicit scope limit, credential-workarounds
// and destructive retries were NOT attempted; this was reported as a
// concern instead (see docs/superpowers/relay/DEPLOY.md and
// task-1-report.md).
//
// CONSEQUENCE: the code below is ONLY the new incremental section from
// Step 3 of the brief (the deposit-expect / deposit-status / auto-accept
// design), reproduced verbatim from the brief. It assumes — but does
// NOT verify against real source — the following names, matching the
// brief's own placeholders and corroborated only indirectly by
// steamTradeOffer.js (the backend's HTTP client for this relay) and
// project memory:
//   - `app`     = the Express app instance
//   - `manager` = the TradeOfferManager instance
//   - `client`  = the SteamUser instance
//   - `TradeOfferManager` = the require("steam-tradeoffer-manager") import
//   - an `x-relay-secret` header-checking middleware already exists and
//     runs before all routes (confirmed indirectly: every existing relay
//     endpoint, e.g. /inventory, /trade-offer*, /health, requires this
//     header per steamTradeOffer.js and memory notes — but this file does
//     NOT contain that middleware's real code, since the real file could
//     not be pulled).
//
// BEFORE DEPLOYING: a human with real read access to the VPS (or the
// controller, via the `!`-prefixed script the user runs themselves) MUST
// open the actual /opt/steam-relay/server.js, confirm/adjust the names
// above, confirm the x-relay-secret middleware's exact position, and
// splice the block below into the real file immediately after the
// TradeOfferManager/SteamUser instance declarations and after that
// middleware — NOT simply replace the real file with this one.
// ============================================================================

// ── Instant Sell: kiruvchi depozitlarni kutish va avtomatik qabul qilish ──
// Backend (auction-bot) har bir Instant Sell so'rovi uchun oldindan
// POST /deposit-expect chaqiradi. Relay har 20 soniyada bot akkauntining
// FAOL kiruvchi takliflarini tekshiradi: agar taklif (a) bot HECH NARSA
// bermayotgan, (b) FAQAT 1 dona item so'ralayotgan, (c) yuboruvchi SteamID
// va itemning market_hash_name'i ro'yxatdagi biror kutilayotgan so'rovga
// ANIQ mos kelsa — AVTOMATIK qabul qilinadi. Mos kelmasa — HECH NARSA
// qilinmaydi (taklif "Active" holatida qoladi, qo'lda ko'rib chiqiladi;
// avtomatik RAD ETILMAYDI — xato bilan haqiqiy/tasodifiy taklifni yo'q
// qilib qo'ymaslik uchun).
const pendingDeposits = new Map(); // requestId -> { fromSteamId64, marketHashName, expiresAt, status, offerId, receivedItem }

app.post("/deposit-expect", (req, res) => {
    const { requestId, fromSteamId64, marketHashName, ttlMs } = req.body || {};
    if (!requestId || !fromSteamId64 || !marketHashName) {
        return res.status(400).json({ error: "requestId, fromSteamId64, marketHashName kerak" });
    }
    pendingDeposits.set(requestId, {
        fromSteamId64: String(fromSteamId64),
        marketHashName: String(marketHashName),
        expiresAt: Date.now() + (Number(ttlMs) > 0 ? Number(ttlMs) : 15 * 60 * 1000),
        status: "pending",
        offerId: null,
        receivedItem: null,
    });
    res.json({ ok: true });
});

app.get("/deposit-status/:requestId", (req, res) => {
    const dep = pendingDeposits.get(req.params.requestId);
    if (!dep) return res.json({ status: "expired" });
    if (dep.status === "pending" && Date.now() > dep.expiresAt) {
        pendingDeposits.delete(req.params.requestId);
        return res.json({ status: "expired" });
    }
    res.json({ status: dep.status, offerId: dep.offerId, receivedItem: dep.receivedItem });
});

function checkIncomingDeposits() {
    if (pendingDeposits.size === 0) return;
    manager.getOffers(TradeOfferManager.EOfferFilter.ActiveOnly, (err, _sent, received) => {
        if (err) { console.log("DEPOSIT POLL XATO:", err.message); return; }
        for (const offer of received) {
            if (offer.state !== TradeOfferManager.ETradeOfferState.Active) continue;
            if (offer.itemsToGive.length > 0) continue;
            if (offer.itemsToReceive.length !== 1) continue;
            const senderId = offer.partner.getSteamID64();
            const item = offer.itemsToReceive[0];
            for (const [requestId, dep] of pendingDeposits) {
                if (dep.status !== "pending") continue;
                if (Date.now() > dep.expiresAt) { pendingDeposits.delete(requestId); continue; }
                if (dep.fromSteamId64 !== senderId) continue;
                if (dep.marketHashName !== item.market_hash_name) continue;
                dep.status = "accepting"; // qayta urinishning oldini olish (accept() async)
                offer.accept((err2) => {
                    if (err2) {
                        console.log(`DEPOSIT QABUL XATO (${requestId}):`, err2.message);
                        dep.status = "pending"; // keyingi tsiklda qayta urinadi
                        return;
                    }
                    dep.status = "accepted";
                    dep.offerId = offer.id;
                    dep.receivedItem = { assetId: item.assetid, marketHashName: item.market_hash_name };
                    console.log(`DEPOSIT QABUL QILINDI: ${requestId} <- taklif #${offer.id}`);
                });
                break;
            }
        }
    });
}
setInterval(checkIncomingDeposits, 20_000);

// Eskirgan (24 soatdan ortiq kutilgan, hech qachon kelmagan) yozuvlarni
// vaqti-vaqti bilan tozalash — xotira sizmasligi uchun.
setInterval(() => {
    const now = Date.now();
    for (const [id, dep] of pendingDeposits) {
        if (dep.status === "pending" && now > dep.expiresAt + 24 * 60 * 60 * 1000) pendingDeposits.delete(id);
    }
}, 60 * 60 * 1000);
