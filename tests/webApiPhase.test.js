const test = require("node:test");
const assert = require("node:assert");
const { parseWebApiInventory } = require("../backend/steam");

const knife = (paintindex, phase = null) => ({
    assetid: "1", markethashname: "★ Skeleton Knife | Doppler (Factory New)", marketname: "★ Skeleton Knife | Doppler (Factory New)",
    marketable: true, tradable: true, paintindex, float: { floatvalue: 0.01, paintindex, phase },
});

test("parseWebApiInventory: Doppler fazasi paintindex'dan", () => {
    assert.strictEqual(parseWebApiInventory([knife(415)])[0].phase, "Ruby");
    assert.strictEqual(parseWebApiInventory([knife(419)])[0].phase, "Phase 2");
    assert.strictEqual(parseWebApiInventory([knife(568)])[0].phase, "Emerald");
    assert.strictEqual(parseWebApiInventory([knife(1123)])[0].phase, "Phase 4");
});

test("parseWebApiInventory: noma'lum paintindex — float.phase, aks holda null", () => {
    assert.strictEqual(parseWebApiInventory([knife(9999, "phase3")])[0].phase, "Phase 3");
    assert.strictEqual(parseWebApiInventory([knife(9999, "Black Pearl")])[0].phase, "Black Pearl");
    assert.strictEqual(parseWebApiInventory([knife(1333)])[0].phase, null);
});

test("parseWebApiInventory: faza faqat Doppler nomli skinlarga", () => {
    const it = { ...knife(415), markethashname: "AK-47 | Redline (Field-Tested)", marketname: "AK-47 | Redline (Field-Tested)" };
    assert.strictEqual(parseWebApiInventory([it])[0].phase, null);
});
