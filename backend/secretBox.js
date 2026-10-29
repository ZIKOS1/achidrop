// Maxfiy qiymatlarni (Steam paroli bir zumga, trade akkaunt refresh tokeni)
// Mongo'ga shifrlab yozish. AES-256-GCM, kalit — env TRADE_ACCOUNT_KEY
// (64 hex = 32 bayt), Vercel va VPS'dagi botda bir xil bo'lishi shart.
const crypto = require("crypto");

function envKey() {
    const key = Buffer.from(process.env.TRADE_ACCOUNT_KEY || "", "hex");
    if (key.length !== 32) throw new Error("TRADE_ACCOUNT_KEY sozlanmagan");
    return key;
}

function seal(plain, key = envKey()) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
    return ["v1", iv, cipher.getAuthTag(), data].map(p => typeof p === "string" ? p : p.toString("base64url")).join(".");
}

function open(sealed, key = envKey()) {
    try {
        const [v, iv, tag, data] = String(sealed).split(".");
        if (v !== "v1") throw new Error();
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
    } catch {
        throw new Error("secretBox: ochib bo'lmadi");
    }
}

module.exports = { seal, open };
