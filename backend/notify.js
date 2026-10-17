const { read, write } = require("./database/db");
const { findUserById } = require("./userLifecycle");

// Har bir foydalanuvchiga yuborilgan xabar saqlanadi (Telegram DM ketgan-ketmaganidan
// qat'i nazar) — Steam orqali (Telegramsiz) kirgan foydalanuvchilar buni faqat
// saytning "Bildirishnomalar" bo'limida ko'radi.
function pushNotification(userId, text) {
    const list = read("notifications") || [];
    list.push({
        id:   Date.now() + "-" + Math.random().toString(36).slice(2, 8),
        userId, text,
        date: new Date().toISOString(),
        read: false,
    });
    write("notifications", list);
}

// `userOrId` — foydalanuvchi obyekti (agar allaqachon qo'lda bo'lsa) yoki uning
// ID'si. `sendFn` — chaqiruvchi processga mos Telegram yuboruvchi funksiya
// (bot processida bot.telegram.sendMessage.bind(bot.telegram), server.js'da
// mavjud tgSendMessage). `user.telegramId` bo'lmasa (Steam orqali mustaqil
// kirgan foydalanuvchi), Telegram DM yuborilmaydi — faqat saytda ko'rinadi.
function notifyUser(userOrId, text, sendFn, extra) {
    const user = (userOrId && typeof userOrId === "object") ? userOrId : findUserById(Number(userOrId));
    if (!user) return;

    pushNotification(user.id, text);

    if (user.telegramId && sendFn) {
        try {
            const p = sendFn(user.telegramId, text, extra);
            if (p && typeof p.catch === "function") p.catch(() => {});
        } catch {}
    }
}

module.exports = { notifyUser, pushNotification };
