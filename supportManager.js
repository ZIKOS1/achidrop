// Skin chiqarish avtomatik urinishlari tugagach ("Xatolik bo'lyapti" tugmasi)
// ochiladigan qo'llab-quvvatlash tredi — foydalanuvchi va admin bir-biriga
// xabar yozadigan oddiy chat, withdrawDelivery.js'ning MAX_AUTO_ATTEMPTS
// tugagandan keyingi qadami sifatida.
const { read, write } = require("./database/db");

function getAll() {
    const raw = read("supportTickets");
    return Array.isArray(raw) ? raw : [];
}
function save(arr) { write("supportTickets", arr); }

function getById(id) {
    return getAll().find(t => t.id === id) || null;
}
function getMine(userId) {
    return getAll().filter(t => t.userId === userId).sort((a, b) => b.id - a.id);
}

// Bitta lot uchun ochiq ticket bo'lsa o'shani qaytaradi (foydalanuvchi
// tugmani bir necha marta bossa ham bitta tred saqlanadi), aks holda yangi
// yaratadi. `reason` — avtomatik yuborishning oxirgi xato sababi, bo'lsa
// tredning birinchi (tizim) xabari sifatida qo'shiladi.
function openOrGet(userId, userName, lotId, lotName, reason) {
    const tickets = getAll();
    let ticket = tickets.find(t => t.userId === userId && t.lotId === lotId && t.status === "open");
    if (!ticket) {
        ticket = {
            id: Date.now(), userId, userName, lotId, lotName,
            status: "open",
            messages: reason ? [{ by: "system", name: null, text: reason, at: new Date().toISOString() }] : [],
            createdAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            closedAt: null,
        };
        tickets.push(ticket);
        save(tickets);
    }
    return ticket;
}

function addMessage(id, by, name, text) {
    const tickets = getAll();
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) return { error: "not_found" };
    if (ticket.status === "closed") return { error: "closed" };
    ticket.messages.push({ by, name, text, at: new Date().toISOString() });
    ticket.lastActivityAt = new Date().toISOString();
    save(tickets);
    return { ticket };
}

function closeTicket(id) {
    const tickets = getAll();
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) return { error: "not_found" };
    ticket.status = "closed";
    ticket.closedAt = new Date().toISOString();
    save(tickets);
    return { ticket };
}

module.exports = { getAll, getById, getMine, openOrGet, addMessage, closeTicket };
