// Bir martalik, FAQAT MAHALLIY skript — web serverning bir qismi emas.
// Ishga tushirish: node scripts/steam-login-setup.js
// Steam login/parolingizni so'raydi (hech qayerga saqlanmaydi, faqat shu
// jarayon davomida Steam'ning o'ziga uzatiladi), Steam Guard kodini so'raydi,
// so'ng olingan uzoq muddatli refresh tokenni .env fayliga avtomatik yozadi.
require("dotenv").config();

const readline  = require("readline");
const fs        = require("fs");
const path      = require("path");
const SteamUser = require("steam-user");

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

function saveToEnv(token) {
    const envPath = path.join(__dirname, "..", ".env");
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    if (/^STEAM_REFRESH_TOKEN=.*$/m.test(content)) {
        content = content.replace(/^STEAM_REFRESH_TOKEN=.*$/m, `STEAM_REFRESH_TOKEN=${token}`);
    } else {
        content += `${content.endsWith("\n") || !content ? "" : "\n"}STEAM_REFRESH_TOKEN=${token}\n`;
    }
    fs.writeFileSync(envPath, content);
}

(async () => {
    console.log("🎮 Steam login sozlash — bu bir martalik jarayon.\n");
    const accountName = await ask("Steam login (username): ");
    const password     = await ask("Steam parol: ");

    const client = new SteamUser();

    client.on("steamGuard", async (domain, callback, lastCodeWrong) => {
        if (lastCodeWrong) console.log("⚠️ Oxirgi kod noto'g'ri edi, birozdan keyin qayta urinib ko'ring.");
        const code = await ask(domain ? `📧 Steam Guard kodi (${domain} ga yuborildi): ` : "📱 Steam Guard kodi (mobil ilova): ");
        callback(code.trim());
    });

    client.on("refreshToken", (token) => {
        saveToEnv(token);
        console.log("\n✅ Refresh token .env fayliga yozildi (STEAM_REFRESH_TOKEN).");
        console.log("✅ Endi serverni ishga tushirsangiz, u avtomatik Steam sessiyasidan foydalanadi.");
        client.logOff();
        rl.close();
        process.exit(0);
    });

    client.on("loggedOn", () => {
        console.log("✅ Steam'ga muvaffaqiyatli kirildi.");
    });

    client.on("error", (err) => {
        console.error("❌ Xato:", err.message);
        rl.close();
        process.exit(1);
    });

    client.logOn({ accountName, password });
})();
