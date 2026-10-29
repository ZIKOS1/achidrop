// Skin sotish: bot foydalanuvchiga AVTOMATIK trade offer yuboradi va kuzatadi.
//
// Oqim (holat instantSellRequests elementining `tradeOffer` maydonida):
//   queued → sending → sent → accepted | escrow | declined | invalid | canceled | expired
//   queued|sending → failed (foydalanuvchiga eski qo'lda usul ko'rsatiladi)
// Bitta groupId = bitta offer. Bot hech qachon skin BERMAYDI (faqat oladi).
// Pul avtomatik tushmaydi — "accepted"da ham admin "Oldim"ni bosadi.
// Steam ishi `deps.steam` orqali (createSteamAdapter) — testda soxta.
const OFFER_TTL_MS = 60 * 60 * 1000;      // qabul qilinmasa 1 soatda bekor
const QUEUED_MAX_MS = 10 * 60 * 1000;     // akkaunt tayyor bo'lmasa shuncha kutadi

const REJECT_BY_STATE = {
    Declined: ["declined", "Trade rad etildi"],
    Countered: ["declined", "Trade rad etildi"],
    Canceled: ["canceled", "Trade rad etildi"],
    CanceledBySecondFactor: ["canceled", "Trade rad etildi"],
    Expired: ["expired", "Trade rad etildi"],
    InvalidItems: ["invalid", "Skin inventarda topilmadi"],
};

function createWorker({ now, steam, store, notifyAdmins, notifyUser }) {
    const { rejectedText } = require("../backend/instantSellManager");
    const iso = () => new Date(now()).toISOString();

    async function rejectGroup(g, reason) {
        for (const r of g.requests) {
            const res = await store.rejectSellRequest(r.id, reason);
            if (res.request) await notifyUser(r.userId, rejectedText(res.request)).catch(() => {});
        }
    }

    async function recoverStale() {
        await store.refreshRequests();
        for (const g of store.getTradeOfferGroups(["sending"])) {
            if (await store.setTradeOfferState(g.groupId, ["sending"], { state: "failed", error: "Bot qayta ishga tushdi, offer holati noma'lum" })) {
                await notifyAdmins(`⚠️ Skin sotish #${g.groupId}: bot qayta ishga tushdi, trade yuborilgan-yubormaganini Steam'da tekshiring (izoh AchiDrop #${g.groupId}).`, g.requests);
            }
        }
    }

    async function sendQueued() {
        await store.refreshRequests();
        for (const g of store.getTradeOfferGroups(["queued"])) {
            if (!steam.ready()) {
                if (now() - Date.parse(g.requests[0].createdAt) > QUEUED_MAX_MS) {
                    await store.setTradeOfferState(g.groupId, ["queued"], { state: "failed", error: "Trade akkaunt ulanmagan" });
                }
                continue;
            }
            if (!await store.setTradeOfferState(g.groupId, ["queued"], { state: "sending" })) continue;
            const offer = { tradeUrl: g.tradeOffer.tradeUrl, assetIds: g.requests.flatMap(r => r.items.map(i => String(i.assetId))), message: `AchiDrop #${g.groupId}` };
            let offerId = null, error = null;
            for (let attempt = 0; attempt < 2 && !offerId; attempt++) {
                try { offerId = await steam.send(offer); }
                catch (err) { error = err.message; }
            }
            if (offerId) {
                await store.setTradeOfferState(g.groupId, ["sending"], { state: "sent", offerId: String(offerId), sentAt: iso(), error: null });
            } else {
                console.log(`TRADE OFFER #${g.groupId} YUBORILMADI:`, error);
                await store.setTradeOfferState(g.groupId, ["sending"], { state: "failed", error });
                await notifyUser(g.userId, `⚠️ Skin sotish #${g.groupId}: trade'ni avtomatik yuborib bo'lmadi. Saytdagi "Mening so'rovlarim"da ko'rsatilganidek skinni botga o'zingiz yuboring.`).catch(() => {});
            }
        }
    }

    async function pollSent() {
        await store.refreshRequests();
        for (const g of store.getTradeOfferGroups(["sent", "escrow"])) {
            const from = [g.tradeOffer.state];
            const { offerId } = g.tradeOffer;
            // Admin allaqachon "Oldim"/"Rad etish" qilgan — offer endi kerak emas.
            if (g.requests.some(r => r.status !== "awaiting_admin")) {
                await steam.cancel(offerId).catch(() => {});
                await store.setTradeOfferState(g.groupId, from, { state: "canceled" });
                continue;
            }
            let state = null;
            try { state = await steam.getState(offerId); } catch {}

            if (state === "Accepted") {
                if (await store.setTradeOfferState(g.groupId, from, { state: "accepted" })) {
                    await notifyAdmins(`✅ Trade qabul qilindi: AchiDrop #${g.groupId} — skin botda, Steam'da tekshirib "Oldim"ni bosing.`, g.requests);
                }
            } else if (state === "InEscrow") {
                if (from[0] !== "escrow" && await store.setTradeOfferState(g.groupId, from, { state: "escrow" })) {
                    await notifyAdmins(`⏳ AchiDrop #${g.groupId}: trade qabul qilindi, lekin Steam uni HOLD (escrow)ga qo'ydi — skin hali botga kelmagan.`, g.requests);
                }
            } else if (REJECT_BY_STATE[state]) {
                const [next, reason] = REJECT_BY_STATE[state];
                if (await store.setTradeOfferState(g.groupId, from, { state: next })) await rejectGroup(g, reason);
            } else if (from[0] === "sent" && now() - Date.parse(g.tradeOffer.sentAt) > OFFER_TTL_MS) {
                // Active (yoki holatini bilib bo'lmadi) va 1 soat o'tdi.
                await steam.cancel(offerId).catch(() => {});
                if (await store.setTradeOfferState(g.groupId, from, { state: "expired" })) await rejectGroup(g, "Trade 1 soat ichida qabul qilinmadi");
            }
        }
    }

    return { sendQueued, pollSent, recoverStale };
}

// ── Haqiqiy Steam (steam-tradeoffer-manager) ─────────────────────────────────
// session — tradeAccountBridge.loadSession() natijasi. Web cookie refresh token
// bilan olinadi va har 30 daqiqada yangilanadi; rad etilsa onSessionError.
function createSteamAdapter(session, { onSessionError } = {}) {
    const { LoginSession, EAuthTokenPlatformType } = require("steam-session");
    const SteamCommunity = require("steamcommunity");
    const TradeOfferManager = require("steam-tradeoffer-manager");

    const community = new SteamCommunity();
    const manager = new TradeOfferManager({ community, language: "en", pollInterval: -1 });
    let ready = false, timer = null, stopped = false;

    async function refreshCookies() {
        try {
            const ls = new LoginSession(EAuthTokenPlatformType.WebBrowser);
            ls.refreshToken = session.refreshToken;
            const cookies = await ls.getWebCookies();
            await new Promise((resolve, reject) => manager.setCookies(cookies, (err) => err ? reject(err) : resolve()));
            ready = true;
        } catch (err) {
            ready = false;
            console.log("TRADE AKKAUNT SESSIYA XATO:", err.message);
            onSessionError?.(err);
        }
    }

    const call = (fn) => new Promise((resolve, reject) => fn((err, v) => err ? reject(err) : resolve(v)));

    return {
        accountName: session.accountName,
        connectedAt: session.connectedAt,
        async start() {
            await refreshCookies();
            if (!stopped) timer = setInterval(refreshCookies, 30 * 60 * 1000);
        },
        stop() { stopped = true; ready = false; clearInterval(timer); },
        ready: () => ready,
        async send({ tradeUrl, assetIds, message }) {
            const offer = manager.createOffer(tradeUrl);
            offer.addTheirItems(assetIds.map(assetid => ({ appid: 730, contextid: "2", assetid })));
            offer.setMessage(message);
            await call((cb) => offer.send(cb));
            return offer.id;
        },
        async getState(offerId) {
            const offer = await call((cb) => manager.getOffer(offerId, cb));
            return TradeOfferManager.ETradeOfferState[offer.state];
        },
        async cancel(offerId) {
            const offer = await call((cb) => manager.getOffer(offerId, cb));
            await call((cb) => offer.cancel(cb));
        },
    };
}

module.exports = { createWorker, createSteamAdapter, OFFER_TTL_MS };
