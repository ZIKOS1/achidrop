const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../frontend/src/lib/itemFilters.js");

test("classifyItem: har bir tur o'z toifasiga tushadi", async () => {
    const { classifyItem } = await load();
    const cases = [
        ["AK-47 | Redline (Field-Tested)", "rifle", "AK-47"],
        ["StatTrak™ AWP | Asiimov (Battle-Scarred)", "sniper", "AWP"],
        ["Souvenir M4A1-S | Knight (Factory New)", "rifle", "M4A1-S"],
        ["★ Karambit | Doppler (Factory New)", "knife", "Karambit"],
        ["★ StatTrak™ M9 Bayonet | Lore (Minimal Wear)", "knife", "M9 Bayonet"],
        ["★ Karambit", "knife", "Karambit"],
        ["★ Sport Gloves | Hedge Maze (Factory New)", "gloves", "Sport Gloves"],
        ["★ Hand Wraps | Slaughter (Field-Tested)", "gloves", "Hand Wraps"],
        ["P250 | Supernova (Factory New)", "pistol", "P250"],
        ["Nova | Hyper Beast (Field-Tested)", "shotgun", "Nova"],
        ["Negev | Bratatat (Minimal Wear)", "machinegun", "Negev"],
        ["MP9 | Hydra (Well-Worn)", "smg", "MP9"],
        ["Sticker | Reason Gaming (Holo) | Katowice 2014", "sticker", "Katowice 2014"],
        ["Sticker | Howling Dawn", "sticker", "Misc"],
        ["Rezan The Ready | Sabre", "agent", "Sabre"],
        ["Special Agent Ava | FBI", "agent", "FBI"],
        ["'Two Times' McCoy | USAF TACP", "agent", "USAF TACP"],
        ["Chroma 2 Case", "case", "Case"],
        ["Operation Breakout Weapon Case", "case", "Case"],
        ["Huntsman Weapon Case", "case", "Case"],
        ["Broken Fang Case", "case", "Case"],
        ["Paris 2023 Legends Sticker Capsule", "case", "Capsule"],
        ["ESL One Cologne 2015 Cobblestone Souvenir Package", "case", "Package"],
        ["Chroma 2 Case Key", "other", "Key"],
        ["Patch | Metal Crown", "other", "Patch"],
        ["Sealed Graffiti | Lambda (Brick Red)", "other", "Graffiti"],
        ["Music Kit | Darude, Moments CS:GO", "other", "Music Kit"],
        ["StatTrak™ Music Kit | Darude, Moments CS:GO", "other", "Music Kit"],
        ["Charm | Die-cast AK", "other", "Charm"],
        ["Name Tag", "other", "Tag"],
        ["Zeus x27 | Olympus (Factory New)", "other", "Zeus x27"],
        ["Dust II Pin", "other", "Collectible"],
    ];
    for (const [name, category, sub] of cases) {
        assert.deepEqual(classifyItem(name), { category, sub }, name);
    }
});

test("applyFilters: Bayonet tanlansa M9 Bayonet chiqmaydi, turlar OR bo'ladi", async () => {
    const { applyFilters, EMPTY_FILTERS } = await load();
    const items = [
        { name: "a", marketHashName: "★ Bayonet | Slaughter (Factory New)" },
        { name: "b", marketHashName: "★ M9 Bayonet | Slaughter (Factory New)" },
        { name: "c", marketHashName: "Chroma 2 Case" },
    ];
    const f = { ...EMPTY_FILTERS, subs: { knife: ["Bayonet"], case: ["Case"] } };
    assert.deepEqual(applyFilters(items, f).map((i) => i.name), ["a", "c"]);
});

test("applyFilters: narx, holat, nodirlik, wear va float birga ishlaydi", async () => {
    const { applyFilters, EMPTY_FILTERS } = await load();
    const items = [
        { name: "a", price: 100, rarity: "Mil-Spec Grade", wear: "FN", float: 0.01, st: "ok" },
        { name: "b", price: 500, rarity: "Covert", wear: "BS", float: 0.8, st: "locked" },
        { name: "c", price: null, rarity: "High Grade", wear: null, float: null, st: "none" },
    ];
    const opts = { priceOf: (i) => i.price, statusOf: (i) => i.st };
    const names = (patch) => applyFilters(items, { ...EMPTY_FILTERS, ...patch }, opts).map((i) => i.name);

    assert.deepEqual(names({}), ["a", "b", "c"]);
    assert.deepEqual(names({ minPrice: "200" }), ["b"]);
    assert.deepEqual(names({ maxPrice: "200" }), ["a"]);
    assert.deepEqual(names({ status: ["locked", "none"] }), ["b", "c"]);
    assert.deepEqual(names({ rarity: ["Mil-Spec"] }), ["a"]);
    assert.deepEqual(names({ rarity: ["High"] }), ["c"]);
    assert.deepEqual(names({ wear: ["NP"] }), ["c"]);
    assert.deepEqual(names({ maxFloat: "0.5" }), ["a"]);
});

test("applyFilters: StatTrak va Souvenir alohida", async () => {
    const { applyFilters, EMPTY_FILTERS } = await load();
    const items = [
        { name: "a", marketHashName: "StatTrak™ AK-47 | Redline (Field-Tested)" },
        { name: "b", marketHashName: "Souvenir AWP | Dragon Lore (Factory New)" },
        { name: "c", marketHashName: "ESL One Cologne 2015 Cobblestone Souvenir Package" },
    ];
    assert.deepEqual(applyFilters(items, { ...EMPTY_FILTERS, special: ["statTrak"] }).map((i) => i.name), ["a"]);
    assert.deepEqual(applyFilters(items, { ...EMPTY_FILTERS, special: ["souvenir"] }).map((i) => i.name), ["b"]);
});

test("buildFacets va countActiveFilters", async () => {
    const { buildFacets, countActiveFilters, EMPTY_FILTERS } = await load();
    const facets = buildFacets([
        { marketHashName: "AK-47 | Redline (Field-Tested)", wear: "FT", rarity: "Classified", imageUrl: "x.png" },
        { marketHashName: "AK-47 | Slate (Field-Tested)", wear: "FT", rarity: "Mil-Spec Grade", imageUrl: "y.png" },
        { marketHashName: "Rezan The Ready | Sabre", rarity: "Master" },
    ]);
    assert.equal(facets.categories.rifle.count, 2);
    assert.deepEqual(facets.categories.rifle.subs.get("AK-47"), { sub: "AK-47", count: 2, image: "x.png" });
    assert.equal(facets.categories.agent.count, 1);
    assert.equal(facets.wear.FT, 2);
    assert.equal(facets.wear.NP, 1);
    assert.equal(facets.rarity["Mil-Spec"], 1);
    assert.equal(facets.hasFloat, false);

    assert.equal(countActiveFilters(EMPTY_FILTERS), 0);
    assert.equal(countActiveFilters({ ...EMPTY_FILTERS, subs: { knife: ["A", "B"] }, minPrice: "1", maxPrice: "2", wear: ["FN"] }), 4);
});
