const test = require("node:test");
const assert = require("node:assert/strict");

const steam = require("../steam");

// steamcommunity.com/inventory/<id>/730/2 javobining qisqartirilgan nusxasi
// (haqiqiy javob shakli, 2026-10-15 kuni tekshirilgan).
const body = {
    assets: [
        { appid: 730, contextid: "2", assetid: "111", classid: "c1", instanceid: "0", amount: "1" },
        { appid: 730, contextid: "2", assetid: "222", classid: "c2", instanceid: "0", amount: "1" },
        { appid: 730, contextid: "2", assetid: "333", classid: "c1", instanceid: "0", amount: "1" },
        { appid: 730, contextid: "2", assetid: "444", classid: "c3", instanceid: "9", amount: "1" },
        { appid: 730, contextid: "2", assetid: "555", classid: "c4", instanceid: "0", amount: "1" },
        { appid: 730, contextid: "2", assetid: "666", classid: "c5", instanceid: "0", amount: "1" },
        { appid: 730, contextid: "2", assetid: "777", classid: "c6", instanceid: "0", amount: "1" },
    ],
    descriptions: [
        {
            classid: "c1", instanceid: "0", tradable: 1, marketable: 1,
            name: "AK-47 | Redline", market_hash_name: "AK-47 | Redline (Field-Tested)",
            icon_url: "ICON1",
            tags: [
                { category: "Exterior", internal_name: "WearCategory2", localized_tag_name: "Field-Tested" },
                { category: "Rarity", internal_name: "Rarity_Legendary_Weapon", localized_tag_name: "Classified" },
            ],
        },
        {
            classid: "c2", instanceid: "0", tradable: 0, marketable: 1,
            name: "Fracture Case", market_hash_name: "Fracture Case", icon_url: "ICON2", tags: [],
        },
        {
            classid: "c3", instanceid: "9", tradable: 1, marketable: 0,
            name: "Service Medal", market_hash_name: "Service Medal", icon_url: "ICON3",
            tags: [{ category: "Type", internal_name: "CSGO_Type_Collectible", localized_tag_name: "Collectible" }],
        },
        {
            // Yangi sotib olingan skin — trade hold (egasi ko'radigan sana bilan)
            classid: "c4", instanceid: "0", tradable: 0, marketable: 0,
            name: "AWP | Atheris", market_hash_name: "AWP | Atheris (Field-Tested)", icon_url: "ICON4",
            owner_descriptions: [{ type: "html", value: "Tradable/Marketable After Oct 23, 2026 (8:00:00) GMT" }],
            tags: [{ category: "Type", internal_name: "CSGO_Type_SniperRifle", localized_tag_name: "Sniper Rifle" }],
        },
        {
            // Trade hold, lekin sana ko'rinmaydi (ochiq inventar) — turi bo'yicha qoladi
            classid: "c5", instanceid: "0", tradable: 0, marketable: 0,
            name: "Glock-18 | Vogue", market_hash_name: "Glock-18 | Vogue (Minimal Wear)", icon_url: "ICON5",
            tags: [{ category: "Type", internal_name: "CSGO_Type_Pistol", localized_tag_name: "Pistol" }],
        },
        {
            // Ishlatilgan (sealed emas) graffiti — hech qachon sotilmaydi
            classid: "c6", instanceid: "0", tradable: 0, marketable: 0,
            name: "Graffiti | Karambit (Dust Brown)", market_hash_name: "Graffiti | Karambit (Dust Brown)", icon_url: "ICON6",
            tags: [{ category: "Type", internal_name: "CSGO_Type_Spray", localized_tag_name: "Graffiti" }],
        },
    ],
    total_inventory_count: 7,
    success: 1,
};

test("parseCommunityInventory: Steam nomi Lis narxi uchun to'g'ridan-to'g'ri olinadi", () => {
    const items = steam.parseCommunityInventory(body);
    const ak = items.find(i => i.assetId === "111");
    assert.equal(ak.marketHashName, "AK-47 | Redline (Field-Tested)");
    assert.equal(ak.name, "AK-47 | Redline");
    assert.equal(ak.wear, "FT");
    assert.equal(ak.float, null);
    assert.equal(ak.tradable, true);
    assert.equal(ak.rarity, "Classified");
    assert.match(ak.image, /^https:\/\/community\.[a-z.]+\/economy\/image\/ICON1/);
});

test("parseCommunityInventory: bir xil classid'li ikki skin ikkita alohida item, lock va sotib bo'lmaydiganlar belgilanadi", () => {
    const items = steam.parseCommunityInventory(body);
    assert.deepEqual(items.map(i => i.assetId), ["111", "222", "333", "444", "555", "666", "777"]);
    assert.equal(items.find(i => i.assetId === "222").tradable, false);
    // medal va ishlatilgan graffiti — ko'rsatiladi, lekin sotib bo'lmaydi
    for (const id of ["444", "777"]) {
        const it = items.find(i => i.assetId === id);
        assert.equal(it.sellable, false);
        assert.equal(it.tradable, false);
    }
    for (const id of ["111", "555", "666"]) assert.equal(items.find(i => i.assetId === id).sellable, true);
});

test("parseCommunityInventory: trade hold'dagi skin qulf bilan ko'rsatiladi, ochilish sanasi o'qiladi", () => {
    const items = steam.parseCommunityInventory(body);
    const awp = items.find(i => i.assetId === "555");
    assert.equal(awp.tradable, false);
    assert.equal(awp.lockedUntil, "2026-10-23T08:00:00.000Z");
    const glock = items.find(i => i.assetId === "666");
    assert.equal(glock.tradable, false);
    assert.equal(glock.lockedUntil, null);
    assert.equal(items.find(i => i.assetId === "111").lockedUntil, null);
});

test("parseCommunityInventory: bo'sh yoki buzilgan javob bo'sh ro'yxat", () => {
    assert.deepEqual(steam.parseCommunityInventory(null), []);
    assert.deepEqual(steam.parseCommunityInventory({ success: 1 }), []);
});

// ── fetchCommunityInventory: yashirin son + token bilan "16" bo'limi ──────────
function fakeGet(pages) {
    // pages: { "2": body, "16": body|blocked }
    return async (url) => {
        const ctx = url.match(/\/730\/(\d+)/)[1];
        const p = pages[ctx];
        if (p === undefined) return { status: 200, text: "" };
        return { status: 200, text: JSON.stringify(p) };
    };
}
const oneAsset = (id, total) => ({
    total_inventory_count: total,
    assets: [{ appid: 730, contextid: "2", assetid: id, classid: "k" + id, instanceid: "0", amount: "1" }],
    descriptions: [{ classid: "k" + id, instanceid: "0", tradable: 1, marketable: 1, name: "Case " + id, market_hash_name: "Case " + id, icon_url: "IC", tags: [] }],
});

test("fetchCommunityInventory: token yo'q — yashirin son hisoblanadi", async () => {
    const items = await steam.fetchCommunityInventory("sidA", true, fakeGet({ "2": oneAsset("1", 3) }));
    assert.equal(items.length, 1);
    assert.deepEqual(steam.communityInventoryMeta("sidA"), { totalCount: 3, hiddenCount: 2 });
});

test("fetchCommunityInventory: token bilan '16' qo'shiladi, yashirin kamayadi", async () => {
    const items = await steam.fetchCommunityInventory("sidB", true, fakeGet({ "2": oneAsset("1", 3), "16": oneAsset("2", 1) }), { token: "tok123" });
    assert.deepEqual(items.map(i => i.assetId).sort(), ["1", "2"]);
    assert.equal(steam.communityInventoryMeta("sidB").hiddenCount, 2); // total 3+1=4, shown 2
});

test("fetchCommunityInventory: '16' egasiga yopiq (rwgrsn) — jim o'tadi", async () => {
    const items = await steam.fetchCommunityInventory("sidC", true, fakeGet({ "2": oneAsset("1", 2), "16": { success: 1, rwgrsn: -2 } }), { token: "bad" });
    assert.equal(items.length, 1);
    assert.equal(steam.communityInventoryMeta("sidC").hiddenCount, 1);
});

test("fetchCommunityInventory: '2' egasiga yopiq bo'lsa ham ishlaydi (bo'sh)", async () => {
    const items = await steam.fetchCommunityInventory("sidD", true, fakeGet({ "2": { success: 1, rwgrsn: -2 } }));
    assert.deepEqual(items, []);
    assert.equal(steam.communityInventoryMeta("sidD").hiddenCount, 0);
});
