// Bir martalik, FAQAT MAHALLIY skript — web serverning bir qismi emas.
// Ishga tushirish: node scripts/steam-2fa-reset.js
//
// OLDINDAN BAJARISH SHART: Steam mobil ilovasi -> Steam Guard -> "Remove
// Authenticator" -> saqlangan Revocation Code (R... bilan boshlanadigan)
// kiritib, ESKI Mobile Authenticatorni o'chirish. Bu skript faqat undan
// KEYIN, hisobga YANGI Mobile Authenticator qo'shadi va shared_secret /
// identity_secret / revocation_code'ni avtomatik .env fayliga yozadi
// (hech qayerga, hech qachon chatga yozilmaydi).
//
// `steamcommunity` paketi ishlatiladi (rasmiy mobil-ilova login usuli) —
// `steam-user`ning enableTwoFactor'i Steam serverida endi ishonchsiz,
// doimiy "status 2 (Fail)" beradi (paket muallifi tomonidan tasdiqlangan).
//
// DIQQAT: yangi authenticator qo'shilishi bilan hisob 15 kunga TO'LIQ
// trade-lock bo'ladi (shu muddat ichida hech qanday skin, na qo'lda na
// avtomatik, yuborib bo'lmaydi).
require("dotenv").config();

const readline       = require("readline");
const fs             = require("fs");
const path           = require("path");
const SteamCommunity = require("steamcommunity");

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

function setEnvVar(content, key, val) {
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(content)) return content.replace(re, `${key}=${val}`);
    return content + `${content.endsWith("\n") || !content ? "" : "\n"}${key}=${val}\n`;
}

function saveSecrets({ shared_secret, identity_secret, revocation_code }) {
    const envPath = path.join(__dirname, "..", ".env");
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    content = setEnvVar(content, "STEAM_SHARED_SECRET", shared_secret);
    content = setEnvVar(content, "STEAM_IDENTITY_SECRET", identity_secret);
    if (revocation_code) content = setEnvVar(content, "STEAM_REVOCATION_CODE", revocation_code);
    fs.writeFileSync(envPath, content);
}

function communityLogin(community, details) {
    return new Promise((resolve, reject) => {
        community.login(details, (err, sessionID, cookies, steamguard) => {
            if (err) return reject(err);
            resolve({ sessionID, cookies, steamguard });
        });
    });
}

function enableTwoFactor(community) {
    return new Promise((resolve, reject) => {
        community.enableTwoFactor((err, response) => err ? reject(err) : resolve(response));
    });
}

function finalizeTwoFactor(community, secret, activationCode) {
    return new Promise((resolve, reject) => {
        community.finalizeTwoFactor(secret, activationCode, (err) => err ? reject(err) : resolve());
    });
}

(async () => {
    console.log("=== Steam Mobile Authenticator qayta o'rnatish ===\n");
    console.log("Eslatma: bu faqat ESKI authenticator Steam ilovasi orqali");
    console.log("Revocation Code bilan allaqachon o'chirilgan bo'lsa ishlaydi.\n");

    const removed = await ask("Eski authenticatorni Steam ilovasi orqali allaqachon o'chirdingizmi? (ha/yoq): ");
    if (removed.trim().toLowerCase() !== "ha") {
        console.log("\nAvval shu qadamni bajaring: Steam mobil ilova -> Steam Guard -> Remove Authenticator -> Revocation Code kiriting.");
        console.log("Shundan keyin bu skriptni qayta ishga tushiring.");
        rl.close();
        process.exit(0);
    }

    console.log("\nDIQQAT: davom etsangiz, hisob DARHOL 15 kunlik to'liq trade-lock bo'ladi.");
    const confirm = await ask("Davom etishni tasdiqlaysizmi? (ha/yoq): ");
    if (confirm.trim().toLowerCase() !== "ha") {
        console.log("Bekor qilindi.");
        rl.close();
        process.exit(0);
    }

    const accountName = await ask("\nSteam login (username): ");
    const password     = await ask("Steam parol: ");

    const community = new SteamCommunity();

    try {
        console.log("\nSteam'ga kirilmoqda...");
        let result;
        try {
            result = await communityLogin(community, { accountName, password, disableMobile: false });
        } catch (err) {
            if (err.message === "SteamGuard") {
                const code = await ask(`📧 Email kodi (${err.emaildomain} ga yuborildi): `);
                result = await communityLogin(community, { accountName, password, disableMobile: false, authCode: code.trim() });
            } else if (err.message === "SteamGuardMobile") {
                const code = await ask("📱 Steam Guard mobil kod: ");
                result = await communityLogin(community, { accountName, password, disableMobile: false, twoFactorCode: code.trim() });
            } else {
                throw err;
            }
        }

        console.log("✅ Steam'ga kirildi.");
        console.log("Yangi Mobile Authenticator qo'shish boshlanmoqda...");

        const addResp = await enableTwoFactor(community);

        console.log("\nTasdiqlash kodi SMS (yoki email) orqali yuborildi.");
        const activationCode = await ask("Tasdiqlash kodini kiriting: ");

        await finalizeTwoFactor(community, addResp.shared_secret, activationCode.trim());

        saveSecrets(addResp);

        console.log("\n✅ Yangi Mobile Authenticator muvaffaqiyatli o'rnatildi.");
        console.log("✅ shared_secret / identity_secret / revocation_code .env fayliga yozildi:");
        console.log("   STEAM_SHARED_SECRET, STEAM_IDENTITY_SECRET, STEAM_REVOCATION_CODE");
        console.log("\n‼️  MUHIM: yangi Revocation Code'ni ALOHIDA xavfsiz joyga (parol menejeriga) ham yozib qo'ying.");
        console.log("‼️  Hisob endi 15 kunlik to'liq trade-lock ostida.");
    } catch (err) {
        console.error("\n❌ Xato:", err.message || err);
        if (err.eresult) console.error("   (eresult:", err.eresult, ")");
    } finally {
        rl.close();
        process.exit(0);
    }
})();
