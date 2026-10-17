// Auksionda yutilgan skinni g'olibga HAQIQIY, avtomatik Steam trade offer
// sifatida yuborish uchun relay (steam-relay-vps-setup) bilan gaplashuvchi
// klient — steam.js'ning relayFetchInventory() bilan bir xil naqsh.
//
// MUHIM: relay tomonida bu endpointlar (`/trade-offer*`) hali qurilmagan
// (faqat inventar o'qish bor). Shu sabab hozircha har bir chaqiruv xato
// tashlaydi (404/timeout) — withdrawDelivery.js buni tutib, eski qo'lda-admin
// oqimiga qaytadi. Relay qurilgach (identity_secret/shared_secret orqali
// steam-tradeoffer-manager bilan), hech narsa o'zgartirmasdan ishlab ketadi.
//
// Kutilayotgan relay kontrakti:
//   POST /trade-offer            { tradeUrl, assetId }  -> { offerId }
//   GET  /trade-offer/:offerId                          -> { status }
//        status ∈ Active|Accepted|Declined|Canceled|Expired|InvalidItems|Escrow
//   POST /trade-offer/:offerId/cancel                   -> { ok: true }

const RELAY_TIMEOUT_MS = 12_000; // inventar so'rovidan (25s) qisqaroq — relay
                                  // hali tayyor bo'lmasa withdraw so'rovi uzoq kutmasin

function relayBase() {
    const relayUrl    = process.env.STEAM_RELAY_URL;
    const relaySecret = process.env.STEAM_RELAY_SECRET;
    if (!relayUrl || !relaySecret) throw new Error("STEAM_RELAY_URL / STEAM_RELAY_SECRET .env da sozlanmagan");
    return { relayUrl: relayUrl.replace(/\/$/, ""), relaySecret };
}

async function relayRequest(path, options = {}) {
    const { relayUrl, relaySecret } = relayBase();
    const ac    = new AbortController();
    const timer = setTimeout(() => ac.abort(), RELAY_TIMEOUT_MS);
    let resp;
    try {
        resp = await fetch(`${relayUrl}${path}`, {
            ...options,
            headers: { "x-relay-secret": relaySecret, "content-type": "application/json", ...(options.headers || {}) },
            signal: ac.signal,
        });
    } catch (err) {
        throw new Error(err.name === "AbortError" ? "Relay javob bermadi (timeout)" : "Relay bilan bog'lanishda xato: " + err.message);
    } finally {
        clearTimeout(timer);
    }

    const body = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error(body?.error || `Relay xato qaytardi (HTTP ${resp.status})`);
    return body;
}

async function sendTradeOffer(tradeUrl, assetId) {
    const body = await relayRequest("/trade-offer", {
        method: "POST",
        body: JSON.stringify({ tradeUrl, assetId }),
    });
    if (!body?.offerId) throw new Error("Relay offerId qaytarmadi");
    return body.offerId;
}

async function getTradeOfferStatus(offerId) {
    const body = await relayRequest(`/trade-offer/${offerId}`);
    return body?.status || null;
}

async function cancelTradeOffer(offerId) {
    await relayRequest(`/trade-offer/${offerId}/cancel`, { method: "POST" });
}

module.exports = { sendTradeOffer, getTradeOfferStatus, cancelTradeOffer };
