// Admin "Moliya" dashboard — Skin sotish (instant sell) bo'yicha hisob.
// Foyda = Lis avtobuy narxi (Lis narxi × 0.9) − foydalanuvchiga to'langan summa.
// Lis narxi taxminiy: Doppler fazalari Lis'da alohida nom emas, shu sabab
// nomning eng arzon e'loni olinadi.

const LIS_AUTOBUY_RATIO = 0.9;
const TZ_OFFSET_MS = 5 * 60 * 60 * 1000; // Toshkent (UTC+5) — kunlarga bo'lish uchun

function dayKey(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return new Date(t + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

// Sof funksiya (testlanadi).
// requests — instantSellRequests; lisUsd — Map(marketHashName -> usd|null);
// holds — getAllHoldsForAdmin() natijasi; users — users ro'yxati.
function buildFinance({ requests, lisUsd, rate, holds, users }) {
    const credited = (requests || []).filter(r => r.status === "credited");
    const usersById = new Map((users || []).map(u => [u.id, u]));

    let paid = 0, lisTotal = 0, pricedPaid = 0, itemCount = 0, missingLis = 0;
    const days = new Map();
    const items = [];

    for (const r of credited) {
        const at = r.resolvedAt || r.createdAt;
        const dk = dayKey(at);
        const usr = usersById.get(r.userId);
        for (const it of r.items || []) {
            itemCount++;
            const price = Number(it.priceSom) || 0;
            paid += price;
            const usd = lisUsd.get(it.marketHashName);
            const lis = usd == null ? null : Math.round(usd * rate * LIS_AUTOBUY_RATIO);
            const profit = lis == null ? null : lis - price;
            if (lis == null) missingLis++;
            else { lisTotal += lis; pricedPaid += price; }

            if (dk) {
                const d = days.get(dk) || { date: dk, items: 0, paid: 0, lis: 0, profit: 0 };
                d.items++;
                d.paid += price;
                if (lis != null) { d.lis += lis; d.profit += profit; }
                days.set(dk, d);
            }
            items.push({
                requestId: r.id, at, userId: r.userId, userName: usr?.name ?? null,
                name: it.name || it.marketHashName, marketHashName: it.marketHashName,
                phase: it.phase || null, imageUrl: it.imageUrl || null,
                paid: price, lis, profit,
            });
        }
    }

    const profit = lisTotal - pricedPaid;
    const owedUsers = (holds || []).map(h => {
        const u = usersById.get(h.userId);
        return {
            userId: h.userId, name: u?.name ?? null, steamId64: u?.steamId64 ?? null,
            frozen: h.frozen, available: h.available, pending: h.pending,
            total: h.frozen + h.available + h.pending, nextUnlockAt: h.nextUnlockAt,
        };
    }).sort((a, b) => b.total - a.total);
    const sum = (k) => owedUsers.reduce((s, x) => s + x[k], 0);
    const unlocks = owedUsers.map(x => x.nextUnlockAt).filter(Boolean).sort();

    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));

    return {
        rate, ratio: LIS_AUTOBUY_RATIO,
        skins: itemCount, requests: credited.length,
        awaiting: (requests || []).filter(r => r.status === "awaiting_admin").length,
        paid, lisTotal, pricedPaid, profit,
        marginPercent: pricedPaid > 0 ? Math.round((profit / pricedPaid) * 1000) / 10 : null,
        missingLis,
        owed: {
            total: sum("total"), frozen: sum("frozen"), available: sum("available"), pending: sum("pending"),
            users: owedUsers.length, nextUnlockAt: unlocks[0] || null, list: owedUsers,
        },
        daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
        items,
    };
}

module.exports = { buildFinance, dayKey, LIS_AUTOBUY_RATIO };
